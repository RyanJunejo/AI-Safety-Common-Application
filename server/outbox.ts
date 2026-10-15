import { isoOrNull, type Db } from './db.js';
import { SEND_TIMEOUT_MS, SendError, type EmailSender } from './sender.js';

/**
 * The durable outbox. Emails are written here with a unique delivery key, then sent.
 * A duplicate cron run finds the key taken and adds nothing; a failed send is retried
 * with the same key, which Resend also uses to refuse a second delivery.
 */

export interface OutboxEmail {
  deliveryKey: string;
  userId: string | null;
  kind: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string | null;
  expiresAt: Date;
  /** Ledger keys the email claims for its recipient. */
  itemKeys?: string[];
}

/**
 * Adds an email unless its delivery key exists. Returns whether it was added. `at` is
 * the job's clock, so a row is due exactly when the job that wrote it says it is.
 */
export async function enqueue(db: Db, email: OutboxEmail, at: Date = new Date()): Promise<boolean> {
  return db.transaction(async (tx) => {
    const added = await tx.query(
      `insert into internal.alert_outbox (delivery_key, user_id, kind, to_email, subject, html, text_body, unsubscribe_url, expires_at, next_attempt_at, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
       on conflict (delivery_key) do nothing returning id`,
      [email.deliveryKey, email.userId, email.kind, email.to, email.subject, email.html, email.text, email.unsubscribeUrl, email.expiresAt.toISOString(), at.toISOString()],
    );
    if (added.length === 0) return false;
    if (email.userId && email.itemKeys?.length) {
      await tx.query(
        `insert into internal.alert_ledger (user_id, item_key, delivery_key, created_at)
         select $1, k, $3, $4 from jsonb_array_elements_text($2::text::jsonb) as k
         on conflict do nothing`,
        [email.userId, JSON.stringify(email.itemKeys), email.deliveryKey, at.toISOString()],
      );
    }
    return true;
  });
}

export const MAX_CLAIMS = 4;
/** Minutes to wait before the next claim, by attempts so far. */
const BACKOFF_MINUTES = [5, 30, 120, 360];
const LEASE_MINUTES = 5;
/**
 * Resend deduplicates an idempotency key for 24 hours. An email whose send may have
 * succeeded is retried only within that window, with an hour to spare.
 */
export const UNCERTAIN_RETRY_HOURS = 23;
/** Cron functions get 300 seconds (vercel.json); leave room to record results. */
export const FUNCTION_BUDGET_MS = 270_000;

export interface DeliveryStats {
  sent: number;
  retrying: number;
  failed: number;
  expired: number;
  /** Claimed but handed back unsent because the run was out of time. */
  deferred: number;
}

export interface DeliverOptions {
  db: Db;
  sender: EmailSender;
  now?: () => Date;
  /** Spacing between sends, to stay under the provider's rate limit. */
  minIntervalMs?: number;
  /** Quick retries within this run, before deferring to a later run. */
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  /** No send starts unless it can finish by this time (epoch ms). Defaults to 240 seconds from now. */
  deadline?: number;
  /** The longest one send can take. */
  sendTimeoutMs?: number;
  log?: (message: string, data?: Record<string, unknown>) => void;
}

interface Claimed {
  id: number;
  delivery_key: string;
  to_email: string;
  subject: string;
  html: string;
  text_body: string;
  unsubscribe_url: string | null;
  attempts: number;
  /** uncertain_since before this claim. */
  prior: unknown;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Sends everything due in the outbox. Safe to run concurrently: rows are leased with
 * SKIP LOCKED. A claim marks the row as possibly sent until the provider answers, so a
 * run that dies mid-send can't lead to a duplicate after the provider forgets the key.
 */
export async function deliver(o: DeliverOptions): Promise<DeliveryStats> {
  const { db, sender } = o;
  const now = o.now ?? (() => new Date());
  const sleep = o.sleep ?? wait;
  const retryDelays = o.retryDelaysMs ?? [2_000, 10_000];
  const interval = o.minIntervalMs ?? 550;
  const sendTimeout = o.sendTimeoutMs ?? SEND_TIMEOUT_MS;
  const deadline = o.deadline ?? Date.now() + 240_000;
  /** Whether a send that starts after waiting `ms` could still finish in time. */
  const timeFor = (ms = 0) => Date.now() + ms + sendTimeout <= deadline;
  const stats: DeliveryStats = { sent: 0, retrying: 0, failed: 0, expired: 0, deferred: 0 };
  const at = () => now().toISOString();

  const expired = await db.query(
    `update internal.alert_outbox o set status = 'expired', locked_until = null,
       last_error = case when o.expires_at <= $1 then 'Expired before it could be sent' else 'Alerts were turned off' end
     where o.status in ('pending', 'sending') and (o.locked_until is null or o.locked_until <= $1)
       and (o.expires_at <= $1 or (o.user_id is not null and not exists (
         select 1 from public.accounts a where a.user_id = o.user_id and a.alerts_enabled)))
     returning id`,
    [at()],
  );
  stats.expired = expired.length;

  const lapsed = await db.query(
    `update internal.alert_outbox set status = 'failed', locked_until = null,
       last_error = 'Not retried: an earlier attempt may have been delivered, and the provider''s 24-hour duplicate protection has lapsed. '
         || coalesce(last_error, '')
     where status in ('pending', 'sending') and (locked_until is null or locked_until <= $1)
       and uncertain_since <= $1::timestamptz - make_interval(hours => $2)
     returning id`,
    [at(), UNCERTAIN_RETRY_HOURS],
  );
  stats.failed += lapsed.length;

  while (timeFor()) {
    const claimedAt = at();
    const batch = await db.query<Claimed>(
      `with picked as (
         select id, uncertain_since as prior from internal.alert_outbox
         where ((status = 'pending' and next_attempt_at <= $1) or (status = 'sending' and locked_until <= $1)) and expires_at > $1
         order by id limit 10 for update skip locked)
       update internal.alert_outbox o set status = 'sending', attempts = o.attempts + 1,
         locked_until = $1::timestamptz + make_interval(mins => $2), uncertain_since = coalesce(o.uncertain_since, $1)
       from picked where o.id = picked.id
       returning o.id, o.delivery_key, o.to_email, o.subject, o.html, o.text_body, o.unsubscribe_url, o.attempts, picked.prior`,
      [claimedAt, LEASE_MINUTES],
    );
    if (batch.length === 0) break;

    for (const row of batch) {
      if (!timeFor()) {
        // Out of time: hand it back untouched for the next run.
        await db.query(
          `update internal.alert_outbox set status = 'pending', attempts = attempts - 1, locked_until = null, uncertain_since = $2 where id = $1`,
          [row.id, isoOrNull(row.prior)],
        );
        stats.deferred += 1;
        continue;
      }

      let error: SendError | null = null;
      let maybeSent = false;
      for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
        try {
          const { id } = await sender.send({
            to: row.to_email,
            subject: row.subject,
            html: row.html,
            text: row.text_body,
            idempotencyKey: row.delivery_key,
            unsubscribeUrl: row.unsubscribe_url,
          });
          await db.query(`update internal.alert_outbox set status = 'sent', sent_at = $2, provider_id = $3, locked_until = null, last_error = null where id = $1`, [
            row.id,
            at(),
            id,
          ]);
          stats.sent += 1;
          error = null;
          break;
        } catch (err) {
          error = err instanceof SendError ? err : new SendError(err instanceof Error ? err.message : String(err), true, 'unknown');
          if (error.outcome === 'unknown') maybeSent = true;
          const delay = retryDelays[attempt];
          if (!error.retryable || delay === undefined || !timeFor(delay)) break;
          await sleep(delay);
        }
      }
      if (error) {
        const giveUp = !error.retryable || Number(row.attempts) >= MAX_CLAIMS;
        const next = new Date(now().getTime() + (BACKOFF_MINUTES[Number(row.attempts) - 1] ?? 360) * 60_000);
        await db.query(
          `update internal.alert_outbox set status = $2, next_attempt_at = $3, locked_until = null, last_error = $4,
             uncertain_since = case when $5 then coalesce($6::timestamptz, $7::timestamptz) else $6::timestamptz end
           where id = $1`,
          [row.id, giveUp ? 'failed' : 'pending', next.toISOString(), error.message.slice(0, 1000), maybeSent, isoOrNull(row.prior), claimedAt],
        );
        if (giveUp) stats.failed += 1;
        else stats.retrying += 1;
        o.log?.('email send failed', { deliveryKey: row.delivery_key, attempts: row.attempts, giveUp, maybeSent, error: error.message });
      }
      if (timeFor(interval)) await sleep(interval);
    }
  }
  return stats;
}
