/**
 * Runs the built Vercel Functions against a real, throwaway Postgres, through the same
 * postgres.js driver production uses. Unit tests use PGlite, which can hide driver
 * differences; this catches them before a deploy.
 *
 *   docker run -d --name safetyapps-pg -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:17
 *   npx vercel build
 *   SMOKE_DATABASE_URL=postgres://postgres:pw@localhost:55432/postgres npm run smoke:functions
 *
 * It wipes the database first, so it refuses anything but localhost. AISafety.com and
 * Resend are replaced by local fakes; nothing leaves the machine.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import postgres from 'postgres';
import { SUPABASE_SHIM } from '../server/testing/pglite.js';

const ROOT = new URL('../', import.meta.url);
const DB_URL = process.env.SMOKE_DATABASE_URL ?? '';
if (!/^postgres(ql)?:\/\/[^@]+@(localhost|127\.0\.0\.1)[:/]/.test(DB_URL)) {
  console.error('Set SMOKE_DATABASE_URL to a throwaway Postgres on localhost. It will be wiped.');
  process.exit(1);
}

const admin = postgres(DB_URL, { max: 1, onnotice: () => {} });
await admin.unsafe('drop schema if exists internal cascade; drop schema if exists auth cascade; drop schema public cascade; create schema public;');
const roles = SUPABASE_SHIM.split('\n').filter((l) => l.startsWith('create role'));
await admin.unsafe(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then ${roles.join(' ')} end if; end $$;`);
await admin.unsafe(SUPABASE_SHIM.split('\n').filter((l) => !l.startsWith('create role')).join('\n'));
await admin.unsafe(readFileSync(new URL('supabase/migrations/20261009000000_safetyapps_beta.sql', ROOT), 'utf8'));

// A fake AISafety.com serving the bundled snapshot.
type Feed = { data: Record<string, unknown>[]; meta: { count: number } };
const feeds: Record<string, Feed> = Object.fromEntries(
  ['training', 'courses', 'jobs', 'communities'].map((c) => [c, JSON.parse(readFileSync(new URL(`src/catalog/fixtures/aisafety-2026-10-09/${c}.json`, ROOT), 'utf8'))]),
);
let sourceDown = false;
const source = createServer((req, res) => {
  const feed = feeds[req.url!.split('/').pop()!];
  if (sourceDown || !feed) return void res.writeHead(503).end();
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(feed));
}).listen(0);

// A fake Resend that records what would be sent.
const sent: { key: string; to: string; subject: string; headers: Record<string, string> }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  if (String(input) !== 'https://api.resend.com/emails') return realFetch(input, init);
  const body = JSON.parse(String(init!.body));
  sent.push({ key: new Headers(init!.headers).get('idempotency-key')!, to: body.to[0], subject: body.subject, headers: body.headers ?? {} });
  return Response.json({ id: `re_${sent.length}` });
}) as typeof fetch;

Object.assign(process.env, {
  DATABASE_URL: DB_URL,
  CRON_SECRET: 'smoke-cron-secret',
  UNSUBSCRIBE_SECRET: 'smoke-unsubscribe-secret',
  RESEND_API_KEY: 're_smoke',
  OPS_EMAIL: 'ops@example.com',
  SITE_URL: 'https://safetyapps.org',
  AISAFETY_API_URL: `http://localhost:${(source.address() as { port: number }).port}`,
});

const load = (name: string) => import(new URL(`.vercel/output/functions/api/${name}.func/api/${name}.js`, ROOT).href);
const [sync, alerts, retry, status, unsubscribe] = await Promise.all([
  load('cron/sync'),
  load('cron/alerts'),
  load('cron/deliver'),
  load('status'),
  load('unsubscribe'),
]);
const cron = (path: string) => new Request(`https://safetyapps.org${path}`, { headers: { authorization: 'Bearer smoke-cron-secret' } });
const step = (name: string) => console.log(`✓ ${name}`);

try {
  assert.equal((await sync.GET(new Request('https://safetyapps.org/api/cron/sync'))).status, 401);
  step('cron endpoints reject requests without the secret');

  let res = await sync.GET(cron('/api/cron/sync'));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).stats.baseline, true);
  step('first sync imports a baseline');

  const [user] = await admin`insert into auth.users (email) values ('smoke@example.com') returning id`;
  await admin`insert into public.accounts (user_id, alerts_enabled) values (${user!.id}, true)`;
  await admin`insert into public.followed_programs (user_id, program_id, followed_at) values (${user!.id}, 'training-receOAca5S5nHnSpU', now() - interval '1 day')`;
  // Move the baseline to yesterday, then publish a new MATS round.
  await admin`update internal.sync_runs set started_at = started_at - interval '1 day', finished_at = finished_at - interval '1 day'`;
  await admin`update internal.catalog_events set day = day - 1, at = at - interval '1 day'`;
  const winter = feeds.training!.data.find((r) => r.id === 'recYtOVOnv2DW5XTv')!;
  feeds.training!.data.push({ ...winter, id: 'recSmokeRound', name: 'MATS: Smoke Test Round', applicationStatus: 'Open', applicationsClose: '2099-01-10' });
  feeds.training!.meta.count += 1;
  res = await sync.GET(cron('/api/cron/sync'));
  assert.deepEqual((await res.json()).stats.events, { listed: 1 });
  step('a later sync records the new round');

  res = await alerts.GET(cron('/api/cron/alerts'));
  assert.equal((await res.json()).delivery.sent, 1);
  assert.equal(sent[0]!.subject, 'Now open: MATS: Smoke Test Round');
  assert.match(sent[0]!.headers['List-Unsubscribe']!, /^<https:\/\/safetyapps\.org\/api\/unsubscribe\?token=/);
  step('the alerts job emails the follower, with one-click unsubscribe');

  res = await alerts.GET(cron('/api/cron/alerts'));
  assert.equal((await res.json()).planned, 0);
  assert.equal(sent.length, 1);
  step('a duplicate cron run sends nothing');

  res = await retry.GET(cron('/api/cron/deliver'));
  assert.deepEqual(await res.json(), { sent: 0, retrying: 0, failed: 0, expired: 0, deferred: 0 });
  step('the retry pass finds nothing left to send');

  res = await status.GET(new Request('https://safetyapps.org/api/status'));
  assert.equal(res.status, 200, await res.clone().text());
  step('the status endpoint reports healthy');

  const token = new URL(sent[0]!.headers['List-Unsubscribe']!.slice(1, -1)).searchParams.get('token');
  res = await unsubscribe.POST(new Request(`https://safetyapps.org/api/unsubscribe?token=${token}`, { method: 'POST', body: 'List-Unsubscribe=One-Click' }));
  assert.equal(res.status, 200);
  assert.deepEqual([...(await admin`select alerts_enabled from public.accounts`)], [{ alerts_enabled: false }]);
  step('one-click unsubscribe turns alerts off');

  sourceDown = true;
  res = await sync.GET(cron('/api/cron/sync'));
  assert.equal(res.status, 500);
  assert.deepEqual(
    sent.filter((s) => s.to === 'ops@example.com').map((s) => s.subject),
    ['SafetyApps: catalog sync failed'],
  );
  step('a failed sync leaves the catalog alone and emails ops');
  console.log('\nSmoke test passed.');
} finally {
  await admin.end();
  source.close();
}
