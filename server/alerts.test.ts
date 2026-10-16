// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { Feeds } from '../src/catalog/catalog.js';
import { SNAPSHOT_FEEDS } from '../src/catalog/fixtures/index.js';
import { runAlerts, type AlertDeps } from './alerts.js';
import { handleAlertsCron, handleDeleteAccount, handleStatus, handleSyncCron, handleUnsubscribe } from './handlers.js';
import { SendError, type EmailSender, type OutgoingEmail } from './sender.js';
import { runSync } from './sync.js';
import { createTestDb, type TestDb } from './testing/pglite.js';
import { unsubscribeToken, verifyUnsubscribeToken } from './tokens.js';

const SITE = 'https://safetyapps.org';
const SECRET = 'test-unsubscribe-secret';
const MATS_FAMILY = 'training-receOAca5S5nHnSpU';
const ILIAD_JANUARY = 'training-rec49VTc9xWkCdxwB'; // closes 2026-11-16

type Rec = Record<string, unknown>;

/** Records what would be sent. `failures` lists errors to throw on the next sends. */
function fakeSender() {
  const sent: OutgoingEmail[] = [];
  const failures: SendError[] = [];
  const keys = new Set<string>();
  const sender: EmailSender & { sent: OutgoingEmail[]; failures: SendError[] } = {
    sent,
    failures,
    async send(email) {
      const failure = failures.shift();
      if (failure) throw failure;
      // Like Resend: a repeated idempotency key doesn't send again.
      if (!keys.has(email.idempotencyKey)) sent.push(email);
      keys.add(email.idempotencyKey);
      return { id: `msg_${sent.length}` };
    },
  };
  return sender;
}

let db: TestDb;
let sender: ReturnType<typeof fakeSender>;
let ada: string;

const at = (iso: string) => () => new Date(iso);
const noSleep = async () => {};

function withNewMatsRound(feeds: Feeds): Feeds {
  const training = structuredClone(feeds.training) as Rec[];
  const winter = training.find((r) => r.id === 'recYtOVOnv2DW5XTv')!;
  training.push({ ...winter, id: 'recMatsSummer', name: 'MATS: Summer 2027', applicationStatus: 'Open', applicationsClose: '2027-01-10' });
  return { ...feeds, training };
}

function withNewJob(feeds: Feeds): Feeds {
  const jobs = structuredClone(feeds.jobs) as Rec[];
  jobs.push({ ...jobs[0], id: 'recNewJob', name: 'Research Engineer, Evaluations', location: 'Remote (Global)', workLocation: 'Remote', countries: [] });
  return { ...feeds, jobs };
}

function deps(iso: string, extra: Partial<AlertDeps> = {}): AlertDeps {
  return {
    db,
    sender,
    siteUrl: SITE,
    unsubscribeSecret: SECRET,
    opsEmail: 'ops@safetyapps.org',
    now: at(iso),
    sleep: noSleep,
    deliveryOptions: { minIntervalMs: 0, retryDelaysMs: [0, 0] },
    ...extra,
  };
}

const sync = (iso: string, feeds: Feeds = SNAPSHOT_FEEDS) => runSync({ db, fetchFeeds: async () => feeds, now: at(iso) });

async function subscriber(email: string, o: { alerts?: boolean; confirmed?: boolean; saved?: [string, string][]; follows?: [string, string][] } = {}) {
  const id = await db.createUser(email);
  if (o.confirmed === false) await db.query(`update auth.users set email_confirmed_at = null where id = $1`, [id]);
  await db.query(`insert into public.accounts (user_id, alerts_enabled) values ($1, $2)`, [id, o.alerts ?? true]);
  for (const [opp, savedAt] of o.saved ?? []) {
    await db.query(`insert into public.saved_opportunities (user_id, opportunity_id, saved_at) values ($1, $2, $3)`, [id, opp, savedAt]);
  }
  for (const [program, followedAt] of o.follows ?? []) {
    await db.query(`insert into public.followed_programs (user_id, program_id, followed_at) values ($1, $2, $3)`, [id, program, followedAt]);
  }
  return id;
}

beforeEach(async () => {
  db = await createTestDb();
  sender = fakeSender();
  // Baseline on Monday Oct 5, 2026: nothing from it is news.
  await sync('2026-10-05T08:00:00Z');
  ada = await subscriber('ada@example.com', {
    saved: [[ILIAD_JANUARY, '2026-10-06T10:00:00Z']],
    follows: [[MATS_FAMILY, '2026-10-06T10:00:00Z']],
  });
  await subscriber('bob@example.com', { alerts: false, follows: [[MATS_FAMILY, '2026-10-06T10:00:00Z']] });
  await subscriber('cara@example.com', { confirmed: false, follows: [[MATS_FAMILY, '2026-10-06T10:00:00Z']] });
});

describe('the alerts job', () => {
  it('sends nothing about the baseline', async () => {
    await sync('2026-10-12T08:00:00Z');
    const result = await runAlerts(deps('2026-10-12T09:00:00Z'));
    expect(result).toMatchObject({ catalogFresh: true, digestDue: true, planned: 0 });
    expect(sender.sent).toEqual([]);
  });

  it('tells followers when a round opens, once, and only people who opted in', async () => {
    await sync('2026-10-13T08:00:00Z', withNewMatsRound(SNAPSHOT_FEEDS));
    await runAlerts(deps('2026-10-13T09:00:00Z'));
    expect(sender.sent.map((e) => [e.to, e.subject])).toEqual([['ada@example.com', 'Now open: MATS: Summer 2027']]);
    expect(sender.sent[0]!.unsubscribeUrl).toBe(`${SITE}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken(ada, SECRET))}`);

    // Vercel can deliver a cron run twice. The second run sends nothing.
    const again = await runAlerts(deps('2026-10-13T09:00:30Z'));
    expect(again).toMatchObject({ planned: 0, delivery: { sent: 0 } });
    expect(sender.sent).toHaveLength(1);
  });

  it('sends the Monday digest without repeating what a daily alert already said', async () => {
    await sync('2026-10-13T08:00:00Z', withNewMatsRound(SNAPSHOT_FEEDS));
    await runAlerts(deps('2026-10-13T09:00:00Z'));
    await sync('2026-10-14T08:00:00Z', withNewJob(withNewMatsRound(SNAPSHOT_FEEDS)));
    await runAlerts(deps('2026-10-14T09:00:00Z')); // a job has no deadline: it waits for the digest
    expect(sender.sent).toHaveLength(1);

    await sync('2026-10-19T08:00:00Z', withNewJob(withNewMatsRound(SNAPSHOT_FEEDS)));
    await runAlerts(deps('2026-10-19T09:00:00Z'));
    const digest = sender.sent[1]!;
    expect(digest.subject).toBe('1 new match this week: Research Engineer, Evaluations');
    expect(digest.text).not.toContain('MATS: Summer 2027');
    expect(digest.idempotencyKey).toBe(`digest:${ada}:2026-10-19`);
  });

  it('reminds 7 and 2 days before a saved deadline', async () => {
    for (const day of ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-13', '2026-11-14']) {
      await sync(`${day}T08:00:00Z`);
      await runAlerts(deps(`${day}T09:00:00Z`));
    }
    expect(sender.sent.map((e) => e.subject)).toEqual([
      'Closes in 7 days: Iliad Fellowship: January 2027',
      'Closes in 2 days: Iliad Fellowship: January 2027',
    ]);
  });

  it('holds new-listing alerts when the sync fails, tells ops, and catches up after', async () => {
    await runSync({
      db,
      fetchFeeds: async () => {
        throw new Error('training: HTTP 503');
      },
      now: at('2026-10-13T08:00:00Z'),
    });
    const held = await runAlerts(deps('2026-10-13T09:00:00Z'));
    expect(held.catalogFresh).toBe(false);
    expect(sender.sent.map((e) => [e.to, e.subject])).toEqual([['ops@safetyapps.org', 'SafetyApps: catalog sync did not succeed']]);

    await sync('2026-10-14T08:00:00Z', withNewMatsRound(SNAPSHOT_FEEDS));
    await runAlerts(deps('2026-10-14T09:00:00Z'));
    expect(sender.sent.at(-1)!.subject).toBe('Now open: MATS: Summer 2027');
  });

  it('sends a missed Monday digest on Tuesday, once', async () => {
    await sync('2026-10-12T08:00:00Z');
    await runAlerts(deps('2026-10-12T09:00:00Z')); // this week's digest: nothing new yet
    await sync('2026-10-14T08:00:00Z', withNewJob(SNAPSHOT_FEEDS)); // a new job on Wednesday
    await runAlerts(deps('2026-10-14T09:00:00Z')); // jobs wait for the digest
    await runSync({
      db,
      fetchFeeds: async () => {
        throw new Error('training: HTTP 503');
      },
      now: at('2026-10-19T08:00:00Z'),
    });
    await runAlerts(deps('2026-10-19T09:00:00Z')); // Monday: held back
    expect(sender.sent.filter((e) => e.to === 'ada@example.com')).toEqual([]);

    await sync('2026-10-20T08:00:00Z', withNewJob(SNAPSHOT_FEEDS));
    await runAlerts(deps('2026-10-20T09:00:00Z'));
    await sync('2026-10-21T08:00:00Z', withNewJob(SNAPSHOT_FEEDS));
    await runAlerts(deps('2026-10-21T09:00:00Z'));
    const digests = sender.sent.filter((e) => e.idempotencyKey.startsWith('digest:'));
    expect(digests.map((e) => [e.idempotencyKey, e.subject])).toEqual([[`digest:${ada}:2026-10-19`, '1 new match this week: Research Engineer, Evaluations']]);
    expect(digests[0]!.text).toContain('New matches for the week of Oct 19, 2026');
  });

  it('runs the sync itself if the 08:00 run has not happened yet', async () => {
    const result = await runAlerts(deps('2026-10-13T09:00:00Z', { sync: () => sync('2026-10-13T09:00:01Z', withNewMatsRound(SNAPSHOT_FEEDS)) }));
    expect(result.catalogFresh).toBe(true);
    expect(sender.sent.map((e) => e.subject)).toEqual(['Now open: MATS: Summer 2027']);
  });

  it('retries a failed send with the same key, then gives up and tells ops', async () => {
    await sync('2026-10-13T08:00:00Z', withNewMatsRound(SNAPSHOT_FEEDS));
    sender.failures.push(new SendError('Resend 500', true), new SendError('Resend 500', true));
    await runAlerts(deps('2026-10-13T09:00:00Z'));
    expect(sender.sent.map((e) => e.subject)).toEqual(['Now open: MATS: Summer 2027']);

    await sync('2026-10-14T08:00:00Z', withNewJob(withNewMatsRound(SNAPSHOT_FEEDS)));
    await db.query(`update public.saved_opportunities set opportunity_id = 'training-recq5FQB7BoM9CY0X'`); // nothing to remind
    await sync('2026-10-19T08:00:00Z', withNewJob(withNewMatsRound(SNAPSHOT_FEEDS)));
    sender.failures.push(new SendError('Resend 422 validation_error: bad address', false));
    await runAlerts(deps('2026-10-19T09:00:00Z'));
    const [row] = await db.query<{ status: string; last_error: string }>(`select status, last_error from internal.alert_outbox where kind = 'digest'`);
    expect(row).toEqual({ status: 'failed', last_error: 'Resend 422 validation_error: bad address' });
    expect(sender.sent.at(-1)!.subject).toBe('SafetyApps: some alert emails failed');
  });

  it('leaves a transient failure for the next run, which sends it once', async () => {
    await sync('2026-10-13T08:00:00Z', withNewMatsRound(SNAPSHOT_FEEDS));
    sender.failures.push(...Array.from({ length: 3 }, () => new SendError('Resend 503', true)));
    const first = await runAlerts(deps('2026-10-13T09:00:00Z'));
    expect(first.delivery).toMatchObject({ sent: 0, retrying: 1 });
    const retry = await handleAlertsCron(
      new Request(`${SITE}/api/cron/alerts`, { headers: { authorization: 'Bearer cron-secret' } }),
      { ...deps('2026-10-13T10:00:00Z'), cronSecret: 'cron-secret' },
    );
    expect(await retry.json()).toMatchObject({ planned: 0, delivery: { sent: 1 } });
    expect(sender.sent).toHaveLength(1);
  });
});

describe('unsubscribing', () => {
  it('asks first on GET, unsubscribes on POST, and drops queued alerts', async () => {
    const token = unsubscribeToken(ada, SECRET);
    const url = `${SITE}/api/unsubscribe?token=${encodeURIComponent(token)}`;
    const confirm = await handleUnsubscribe(new Request(url), { db, unsubscribeSecret: SECRET, siteUrl: SITE });
    expect(await confirm.text()).toContain('<button type="submit"');
    expect((await db.query<{ alerts_enabled: boolean }>(`select alerts_enabled from public.accounts where user_id = $1`, [ada]))[0]!.alerts_enabled).toBe(true);

    await sync('2026-10-13T08:00:00Z', withNewMatsRound(SNAPSHOT_FEEDS));
    sender.failures.push(...Array.from({ length: 3 }, () => new SendError('Resend 503', true)));
    await runAlerts(deps('2026-10-13T09:00:00Z')); // queued, not yet sent

    // Mail apps' one-click unsubscribe posts "List-Unsubscribe=One-Click".
    const done = await handleUnsubscribe(new Request(url, { method: 'POST', body: 'List-Unsubscribe=One-Click' }), { db, unsubscribeSecret: SECRET, siteUrl: SITE });
    expect(done.status).toBe(200);
    expect(await done.text()).toContain('You’re unsubscribed');

    const after = await runAlerts(deps('2026-10-13T10:00:00Z'));
    expect(after.delivery).toMatchObject({ sent: 0, expired: 1 });
    expect(sender.sent).toEqual([]);
  });

  it('rejects forged tokens', async () => {
    expect(verifyUnsubscribeToken(unsubscribeToken(ada, 'other-secret'), SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`${ada}.short`, SECRET)).toBeNull();
    const res = await handleUnsubscribe(new Request(`${SITE}/api/unsubscribe?token=nope`, { method: 'POST' }), { db, unsubscribeSecret: SECRET, siteUrl: SITE });
    expect(res.status).toBe(400);
  });
});

describe('deleting an account', () => {
  it('checks the access token, then deletes the auth user', async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      calls.push(`${init?.method ?? 'GET'} ${String(url)} apikey=${h.get('apikey')} auth=${h.get('authorization')}`);
      if (String(url).endsWith('/auth/v1/user')) {
        return new Headers(init?.headers).get('authorization') === 'Bearer good' ? Response.json({ id: ada }) : new Response('', { status: 401 });
      }
      await db.query(`delete from auth.users where id = $1`, [ada]); // what Supabase does
      return Response.json({});
    }) as typeof fetch;
    const deps = { supabaseUrl: 'https://proj.supabase.co', anonKey: 'sb_publishable_x', serviceRoleKey: 'sb_secret_y', fetch: fakeFetch };
    const req = (token: string) => new Request(`${SITE}/api/account/delete`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });

    expect((await handleDeleteAccount(req('stolen'), deps)).status).toBe(401);
    expect((await handleDeleteAccount(req('good'), deps)).status).toBe(204);
    expect(calls.at(-1)).toBe(`DELETE https://proj.supabase.co/auth/v1/admin/users/${ada} apikey=sb_secret_y auth=null`);
    expect(await db.query(`select 1 from public.accounts where user_id = $1`, [ada])).toEqual([]);
    expect(await db.query(`select 1 from public.saved_opportunities where user_id = $1`, [ada])).toEqual([]);
  });
});

describe('cron endpoints and monitoring', () => {
  it('reject requests without the cron secret', async () => {
    const req = new Request(`${SITE}/api/cron/sync`, { headers: { authorization: 'Bearer wrong' } });
    const res = await handleSyncCron(req, { db, fetchFeeds: async () => SNAPSHOT_FEEDS, cronSecret: 'cron-secret', sender });
    expect(res.status).toBe(401);
    const unset = await handleSyncCron(new Request(`${SITE}/api/cron/sync`, { headers: { authorization: 'Bearer ' } }), {
      db,
      fetchFeeds: async () => SNAPSHOT_FEEDS,
      cronSecret: undefined,
      sender,
    });
    expect(unset.status).toBe(401);
  });

  it('emails ops right away when a scheduled sync fails', async () => {
    const res = await handleSyncCron(new Request(`${SITE}/api/cron/sync`, { headers: { authorization: 'Bearer cron-secret' } }), {
      db,
      cronSecret: 'cron-secret',
      sender,
      opsEmail: 'ops@safetyapps.org',
      now: at('2026-10-13T08:00:00Z'),
      fetchFeeds: async () => {
        throw new Error('jobs: HTTP 502');
      },
    });
    expect(res.status).toBe(500);
    expect(sender.sent.map((e) => [e.to, e.subject])).toEqual([['ops@safetyapps.org', 'SafetyApps: catalog sync failed']]);
  });

  it('reports health without personal data', async () => {
    await sync('2026-10-13T08:00:00Z');
    await runAlerts(deps('2026-10-13T09:00:00Z'));
    const healthy = await handleStatus(new Request(`${SITE}/api/status`), { db, now: at('2026-10-13T12:00:00Z') });
    expect(healthy.status).toBe(200);
    const body = await healthy.json();
    expect(body).toMatchObject({ ok: true, catalog: { fresh: true, pendingFamilyReviews: 2 }, alerts: { lastRunStatus: 'succeeded', failedLastDay: 0 } });
    expect(JSON.stringify(body)).not.toContain('@');

    const stale = await handleStatus(new Request(`${SITE}/api/status`), { db, now: at('2026-10-15T12:00:00Z') });
    expect(stale.status).toBe(503);
  });
});
