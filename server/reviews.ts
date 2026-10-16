import type { Db } from './db.js';

/**
 * The family review queue: cohorts that might be a round of a recurring program. A
 * decision applies at the next catalog sync. Until then, followers aren't emailed.
 */

export interface PendingReview {
  opportunityId: string;
  title: string;
  url: string;
  candidates: { id: string; title: string | null }[];
}

export async function pendingReviews(db: Db): Promise<PendingReview[]> {
  const rows = await db.query<{ opportunity_id: string; title: string; url: string; candidates: { id: string; title: string | null }[] | null }>(
    `select r.opportunity_id, c.data ->> 'title' as title, c.data ->> 'url' as url,
            (select jsonb_agg(jsonb_build_object('id', f, 'title', (select data ->> 'title' from public.catalog_items where id = f)) order by f)
             from unnest(r.candidates) as f) as candidates
     from internal.family_reviews r join public.catalog_items c on c.id = r.opportunity_id
     where r.status = 'pending' order by r.created_at, r.opportunity_id`,
  );
  return rows.map((r) => ({ opportunityId: r.opportunity_id, title: r.title, url: r.url, candidates: r.candidates ?? [] }));
}

/** Records a decision: a round of `familyId`, or a standalone opportunity when null. */
export async function decideReview(db: Db, opportunityId: string, familyId: string | null, reviewer: string): Promise<void> {
  if (familyId) {
    const family = await db.query(`select 1 from public.catalog_items where id = $1 and family_link = 'family'`, [familyId]);
    if (!family.length) throw new Error(`${familyId} isn't a recurring program in the catalog.`);
  }
  const cohort = await db.query(`select 1 from public.catalog_items where id = $1 and family_link <> 'family'`, [opportunityId]);
  if (!cohort.length) throw new Error(`${opportunityId} isn't a cohort in the catalog.`);
  await db.query(
    `insert into internal.family_reviews (opportunity_id, candidates, status, family_id, decided_at, decided_by)
     values ($1, '{}', $2, $3, now(), $4)
     on conflict (opportunity_id) do update set status = excluded.status, family_id = excluded.family_id,
       decided_at = excluded.decided_at, decided_by = excluded.decided_by`,
    [opportunityId, familyId ? 'linked' : 'standalone', familyId, reviewer],
  );
}
