// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { handleStatus } from './handlers.js';
import { createTestDb, type TestDb } from './testing/pglite.js';

const HOUR = 3_600_000;
let db: TestDb;
let now: number;

beforeEach(async () => {
  db = await createTestDb();
  // Outbox rows get the database's real now(), so status is checked relative to it.
  now = Date.now();
});

const ago = (hours: number) => new Date(now - hours * HOUR).toISOString();

async function check() {
  const res = await handleStatus(new Request('https://safetyapps.org/api/status'), { db, now: () => new Date(now) });
  return { status: res.status, body: (await res.json()) as { problems: string[]; alerts: { lastRunStatus: string | null } } };
}

async function syncedAt(hours: number) {
  await db.query(`insert into internal.sync_runs (started_at, finished_at, status) values ($1, $1, 'succeeded')`, [ago(hours)]);
}

async function alertRun(hours: number, status: 'running' | 'succeeded' | 'failed') {
  await db.query(`insert into internal.alert_runs (day, started_at, finished_at, status) values ($1::timestamptz::date, $1, case when $2 = 'running' then null else $1::timestamptz end, $2)`, [
    ago(hours),
    status,
  ]);
}

describe('the status endpoint', () => {
  it('is healthy when the sync and the alerts job both finished in the last day', async () => {
    await syncedAt(2);
    await alertRun(1, 'succeeded');
    expect(await check()).toMatchObject({ status: 200, body: { problems: [] } });
  });

  it('is healthy right after launch, before the first alerts run', async () => {
    await syncedAt(0.5);
    expect((await check()).status).toBe(200);
  });

  it('notices an alerts job that stopped without finishing', async () => {
    await syncedAt(2);
    await alertRun(30, 'succeeded');
    await alertRun(4 * 24, 'running');
    expect(await check()).toMatchObject({ status: 503 });
    // A run that's still within its time limit is fine.
    await db.query(`delete from internal.alert_runs`);
    await alertRun(0.05, 'running');
    await alertRun(20, 'succeeded');
    expect((await check()).status).toBe(200);
  });

  it('notices when the alerts job hasn’t run for over a day', async () => {
    await syncedAt(2);
    await alertRun(30, 'succeeded');
    const { status, body } = await check();
    expect(status).toBe(503);
    expect(body.problems).toContain('alerts job hasn’t finished in the last day');
  });

  it('notices an abandoned latest run even when an older run succeeded', async () => {
    await syncedAt(2);
    await alertRun(10, 'succeeded');
    await alertRun(2, 'running');
    const { status, body } = await check();
    expect(status).toBe(503);
    expect(body.alerts.lastRunStatus).toBe('abandoned');
  });

  it('notices emails stuck in the outbox', async () => {
    await syncedAt(2);
    await alertRun(1, 'succeeded');
    await db.query(
      `insert into internal.alert_outbox (delivery_key, kind, to_email, subject, html, text_body, expires_at, created_at)
       values ('old', 'digest', 'a@example.com', 's', 'h', 't', $1, $2)`,
      [new Date(now + 24 * HOUR).toISOString(), ago(30)],
    );
    const { status, body } = await check();
    expect(status).toBe(503);
    expect(body.problems).toEqual(['emails stuck in the outbox']);
  });
});
