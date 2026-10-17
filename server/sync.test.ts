// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { Feeds } from '../src/catalog/catalog.js';
import { SNAPSHOT_FEEDS } from '../src/catalog/fixtures/index.js';
import { testIndependentOpportunity } from '../src/catalog/independent/testing.js';
import { decideReview, pendingReviews } from './reviews.js';
import { fetchFeeds, SourceError } from './source.js';
import { runSync } from './sync.js';
import { createTestDb, type TestDb } from './testing/pglite.js';

let db: TestDb;
beforeEach(async () => {
  db = await createTestDb();
});

const at = (iso: string) => () => new Date(iso);
type Rec = Record<string, unknown>;

function edit(feeds: Feeds, collection: keyof Feeds, fn: (records: Rec[]) => Rec[]): Feeds {
  return { ...feeds, [collection]: fn(structuredClone(feeds[collection]) as Rec[]) };
}

async function events(): Promise<{ opportunity_id: string; type: string; baseline: boolean }[]> {
  return db.query(`select opportunity_id, type, baseline from internal.catalog_events order by id`);
}

describe('the daily catalog sync', () => {
  it('imports a baseline that will not trigger alerts', async () => {
    const result = await runSync({ db, fetchFeeds: async () => SNAPSHOT_FEEDS, now: at('2026-10-09T08:00:00Z') });
    expect(result).toMatchObject({
      status: 'succeeded',
      stats: { baseline: true, items: 501, independentItems: 0, rejected: 0, newReviews: 2, pendingReviews: 2 },
    });
    const all = await events();
    expect(all).toHaveLength(501);
    expect(all.every((e) => e.type === 'listed' && e.baseline)).toBe(true);

    const [mats] = await db.query<{ status: string; deadline: string; family_id: string; data: { title: string } }>(
      `select status, deadline::text as deadline, family_id, data from public.catalog_items where id = 'training-recYtOVOnv2DW5XTv'`,
    );
    expect(mats).toMatchObject({ status: 'closed', deadline: '2026-09-06', family_id: 'training-receOAca5S5nHnSpU', data: { title: 'MATS: Winter 2027' } });
  });

  it('records listings, openings, deadline changes, and removals on later syncs', async () => {
    await runSync({ db, fetchFeeds: async () => SNAPSHOT_FEEDS, now: at('2026-10-09T08:00:00Z') });

    let next = edit(SNAPSHOT_FEEDS, 'training', (rs) => {
      const aisc = rs.find((r) => r.id === 'reckWsALZPAMuVINC')!; // AI Safety Camp: not yet open
      Object.assign(aisc, { applicationStatus: 'Open', notYetOpen: false });
      const iliad = rs.find((r) => r.id === 'rec49VTc9xWkCdxwB')!; // Iliad Fellowship: January 2027
      iliad.applicationsClose = '2026-11-23';
      rs.push({ ...rs.find((r) => r.id === 'recYtOVOnv2DW5XTv'), id: 'recMatsSummer', name: 'MATS: Summer 2027', applicationStatus: 'Open', applicationsClose: '2027-01-10' });
      return rs;
    });
    next = edit(next, 'jobs', (rs) => rs.slice(1));

    const result = await runSync({ db, fetchFeeds: async () => next, now: at('2026-10-10T08:00:00Z') });
    expect(result).toMatchObject({ status: 'succeeded', stats: { baseline: false, events: { opened: 1, listed: 1, 'deadline-changed': 1, removed: 1 } } });
    const fresh = (await events()).filter((e) => !e.baseline);
    expect(fresh.map((e) => [e.opportunity_id, e.type]).sort()).toEqual(
      [
        ['training-reckWsALZPAMuVINC', 'opened'],
        ['training-rec49VTc9xWkCdxwB', 'deadline-changed'],
        ['training-recMatsSummer', 'listed'],
        [`jobs-${(SNAPSHOT_FEEDS.jobs[0] as Rec).id}`, 'removed'],
      ].sort(),
    );
    const [summer] = await db.query<{ family_link: string; family_id: string }>(`select family_link, family_id from public.catalog_items where id = 'training-recMatsSummer'`);
    expect(summer).toEqual({ family_link: 'linked', family_id: 'training-receOAca5S5nHnSpU' });
    const [gone] = await db.query<{ active: boolean }>(`select active from public.catalog_items where id = $1`, [`jobs-${(SNAPSHOT_FEEDS.jobs[0] as Rec).id}`]);
    expect(gone!.active).toBe(false);
  });

  it('changes nothing and records the failure when the source is down', async () => {
    await runSync({ db, fetchFeeds: async () => SNAPSHOT_FEEDS, now: at('2026-10-09T08:00:00Z') });
    const before = await db.query(`select id, content_hash, active from public.catalog_items order by id`);
    const result = await runSync({
      db,
      fetchFeeds: async () => {
        throw new SourceError('jobs', 'HTTP 503');
      },
      now: at('2026-10-10T08:00:00Z'),
    });
    expect(result).toMatchObject({ status: 'failed', error: 'jobs: HTTP 503' });
    expect(await db.query(`select id, content_hash, active from public.catalog_items order by id`)).toEqual(before);
    const runs = await db.query<{ status: string; error: string | null }>(`select status, error from internal.sync_runs order by id`);
    expect(runs.map((r) => r.status)).toEqual(['succeeded', 'failed']);
  });

  it('refuses a feed that suddenly shrank, rather than removing half the catalog', async () => {
    await runSync({ db, fetchFeeds: async () => SNAPSHOT_FEEDS, now: at('2026-10-09T08:00:00Z') });
    const result = await runSync({ db, fetchFeeds: async () => edit(SNAPSHOT_FEEDS, 'communities', (rs) => rs.slice(0, 40)), now: at('2026-10-10T08:00:00Z') });
    expect(result).toMatchObject({ status: 'failed', error: expect.stringContaining('communities: 40 listings, down from 256') });
    expect(await db.query(`select 1 from public.catalog_items where not active`)).toEqual([]);
  });

  it('refuses a feed whose format changed', async () => {
    const broken = edit(SNAPSHOT_FEEDS, 'courses', (rs) => rs.map((r) => ({ ...r, name: undefined })));
    const result = await runSync({ db, fetchFeeds: async () => broken, now: at('2026-10-09T08:00:00Z') });
    expect(result).toMatchObject({ status: 'failed', error: expect.stringContaining('courses: 29 of 29 records could not be read') });
  });

  it('runs one sync at a time, and recovers from a crashed run', async () => {
    await db.query(`insert into internal.sync_runs (started_at) values ('2026-10-09T07:59:00Z')`);
    expect(await runSync({ db, fetchFeeds: async () => SNAPSHOT_FEEDS, now: at('2026-10-09T08:00:00Z') })).toEqual({
      status: 'skipped',
      reason: 'Another sync is running',
    });
    expect(await runSync({ db, fetchFeeds: async () => SNAPSHOT_FEEDS, now: at('2026-10-09T08:30:00Z') })).toMatchObject({ status: 'succeeded' });
  });

  it('imports independently researched listings and keeps them when they are absent from AISafety.com', async () => {
    const independent = testIndependentOpportunity({ id: 'survives-sync' });
    const first = await runSync({
      db,
      fetchFeeds: async () => SNAPSHOT_FEEDS,
      loadIndependent: () => [independent],
      now: at('2026-10-09T08:00:00Z'),
    });
    expect(first).toMatchObject({ status: 'succeeded', stats: { independentItems: 1, items: 502 } });
    const [row] = await db.query<{ active: boolean; data: { provenance: { source: string; listingUrl: string } } }>(
      `select active, data from public.catalog_items where id = 'independent-survives-sync'`,
    );
    expect(row).toMatchObject({
      active: true,
      data: { provenance: { source: 'independent research', listingUrl: independent.provenance.listingUrl } },
    });

    // Later AISafety-only sync still includes the independent file → row stays active.
    const second = await runSync({
      db,
      fetchFeeds: async () => SNAPSHOT_FEEDS,
      loadIndependent: () => [independent],
      now: at('2026-10-10T08:00:00Z'),
    });
    expect(second).toMatchObject({ status: 'succeeded' });
    expect(await db.query(`select active from public.catalog_items where id = 'independent-survives-sync'`)).toEqual([{ active: true }]);
    // Still absent from the AISafety feed, but not soft-deleted.
    expect(await db.query(`select 1 from public.catalog_items where id = 'independent-survives-sync' and not active`)).toEqual([]);
  });

  it('does not let independent listings confuse the AISafety.com shrink check', async () => {
    const extra = testIndependentOpportunity({ id: 'shrink-extra' });
    await runSync({
      db,
      fetchFeeds: async () => SNAPSHOT_FEEDS,
      loadIndependent: () => [extra],
      now: at('2026-10-09T08:00:00Z'),
    });
    // Communities still shrinks sharply relative to the AISafety-only prior count
    // (independent rows use the independent- prefix and are ignored by the guard).
    const result = await runSync({
      db,
      fetchFeeds: async () => edit(SNAPSHOT_FEEDS, 'communities', (rs) => rs.slice(0, 40)),
      loadIndependent: () => [extra],
      now: at('2026-10-10T08:00:00Z'),
    });
    expect(result).toMatchObject({ status: 'failed', error: expect.stringContaining('communities: 40 listings, down from 256') });
    expect(await db.query(`select active from public.catalog_items where id = 'independent-shrink-extra'`)).toEqual([{ active: true }]);
  });

  it('fails when an independent listing duplicates an AISafety.com listing', async () => {
    // Pull the real snapshot row's org/url/title so the dedupe key matches.
    const baseline = await runSync({ db, fetchFeeds: async () => SNAPSHOT_FEEDS, loadIndependent: () => [], now: at('2026-10-09T08:00:00Z') });
    expect(baseline).toMatchObject({ status: 'succeeded' });
    const [mats] = await db.query<{ data: { title: string; organization: string | null; url: string } }>(
      `select data from public.catalog_items where id = 'training-recYtOVOnv2DW5XTv'`,
    );
    const dup = testIndependentOpportunity({
      id: 'dup-mats-winter',
      title: mats!.data.title,
      organization: mats!.data.organization,
      url: mats!.data.url,
      officialUrl: mats!.data.url,
      round: null,
    });
    const result = await runSync({
      db,
      fetchFeeds: async () => SNAPSHOT_FEEDS,
      loadIndependent: () => [dup],
      now: at('2026-10-10T08:00:00Z'),
    });
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error).toMatch(/Duplicate listings/);
      expect(result.error).toContain('independent-dup-mats-winter');
      expect(result.error).toContain('training-recYtOVOnv2DW5XTv');
    }
    // Catalog unchanged after the failed run.
    expect(await db.query(`select 1 from public.catalog_items where id = 'independent-dup-mats-winter'`)).toEqual([]);
  });

  it('deactivates an independent listing only when its file disappears', async () => {
    const listing = testIndependentOpportunity({ id: 'will-remove' });
    await runSync({
      db,
      fetchFeeds: async () => SNAPSHOT_FEEDS,
      loadIndependent: () => [listing],
      now: at('2026-10-09T08:00:00Z'),
    });
    const result = await runSync({
      db,
      fetchFeeds: async () => SNAPSHOT_FEEDS,
      loadIndependent: () => [],
      now: at('2026-10-10T08:00:00Z'),
    });
    expect(result).toMatchObject({ status: 'succeeded', stats: { events: { removed: 1 } } });
    expect(await db.query(`select active from public.catalog_items where id = 'independent-will-remove'`)).toEqual([{ active: false }]);
  });

  it('applies a reviewer’s family decision on the next sync', async () => {
    await runSync({ db, fetchFeeds: async () => SNAPSHOT_FEEDS, now: at('2026-10-09T08:00:00Z') });
    const id = 'training-recGWWVQtDTQv4LL7'; // Effective Thesis Accelerator
    expect(await pendingReviews(db)).toEqual([
      {
        opportunityId: 'training-recGWWVQtDTQv4LL7',
        title: 'Effective Thesis Accelerator: Fall 2026',
        url: 'https://www.effectivethesis.org/key-services/8-week-accelerator',
        candidates: [{ id: 'training-recU9TIvuBwGmPSwF', title: 'Effective Thesis Fellowship' }],
      },
      {
        opportunityId: 'training-recIFwsLWf646S3hn',
        title: 'CBAI AIxBiosecurity Research Fellowship: Fall 2026',
        url: 'https://www.cbai.ai/aixbiosecurity-fellowship-program',
        candidates: [
          { id: 'training-rec7eRVZBrTF7JLor', title: 'CBAI Research Fellowship' },
          { id: 'training-recLAzcPCI6At1MOE', title: 'CAMBRIA' },
        ],
      },
    ]);
    await expect(decideReview(db, id, 'training-recYtOVOnv2DW5XTv', 'ryan')).rejects.toThrow("isn't a recurring program");
    await decideReview(db, id, 'training-recU9TIvuBwGmPSwF', 'ryan');
    await decideReview(db, 'training-recIFwsLWf646S3hn', null, 'ryan');
    expect(await pendingReviews(db)).toEqual([]);
    await runSync({ db, fetchFeeds: async () => SNAPSHOT_FEEDS, now: at('2026-10-10T08:00:00Z') });
    expect(await db.query(`select family_link from public.catalog_items where id = 'training-recIFwsLWf646S3hn'`)).toEqual([{ family_link: 'none' }]);
    expect(await db.query(`select family_link, family_id from public.catalog_items where id = $1`, [id])).toEqual([
      { family_link: 'linked', family_id: 'training-recU9TIvuBwGmPSwF' },
    ]);
  });
});

describe('fetching the source', () => {
  const ok = (data: unknown[]) => new Response(JSON.stringify({ data, meta: { count: data.length } }), { status: 200 });
  const noSleep = async () => {};

  it('retries transient errors and rejects incomplete responses', async () => {
    let calls = 0;
    const feeds = await fetchFeeds({
      sleep: noSleep,
      fetch: async (url) => {
        calls += 1;
        if (String(url).endsWith('/jobs') && calls < 6) return new Response('busy', { status: 503 });
        return ok([{ id: 'rec1' }]);
      },
    });
    expect(feeds.jobs).toEqual([{ id: 'rec1' }]);

    await expect(
      fetchFeeds({ sleep: noSleep, fetch: async () => new Response(JSON.stringify({ data: [], meta: { count: 3 } })) }),
    ).rejects.toThrow('incomplete response: 0 of 3 records');
    await expect(fetchFeeds({ sleep: noSleep, fetch: async () => new Response('nope', { status: 404 }) })).rejects.toThrow('HTTP 404');
  });
});
