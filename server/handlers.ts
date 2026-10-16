import { timingSafeEqual } from 'node:crypto';
import { notifyOps, runAlerts, type AlertDeps } from './alerts.js';
import { iso, isoOrNull, type Db } from './db.js';
import { deliver, FUNCTION_BUDGET_MS } from './outbox.js';
import type { EmailSender } from './sender.js';
import { runSync, type SyncDeps } from './sync.js';
import { verifyUnsubscribeToken } from './tokens.js';

/**
 * Request handlers behind the Vercel Functions in `api/`. Each takes its dependencies
 * explicitly, so tests can run them against PGlite and fake HTTP services.
 */

export function isCronRequest(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const unauthorized = () => new Response('Unauthorized', { status: 401 });

// ---------------------------------------------------------------- Cron jobs

export interface SyncHandlerDeps extends SyncDeps {
  cronSecret: string | undefined;
  /** Null until email is configured; failures are then only logged. */
  sender: EmailSender | null;
  opsEmail?: string | null;
}

/** GET /api/cron/sync, daily at 08:00 UTC. */
export async function handleSyncCron(request: Request, deps: SyncHandlerDeps): Promise<Response> {
  if (!isCronRequest(request, deps.cronSecret)) return unauthorized();
  const deadline = Date.now() + FUNCTION_BUDGET_MS;
  const result = await runSync(deps);
  if (result.status === 'failed' && deps.sender) {
    const day = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
    await notifyOps(deps, `ops:sync:${day}`, 'SafetyApps: catalog sync failed', [
      `The catalog sync failed: ${result.error}`,
      'The catalog was left unchanged. Alerts about new listings will be held back until a sync succeeds.',
    ]);
    await deliver({ db: deps.db, sender: deps.sender, now: deps.now, log: deps.log, deadline });
  }
  if (result.status === 'succeeded' && result.stats.familiesWithoutRules.length) {
    deps.log?.('recurring programs without a family rule', { families: result.stats.familiesWithoutRules });
  }
  return Response.json(result, { status: result.status === 'failed' ? 500 : 200 });
}

export interface AlertsHandlerDeps extends AlertDeps {
  cronSecret: string | undefined;
}

/** GET /api/cron/alerts, daily at 09:00 UTC. Also safe to call again to retry deliveries. */
export async function handleAlertsCron(request: Request, deps: AlertsHandlerDeps): Promise<Response> {
  if (!isCronRequest(request, deps.cronSecret)) return unauthorized();
  const result = await runAlerts(deps);
  return Response.json(result);
}

export interface DeliverHandlerDeps {
  db: Db;
  sender: EmailSender;
  cronSecret: string | undefined;
  opsEmail?: string | null;
  now?: () => Date;
  log?: (message: string, data?: Record<string, unknown>) => void;
}

/**
 * GET /api/cron/deliver, a few hours after the alerts job. Retries what's left in the
 * outbox while the provider still deduplicates it; it never plans new alerts.
 */
export async function handleDeliverCron(request: Request, deps: DeliverHandlerDeps): Promise<Response> {
  if (!isCronRequest(request, deps.cronSecret)) return unauthorized();
  const deadline = Date.now() + FUNCTION_BUDGET_MS;
  const stats = await deliver({ db: deps.db, sender: deps.sender, now: deps.now, log: deps.log, deadline });
  if (stats.failed > 0) {
    const day = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
    await notifyOps(deps, `ops:delivery:${day}`, 'SafetyApps: some alert emails failed', [
      `${stats.failed} email(s) failed for good on ${day}. See internal.alert_outbox where status = 'failed'.`,
    ]);
    await deliver({ db: deps.db, sender: deps.sender, now: deps.now, log: deps.log, deadline });
  }
  return Response.json(stats);
}

// ---------------------------------------------------------------- Unsubscribe

export interface UnsubscribeDeps {
  db: Db;
  unsubscribeSecret: string;
  siteUrl: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · SafetyApps</title></head>
<body style="margin:0;padding:48px 24px;background:#f5f7fa;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1b2430;line-height:1.55">
<main style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #dfe4ea;border-radius:10px;padding:28px">
<p style="margin:0 0 12px;font-weight:700;color:#1d4f91">SafetyApps</p><h1 style="font-size:22px;margin:0 0 12px">${esc(title)}</h1>${body}</main></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}

/**
 * GET shows a confirmation button, so link scanners that open emails can't unsubscribe
 * people. POST unsubscribes; mail apps use it for one-click unsubscribe (RFC 8058).
 */
export async function handleUnsubscribe(request: Request, deps: UnsubscribeDeps): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const userId = verifyUnsubscribeToken(token, deps.unsubscribeSecret);
  const account = `${deps.siteUrl.replace(/\/$/, '')}/account`;
  if (!userId) {
    return page('This link doesn’t work', `<p>The unsubscribe link is incomplete or has expired. Sign in at <a href="${esc(account)}">SafetyApps</a> to turn alerts off.</p>`, 400);
  }
  if (request.method === 'POST') {
    await deps.db.query(`update public.accounts set alerts_enabled = false where user_id = $1`, [userId]);
    return page(
      'You’re unsubscribed',
      `<p>You won’t get any more alert emails. Your saved list is still there.</p><p>Changed your mind? <a href="${esc(account)}">Turn alerts back on</a>. To delete your account, sign in on the same page.</p>`,
    );
  }
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, POST' } });
  return page(
    'Unsubscribe from alerts?',
    `<p>You’ll stop getting SafetyApps alert emails. Your saved list stays in your account.</p>
<form method="post" action="?token=${esc(encodeURIComponent(token!))}"><button type="submit" style="font:inherit;font-weight:600;padding:10px 18px;border-radius:8px;border:none;background:#1d4f91;color:#fff;cursor:pointer">Unsubscribe</button></form>`,
  );
}

// ---------------------------------------------------------------- Account deletion

export interface DeleteAccountDeps {
  supabaseUrl: string;
  /** The publishable (or legacy anon) key. */
  anonKey: string;
  /** The secret (or legacy service_role) key. Server only. */
  serviceRoleKey: string;
  fetch?: typeof fetch;
}

/**
 * POST /api/account/delete with the person's access token. Deletes the Supabase user;
 * the database removes their account, saved list, follows, and queued emails with it.
 */
export async function handleDeleteAccount(request: Request, deps: DeleteAccountDeps): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
  const doFetch = deps.fetch ?? fetch;
  const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return unauthorized();
  const base = deps.supabaseUrl.replace(/\/$/, '');

  const who = await doFetch(`${base}/auth/v1/user`, { headers: { apikey: deps.anonKey, authorization: `Bearer ${token}` } });
  if (!who.ok) return unauthorized();
  const user = (await who.json()) as { id?: string };
  if (!user.id) return unauthorized();

  // A secret key (sb_secret_…) goes only in `apikey`; a legacy service_role JWT also goes in Authorization.
  const key = deps.serviceRoleKey;
  const removed = await doFetch(`${base}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: 'DELETE',
    headers: key.startsWith('eyJ') ? { apikey: key, authorization: `Bearer ${key}` } : { apikey: key },
  });
  if (!removed.ok) return Response.json({ error: 'Could not delete the account. Try again, or email us.' }, { status: 502 });
  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------- Status

/** Daily jobs should have succeeded within this long; allows some slack for cron timing. */
const STALE_HOURS = 26;
/** A run still "running" after this long has died. Functions stop after 5 minutes. */
const ABANDONED_MINUTES = 30;

/**
 * GET /api/status for uptime monitoring: 200 when the catalog synced and the alerts
 * job finished within the last day, and nothing is stuck or failed; 503 otherwise.
 * Reports counts only, never addresses or error details.
 */
export async function handleStatus(_request: Request, deps: { db: Db; now?: () => Date }): Promise<Response> {
  const now = deps.now?.() ?? new Date();
  const at = now.toISOString();
  const [sync] = await deps.db.query<{ last_success: unknown; first_success: unknown; last_status: string | null; last_started: unknown; stats: Record<string, unknown> | null }>(
    `select (select max(finished_at) from internal.sync_runs where status = 'succeeded') as last_success,
            (select min(finished_at) from internal.sync_runs where status = 'succeeded') as first_success,
            r.status as last_status, r.started_at as last_started, r.stats
     from (select 1) one left join lateral (select status, started_at, stats from internal.sync_runs order by started_at desc limit 1) r on true`,
  );
  const [alerts] = await deps.db.query<{ last_success: unknown; any_run: boolean; status: string | null; started: unknown; day: string | null; suppressed: boolean | null }>(
    `select (select max(finished_at) from internal.alert_runs where status = 'succeeded') as last_success,
            exists (select 1 from internal.alert_runs) as any_run,
            r.status, r.started_at as started, r.day::text as day, r.suppressed
     from (select 1) one left join lateral (select status, started_at, day, suppressed from internal.alert_runs order by started_at desc limit 1) r on true`,
  );
  const [outbox] = await deps.db.query<{ pending: number; overdue: number; failed: number; sent: number }>(
    `select count(*) filter (where status in ('pending', 'sending'))::int as pending,
            count(*) filter (where status in ('pending', 'sending') and created_at < $1::timestamptz - make_interval(hours => $2))::int as overdue,
            count(*) filter (where status = 'failed' and created_at > $1::timestamptz - interval '1 day')::int as failed,
            count(*) filter (where status = 'sent' and sent_at > $1::timestamptz - interval '1 day')::int as sent
     from internal.alert_outbox`,
    [at, STALE_HOURS],
  );
  const [reviews] = await deps.db.query<{ n: number }>(`select count(*)::int as n from internal.family_reviews where status = 'pending'`);

  const within = (value: unknown, ms: number) => value !== null && value !== undefined && now.getTime() - Date.parse(iso(value)) < ms;
  const stale = STALE_HOURS * 3_600_000;
  const lastSuccess = isoOrNull(sync?.last_success);
  const catalogFresh = within(sync?.last_success, stale);
  // Just launched: the first alerts run hasn't happened yet.
  const alertsNotDueYet = !alerts?.any_run && within(sync?.first_success, stale);
  const alertsFresh = within(alerts?.last_success, stale) || alertsNotDueYet;
  const alertsAbandoned = alerts?.status === 'running' && !within(alerts.started, ABANDONED_MINUTES * 60_000);
  const problems = [
    !catalogFresh && 'catalog not synced in the last day',
    !alertsFresh && 'alerts job hasn’t finished in the last day',
    alertsAbandoned && 'alerts job stopped without finishing',
    alerts?.status === 'failed' && 'last alerts job failed',
    Number(outbox?.overdue ?? 0) > 0 && 'emails stuck in the outbox',
    Number(outbox?.failed ?? 0) > 0 && 'emails failed in the last day',
  ].filter((p): p is string => Boolean(p));
  const ok = problems.length === 0;

  return Response.json(
    {
      ok,
      problems,
      checkedAt: iso(now),
      catalog: {
        fresh: catalogFresh,
        lastSuccessAt: lastSuccess,
        lastRunStatus: sync?.last_status ?? null,
        lastRunAt: isoOrNull(sync?.last_started),
        pendingFamilyReviews: Number(reviews?.n ?? 0),
        familiesWithoutRules: (sync?.stats?.familiesWithoutRules as string[] | undefined) ?? [],
      },
      alerts: {
        fresh: alertsFresh,
        lastSuccessAt: isoOrNull(alerts?.last_success),
        lastRunDay: alerts?.day ?? null,
        lastRunStatus: alertsAbandoned ? 'abandoned' : (alerts?.status ?? null),
        newListingAlertsHeld: alerts?.suppressed ?? null,
        pending: Number(outbox?.pending ?? 0),
        overdue: Number(outbox?.overdue ?? 0),
        sentLastDay: Number(outbox?.sent ?? 0),
        failedLastDay: Number(outbox?.failed ?? 0),
      },
    },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
