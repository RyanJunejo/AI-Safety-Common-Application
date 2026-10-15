import { renderEmail } from '../src/alerts/email.js';
import { planAlerts, OPENING_WINDOW_DAYS, type CatalogEvent, type EventType, type Subscriber } from '../src/alerts/plan.js';
import { addDays, utcDay, weekOf } from '../src/catalog/dates.js';
import type { Focus, Kind, Opportunity } from '../src/catalog/types.js';
import { iso, type Db } from './db.js';
import { deliver, enqueue, FUNCTION_BUDGET_MS, type DeliveryStats } from './outbox.js';
import type { EmailSender } from './sender.js';
import type { SyncResult } from './sync.js';
import { unsubscribeUrl } from './tokens.js';

/**
 * The daily alerts job (09:00 UTC): plan today's emails, write them to the outbox,
 * and send everything due. Running it twice in a day is harmless.
 *
 * If today's catalog sync failed, alerts about new and opened listings are held back
 * (the weekly digest catches up later in the week). Deadline reminders for saved
 * listings still go out, unless the catalog is more than a few days stale.
 */

export interface AlertDeps {
  db: Db;
  sender: EmailSender;
  siteUrl: string;
  unsubscribeSecret: string;
  /** Runs the catalog sync, for when today's hasn't run yet (Hobby cron timing can drift). */
  sync?: () => Promise<SyncResult>;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** How long to wait for a sync that's already running. */
  syncWaitMs?: number;
  /** Where to send operational alerts, e.g. a failed sync. */
  opsEmail?: string | null;
  deliveryOptions?: { minIntervalMs?: number; retryDelaysMs?: number[] };
  /** When this run must stop sending (epoch ms). Defaults to the function's time limit from now. */
  deadline?: number;
  log?: (message: string, data?: Record<string, unknown>) => void;
}

export interface AlertRunResult {
  day: string;
  catalogFresh: boolean;
  digestDue: boolean;
  planned: number;
  enqueued: number;
  delivery: DeliveryStats;
}

/** Reminders still go out on a day the sync failed, as long as the catalog is this fresh. */
const MAX_STALE_DAYS = 3;
const EXPIRES_AFTER_HOURS = { daily: 36, digest: 72 } as const;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function todaysSync(db: Db, day: string): Promise<string | null> {
  const rows = await db.query<{ status: string }>(
    `select status from internal.sync_runs where started_at >= $1::date and started_at < $1::date + 1 order by started_at desc limit 1`,
    [day],
  );
  return rows[0]?.status ?? null;
}

async function waitForSync(deps: AlertDeps, day: string): Promise<string | null> {
  const sleep = deps.sleep ?? wait;
  let status = await todaysSync(deps.db, day);
  if (status === null && deps.sync) {
    await deps.sync();
    status = await todaysSync(deps.db, day);
  }
  const until = Date.now() + (deps.syncWaitMs ?? 120_000);
  while (status === 'running' && Date.now() < until) {
    await sleep(5_000);
    status = await todaysSync(deps.db, day);
  }
  return status;
}

async function loadSubscribers(db: Db): Promise<Subscriber[]> {
  const accounts = await db.query<{
    user_id: string;
    email: string;
    kinds: Kind[];
    focus: Focus[];
    any_location: boolean;
    countries: string[];
    remote: boolean;
  }>(
    `select a.user_id, u.email, a.kinds, a.focus, a.any_location, a.countries, a.remote
     from public.accounts a join auth.users u on u.id = a.user_id
     where a.alerts_enabled and u.email is not null and u.email_confirmed_at is not null`,
  );
  const saved = await db.query<{ user_id: string; opportunity_id: string; saved_on: string }>(
    `select s.user_id, s.opportunity_id, (s.saved_at at time zone 'UTC')::date::text as saved_on
     from public.saved_opportunities s join public.accounts a using (user_id) where a.alerts_enabled`,
  );
  const follows = await db.query<{ user_id: string; program_id: string; followed_at: unknown }>(
    `select f.user_id, f.program_id, f.followed_at from public.followed_programs f join public.accounts a using (user_id) where a.alerts_enabled`,
  );
  return accounts.map((a) => ({
    userId: a.user_id,
    email: a.email,
    preferences: {
      kinds: a.kinds,
      focus: a.focus,
      location: { anyLocation: a.any_location, countries: a.countries, remote: a.remote },
    },
    saved: saved.filter((s) => s.user_id === a.user_id).map((s) => ({ opportunityId: s.opportunity_id, savedOn: s.saved_on })),
    follows: follows.filter((f) => f.user_id === a.user_id).map((f) => ({ familyId: f.program_id, since: iso(f.followed_at) })),
  }));
}

export async function runAlerts(deps: AlertDeps): Promise<AlertRunResult> {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => {});
  const startedAt = now();
  const today = utcDay(startedAt);
  // Measured from the start, so time spent waiting for the sync counts against it.
  const deadline = deps.deadline ?? Date.now() + FUNCTION_BUDGET_MS;

  const syncStatus = await waitForSync(deps, today);
  const catalogFresh = syncStatus === 'succeeded';
  const lastGood = await db.query<{ at: unknown }>(`select max(finished_at) as at from internal.sync_runs where status = 'succeeded'`);
  const lastGoodDay = lastGood[0]?.at ? utcDay(new Date(iso(lastGood[0].at))) : null;
  const remindersOk = lastGoodDay !== null && lastGoodDay >= addDays(today, -MAX_STALE_DAYS);

  const [run] = await db.query<{ id: number }>(`insert into internal.alert_runs (day, started_at, suppressed) values ($1, $2, $3) returning id`, [
    today,
    startedAt.toISOString(),
    !catalogFresh,
  ]);
  const runId = Number(run!.id);

  try {
    const weekStart = weekOf(today);
    const digestDone = await db.query(
      `select 1 from internal.alert_runs where day >= $1 and day <= $2 and planned_at is not null and (stats ->> 'digestPlanned')::boolean limit 1`,
      [weekStart, today],
    );
    const digestDue = digestDone.length === 0;

    let planned = 0;
    let enqueued = 0;
    if (catalogFresh || remindersOk) {
      const subscribers = await loadSubscribers(db);
      const opportunities = new Map(
        (await db.query<{ data: Opportunity }>(`select data from public.catalog_items where active`)).map((r) => [r.data.id, r.data] as const),
      );
      const since = addDays(today, -Math.max(OPENING_WINDOW_DAYS, 13));
      const events: CatalogEvent[] = (
        await db.query<{ opportunity_id: string; type: EventType; day: string; at: unknown; baseline: boolean }>(
          `select opportunity_id, type, day::text as day, at, baseline from internal.catalog_events where day >= $1`,
          [since],
        )
      ).map((e) => ({ opportunityId: e.opportunity_id, type: e.type, day: e.day, at: iso(e.at), baseline: e.baseline }));
      const sent = new Set(
        (
          await db.query<{ user_id: string; item_key: string }>(
            `select l.user_id, l.item_key from internal.alert_ledger l join public.accounts a using (user_id)
             where a.alerts_enabled and l.created_at >= $1::date - 60`,
            [today],
          )
        ).map((r) => `${r.user_id}|${r.item_key}`),
      );

      const emails = planAlerts({ today, digestDue, catalogFresh, subscribers, opportunities, events, sent });
      planned = emails.length;
      for (const e of emails) {
        const unsubscribe = unsubscribeUrl(deps.siteUrl, e.userId, deps.unsubscribeSecret);
        const rendered = renderEmail(e, { siteUrl: deps.siteUrl, unsubscribeUrl: unsubscribe });
        const added = await enqueue(db, {
          deliveryKey: e.deliveryKey,
          userId: e.userId,
          kind: e.kind,
          to: e.to,
          ...rendered,
          unsubscribeUrl: unsubscribe,
          expiresAt: new Date(startedAt.getTime() + EXPIRES_AFTER_HOURS[e.kind] * 3_600_000),
          itemKeys: e.itemKeys,
        }, now());
        if (added) enqueued += 1;
      }
      await db.query(`update internal.alert_runs set planned_at = $2, stats = $3::text::jsonb where id = $1`, [
        runId,
        iso(now()),
        JSON.stringify({ digestPlanned: digestDue && catalogFresh, planned, enqueued }),
      ]);
    }

    if (!catalogFresh) {
      await notifyOps(deps, `ops:sync:${today}`, 'SafetyApps: catalog sync did not succeed', [
        `Today's catalog sync (${today}) ended with status: ${syncStatus ?? 'never ran'}.`,
        'Alerts about new and opened listings were held back. Deadline reminders ' + (remindersOk ? 'still went out.' : 'were also held: the catalog is stale.'),
        'See internal.sync_runs for the error.',
      ]);
    }

    const delivery = await deliver({ db, sender: deps.sender, now, sleep: deps.sleep, log, deadline, ...deps.deliveryOptions });
    if (delivery.failed > 0) {
      await notifyOps(deps, `ops:delivery:${today}`, 'SafetyApps: some alert emails failed', [
        `${delivery.failed} email(s) failed for good on ${today}. See internal.alert_outbox where status = 'failed'.`,
      ]);
      await deliver({ db, sender: deps.sender, now, sleep: deps.sleep, log, deadline, ...deps.deliveryOptions });
    }

    // Keep only what dedupe and monitoring need.
    await db.query(`delete from internal.alert_outbox where status in ('sent', 'failed', 'expired') and created_at < $1::timestamptz - interval '30 days'`, [
      startedAt.toISOString(),
    ]);
    await db.query(`delete from internal.alert_ledger where created_at < $1::timestamptz - interval '180 days'`, [startedAt.toISOString()]);

    const result: AlertRunResult = { day: today, catalogFresh, digestDue, planned, enqueued, delivery };
    await db.query(
      `update internal.alert_runs set status = 'succeeded', finished_at = $2, stats = stats || $3::text::jsonb where id = $1`,
      [runId, iso(now()), JSON.stringify({ delivery })],
    );
    log('alerts run finished', { ...result });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db.query(`update internal.alert_runs set status = 'failed', finished_at = $2, error = $3 where id = $1`, [runId, iso(now()), error.slice(0, 2000)]);
    throw err;
  }
}

/** Queues one operational email per key (for example, one per day). */
export async function notifyOps(deps: Pick<AlertDeps, 'db' | 'opsEmail' | 'now'>, key: string, subject: string, lines: string[]): Promise<void> {
  if (!deps.opsEmail) return;
  const text = lines.join('\n\n');
  const html = lines.map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('');
  const at = (deps.now ?? (() => new Date()))();
  await enqueue(deps.db, {
    deliveryKey: key,
    userId: null,
    kind: 'ops',
    to: deps.opsEmail,
    subject,
    html,
    text,
    unsubscribeUrl: null,
    expiresAt: new Date(at.getTime() + 48 * 3_600_000),
  }, at);
}
