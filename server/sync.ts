import { buildCatalog, type Feeds } from '../src/catalog/catalog.js';
import { utcDay } from '../src/catalog/dates.js';
import { findDedupeCollisions, formatDedupeError } from '../src/catalog/independent/index.js';
import type { EventType } from '../src/alerts/plan.js';
import { COLLECTIONS, type OpportunityDetail } from '../src/catalog/types.js';
import { iso, type Db } from './db.js';
import { loadIndependentOpportunities } from './independentListings.js';

/**
 * The daily catalog sync (08:00 UTC). Fetches every AISafety.com collection, merges
 * independently researched listings from the repo, normalizes both, and records what
 * changed as catalog events, all in one transaction. If anything fails, the catalog is
 * left as it was and the run is marked failed, which holds back the day's new-listing
 * alerts.
 */

export interface SyncDeps {
  db: Db;
  fetchFeeds: () => Promise<Feeds>;
  /** Override for tests; defaults to `data/independent-listings/*.json`. */
  loadIndependent?: () => OpportunityDetail[] | Promise<OpportunityDetail[]>;
  now?: () => Date;
  log?: (message: string, data?: Record<string, unknown>) => void;
}

export interface SyncStats {
  baseline: boolean;
  items: number;
  independentItems: number;
  events: Partial<Record<EventType, number>>;
  rejected: number;
  duplicates: number;
  pendingReviews: number;
  newReviews: number;
  familiesWithoutRules: string[];
}

export type SyncResult = { status: 'succeeded'; runId: number; stats: SyncStats } | { status: 'failed'; runId: number | null; error: string } | { status: 'skipped'; reason: string };

/** A sync that has been "running" this long crashed. */
const STALE_RUN_MINUTES = 15;
/** A collection that shrinks below this share of its previous size is treated as a bad response. */
const MIN_SHARE_OF_PREVIOUS = 0.5;
/** Rejecting more than this share of a collection means its format changed. */
const MAX_REJECTED_SHARE = 0.1;

/** A cheap fingerprint, to skip rewriting unchanged rows. */
export function contentHash(o: OpportunityDetail): string {
  const s = JSON.stringify(o);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0') + s.length.toString(16);
}

interface ExistingRow {
  id: string;
  status: string;
  deadline: string | null;
  content_hash: string;
  active: boolean;
}

function changes(prev: ExistingRow | undefined, next: OpportunityDetail): { type: EventType; details: Record<string, unknown> }[] {
  if (!prev) return [{ type: 'listed', details: { status: next.status } }];
  const out: { type: EventType; details: Record<string, unknown> }[] = [];
  if (!prev.active) out.push({ type: 'relisted', details: { status: next.status } });
  if (prev.status !== next.status) {
    if (next.status === 'open') out.push({ type: 'opened', details: { from: prev.status } });
    else if (prev.status === 'open' && next.status === 'closed') out.push({ type: 'closed', details: { from: prev.status } });
  }
  if (prev.deadline !== next.deadline && prev.deadline && next.deadline) {
    out.push({ type: 'deadline-changed', details: { from: prev.deadline, to: next.deadline } });
  }
  return out;
}

async function startRun(db: Db, now: Date): Promise<number | null> {
  return db.transaction(async (tx) => {
    await tx.query(
      `update internal.sync_runs set status = 'failed', finished_at = $1, error = 'Stopped without finishing'
       where status = 'running' and started_at < $1::timestamptz - make_interval(mins => $2)`,
      [now.toISOString(), STALE_RUN_MINUTES],
    );
    const rows = await tx.query<{ id: number }>(
      `insert into internal.sync_runs (started_at) values ($1)
       on conflict ((true)) where status = 'running' do nothing returning id`,
      [now.toISOString()],
    );
    return rows[0] ? Number(rows[0].id) : null;
  });
}

export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => {});
  const startedAt = now();
  const runId = await startRun(db, startedAt);
  if (runId === null) return { status: 'skipped', reason: 'Another sync is running' };

  try {
    const feeds = await deps.fetchFeeds();
    const independent = await (deps.loadIndependent ?? loadIndependentOpportunities)();
    const stats = await db.transaction(async (tx) => {
      const decisions = new Map(
        (
          await tx.query<{ opportunity_id: string; family_id: string | null }>(
            `select opportunity_id, family_id from internal.family_reviews where status <> 'pending'`,
          )
        ).map((r) => [r.opportunity_id, r.family_id] as const),
      );
      const catalog = buildCatalog(feeds, decisions);
      const merged = [...catalog.items, ...independent];

      const collisions = findDedupeCollisions(merged);
      if (collisions.length) {
        throw new Error(formatDedupeError(collisions));
      }

      const existing = new Map(
        (
          await tx.query<ExistingRow>(`select id, status, deadline::text as deadline, content_hash, active from public.catalog_items`)
        ).map((r) => [r.id, r]),
      );

      // Guard against a truncated or reformatted AISafety.com feed before touching anything.
      // Independent listings use the `independent-` id prefix and are excluded from these counts.
      for (const collection of COLLECTIONS) {
        const fresh = catalog.items.filter((i) => i.provenance.collection === collection).length;
        const before = [...existing.values()].filter((r) => r.active && r.id.startsWith(`${collection}-`)).length;
        if (before >= 20 && fresh < before * MIN_SHARE_OF_PREVIOUS) {
          throw new Error(`${collection}: ${fresh} listings, down from ${before}. Refusing to apply a feed that shrank this much.`);
        }
        const rejected = catalog.rejected.filter((r) => r.collection === collection).length;
        const total = feeds[collection].length;
        if (total > 0 && rejected / total > MAX_REJECTED_SHARE) {
          throw new Error(`${collection}: ${rejected} of ${total} records could not be read. The source format may have changed.`);
        }
      }

      const baseline =
        (await tx.query(`select 1 from internal.sync_runs where status = 'succeeded' limit 1`)).length === 0;
      const at = startedAt.toISOString();
      const day = utcDay(startedAt);
      const events: { opportunity_id: string; type: EventType; details: Record<string, unknown> }[] = [];
      const upserts: Record<string, unknown>[] = [];

      for (const item of merged) {
        const prev = existing.get(item.id);
        const hash = contentHash(item);
        for (const e of changes(prev, item)) events.push({ opportunity_id: item.id, ...e });
        if (prev && prev.active && prev.content_hash === hash) continue;
        const { description, ...data } = item;
        upserts.push({
          id: item.id,
          kind: item.kind,
          status: item.status,
          deadline: item.deadline,
          family_link: item.familyLink,
          family_id: item.familyId,
          data,
          description,
          content_hash: hash,
        });
      }

      if (upserts.length) {
        await tx.query(
          `insert into public.catalog_items (id, kind, status, deadline, family_link, family_id, data, description, content_hash, active, first_seen_at, last_seen_at, updated_at, removed_at)
           select r.id, r.kind, r.status, r.deadline, r.family_link, r.family_id, r.data, r.description, r.content_hash, true, $2, $2, $2, null
           from jsonb_to_recordset($1::text::jsonb) as r(id text, kind text, status text, deadline date, family_link text, family_id text, data jsonb, description text, content_hash text)
           on conflict (id) do update set
             kind = excluded.kind, status = excluded.status, deadline = excluded.deadline,
             family_link = excluded.family_link, family_id = excluded.family_id, data = excluded.data,
             description = excluded.description, content_hash = excluded.content_hash,
             active = true, updated_at = excluded.updated_at, removed_at = null`,
          [JSON.stringify(upserts), at],
        );
      }

      // Seen = today's AISafety feed plus today's independent files. An independent
      // listing missing from the AISafety feed stays active; removing its file deactivates it.
      const seen = merged.map((i) => i.id);
      await tx.query(`update public.catalog_items set last_seen_at = $2 where id in (select jsonb_array_elements_text($1::text::jsonb))`, [
        JSON.stringify(seen),
        at,
      ]);
      const removed = await tx.query<{ id: string }>(
        `update public.catalog_items set active = false, removed_at = $2
         where active and id not in (select jsonb_array_elements_text($1::text::jsonb)) returning id`,
        [JSON.stringify(seen), at],
      );
      for (const r of removed) events.push({ opportunity_id: r.id, type: 'removed', details: {} });

      if (events.length) {
        await tx.query(
          `insert into internal.catalog_events (sync_run_id, opportunity_id, type, day, at, baseline, details)
           select $2, e.opportunity_id, e.type, $3::date, $4, $5, e.details
           from jsonb_to_recordset($1::text::jsonb) as e(opportunity_id text, type text, details jsonb)`,
          [JSON.stringify(events), runId, day, at, baseline],
        );
      }

      const reviews = catalog.items.filter((i) => i.familyLink === 'review').map((i) => ({ opportunity_id: i.id, candidates: i.familyCandidates }));
      const inserted = reviews.length
        ? await tx.query(
            `insert into internal.family_reviews (opportunity_id, candidates)
             select r.opportunity_id, array(select jsonb_array_elements_text(r.candidates))
             from jsonb_to_recordset($1::text::jsonb) as r(opportunity_id text, candidates jsonb)
             on conflict (opportunity_id) do nothing returning opportunity_id`,
            [JSON.stringify(reviews)],
          )
        : [];
      const pending = await tx.query<{ n: number }>(`select count(*)::int as n from internal.family_reviews where status = 'pending'`);

      const counts: Partial<Record<EventType, number>> = {};
      for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;
      const result: SyncStats = {
        baseline,
        items: merged.length,
        independentItems: independent.length,
        events: counts,
        rejected: catalog.rejected.length,
        duplicates: catalog.duplicates.length,
        pendingReviews: Number(pending[0]?.n ?? 0),
        newReviews: inserted.length,
        familiesWithoutRules: catalog.familiesWithoutRules,
      };
      await tx.query(`update internal.sync_runs set status = 'succeeded', finished_at = $2, baseline = $3, stats = $4::text::jsonb where id = $1`, [
        runId,
        iso(now()),
        baseline,
        JSON.stringify(result),
      ]);
      return result;
    });
    log('catalog sync succeeded', { runId, ...stats });
    return { status: 'succeeded', runId, stats };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db.query(`update internal.sync_runs set status = 'failed', finished_at = $2, error = $3 where id = $1`, [runId, iso(now()), error.slice(0, 2000)]);
    log('catalog sync failed', { runId, error });
    return { status: 'failed', runId, error };
  }
}
