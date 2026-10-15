// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './testing/pglite.js';

/** Row level security and grants, checked against the real migration. */

let db: TestDb;
let alice: string;
let bob: string;

beforeEach(async () => {
  db = await createTestDb();
  alice = await db.createUser('alice@example.com');
  bob = await db.createUser('bob@example.com');
  await db.query(
    `insert into public.catalog_items (id, kind, status, family_link, data, content_hash) values ('jobs-rec1', 'job', 'ongoing', 'none', '{}', 'x')`,
  );
});

async function rejects(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error('expected the query to fail');
}

describe('the catalog', () => {
  it('is readable by anyone and writable by no one', async () => {
    expect(await db.as(null, (q) => q.query(`select id from public.catalog_items`))).toEqual([{ id: 'jobs-rec1' }]);
    expect(await rejects(db.as(null, (q) => q.query(`update public.catalog_items set status = 'closed'`)))).toMatch(/permission denied/);
    expect(await rejects(db.as(alice, (q) => q.query(`delete from public.catalog_items`)))).toMatch(/permission denied/);
  });

  it('keeps sync runs, events, and the outbox private', async () => {
    for (const table of ['internal.sync_runs', 'internal.alert_outbox', 'internal.alert_ledger', 'internal.family_reviews']) {
      expect(await rejects(db.as(alice, (q) => q.query(`select * from ${table}`)))).toMatch(/permission denied/);
    }
    // The sync time is public through a function.
    await db.query(`insert into internal.sync_runs (status, finished_at) values ('succeeded', '2026-10-09T08:00:05Z')`);
    const [row] = await db.as(null, (q) => q.query<{ at: Date }>(`select public.catalog_synced_at() as at`));
    expect(new Date(row!.at).toISOString()).toBe('2026-10-09T08:00:05.000Z');
  });
});

describe('accounts', () => {
  it('start with alerts off, and need a signed-in user', async () => {
    const [acct] = await db.as(alice, (q) => q.query<{ user_id: string; alerts_enabled: boolean }>(`select * from public.ensure_account()`));
    expect(acct).toMatchObject({ user_id: alice, alerts_enabled: false });
    expect(await rejects(db.as(null, (q) => q.query(`select public.ensure_account()`)))).toMatch(/permission denied/);
  });

  it('are private to their owner', async () => {
    await db.as(alice, (q) => q.query(`select public.ensure_account()`));
    await db.as(bob, (q) => q.query(`select public.ensure_account()`));
    await db.as(alice, (q) => q.query(`insert into public.saved_opportunities (opportunity_id) values ('jobs-rec1')`));
    await db.as(alice, (q) => q.query(`insert into public.followed_programs (program_id) values ('training-recA')`));

    expect(await db.as(bob, (q) => q.query(`select * from public.accounts`))).toHaveLength(1);
    expect(await db.as(bob, (q) => q.query(`select * from public.saved_opportunities`))).toEqual([]);
    expect(await db.as(bob, (q) => q.query(`select * from public.followed_programs`))).toEqual([]);
    expect(await db.as(null, (q) => rejects(q.query(`select * from public.accounts`)))).toMatch(/permission denied/);

    // Bob can't change or remove Alice's data, or write rows in her name.
    await db.as(bob, (q) => q.query(`update public.accounts set alerts_enabled = true where user_id = $1`, [alice]));
    await db.as(bob, (q) => q.query(`delete from public.saved_opportunities where user_id = $1`, [alice]));
    expect(await rejects(db.as(bob, (q) => q.query(`insert into public.saved_opportunities (user_id, opportunity_id) values ($1, 'x')`, [alice])))).toMatch(
      /row-level security/,
    );
    const [a] = await db.query<{ alerts_enabled: boolean }>(`select alerts_enabled from public.accounts where user_id = $1`, [alice]);
    expect(a!.alerts_enabled).toBe(false);
    expect(await db.query(`select * from public.saved_opportunities where user_id = $1`, [alice])).toHaveLength(1);
  });

  it('record when alerts were explicitly turned on', async () => {
    await db.as(alice, (q) => q.query(`select public.ensure_account()`));
    await db.as(alice, (q) => q.query(`update public.accounts set alerts_enabled = true, kinds = '{program,job}' where user_id = $1`, [alice]));
    const [on] = await db.query<{ alerts_enabled_at: Date | null; kinds: string[] }>(`select alerts_enabled_at, kinds from public.accounts`);
    expect(on!.alerts_enabled_at).not.toBeNull();
    expect(on!.kinds).toEqual(['program', 'job']);
    await db.as(alice, (q) => q.query(`update public.accounts set alerts_enabled = false where user_id = $1`, [alice]));
    const [off] = await db.query<{ alerts_enabled_at: Date | null }>(`select alerts_enabled_at from public.accounts`);
    expect(off!.alerts_enabled_at).toBeNull();
  });

  it('reject unknown preference values and protected columns', async () => {
    await db.as(alice, (q) => q.query(`select public.ensure_account()`));
    expect(await rejects(db.as(alice, (q) => q.query(`update public.accounts set kinds = '{events}' where user_id = $1`, [alice])))).toMatch(/kinds_known/);
    expect(await rejects(db.as(alice, (q) => q.query(`update public.accounts set created_at = now() where user_id = $1`, [alice])))).toMatch(
      /permission denied/,
    );
  });

  it('disappear with every saved item and queued email when the user is deleted', async () => {
    await db.as(alice, (q) => q.query(`select public.ensure_account()`));
    await db.as(alice, (q) => q.query(`insert into public.saved_opportunities (opportunity_id) values ('jobs-rec1')`));
    await db.as(alice, (q) => q.query(`insert into public.followed_programs (program_id) values ('training-recA')`));
    await db.query(
      `insert into internal.alert_outbox (delivery_key, user_id, kind, to_email, subject, html, text_body, expires_at)
       values ('daily:a', $1, 'daily', 'alice@example.com', 's', 'h', 't', now() + interval '1 day')`,
      [alice],
    );
    await db.query(`insert into internal.alert_ledger (user_id, item_key, delivery_key) values ($1, 'k', 'daily:a')`, [alice]);

    await db.query(`delete from auth.users where id = $1`, [alice]);
    for (const table of ['public.accounts', 'public.saved_opportunities', 'public.followed_programs', 'internal.alert_outbox', 'internal.alert_ledger']) {
      expect(await db.query(`select 1 from ${table}`), table).toEqual([]);
    }
  });
});
