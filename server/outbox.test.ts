// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deliver, enqueue, UNCERTAIN_RETRY_HOURS } from './outbox.js';
import { SendError, type EmailSender, type OutgoingEmail } from './sender.js';
import { createTestDb, type TestDb } from './testing/pglite.js';

const HOUR = 3_600_000;
let db: TestDb;
let clock: number;

beforeEach(async () => {
  db = await createTestDb();
  // Rows get the database's real now() as their due time, so the fake clock starts there.
  clock = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
});
afterEach(() => vi.restoreAllMocks());

const email = (deliveryKey: string) => ({
  deliveryKey,
  userId: null,
  kind: 'digest',
  to: 'test@example.com',
  subject: 'Subject',
  html: '<p>Hi</p>',
  text: 'Hi',
  unsubscribeUrl: null,
  expiresAt: new Date(clock + 72 * HOUR),
});

const options = (sender: EmailSender) => ({
  db,
  sender,
  now: () => new Date(clock),
  minIntervalMs: 0,
  retryDelaysMs: [0, 0],
  sleep: async () => {},
});

/** Like Resend: a repeated key within 24 hours doesn't send again. */
function provider() {
  const accepted = new Map<string, number>();
  const delivered: OutgoingEmail[] = [];
  return {
    delivered,
    accept(e: OutgoingEmail) {
      const first = accepted.get(e.idempotencyKey);
      if (first === undefined || clock - first >= 24 * HOUR) {
        accepted.set(e.idempotencyKey, clock);
        delivered.push(e);
      }
    },
  };
}

const status = async (key: string) =>
  (await db.query<{ status: string; attempts: number; uncertain: boolean }>(
    `select status, attempts, uncertain_since is not null as uncertain from internal.alert_outbox where delivery_key = $1`,
    [key],
  ))[0];

describe('delivering the outbox', () => {
  it('stops starting sends before the deadline, and hands back the rest', async () => {
    for (let i = 0; i < 20; i++) await enqueue(db, email(`slow-${i}`), new Date(clock));
    const start = clock;
    const p = provider();
    const stats = await deliver({
      ...options({
        async send(e) {
          clock += 19_000; // each send takes 19 seconds
          p.accept(e);
          return { id: 'ok' };
        },
      }),
      deadline: start + 240_000,
    });
    expect(clock - start).toBeLessThanOrEqual(240_000);
    expect(stats.sent).toBe(p.delivered.length);
    expect(stats.sent + stats.deferred).toBe(20);
    expect(stats.deferred).toBeGreaterThan(0);
    // Handed-back emails go out on the next run, without counting an attempt.
    const left = await db.query<{ status: string; attempts: number }>(`select status, attempts from internal.alert_outbox where status <> 'sent'`);
    expect(left.every((r) => r.status === 'pending' && r.attempts === 0)).toBe(true);
    const next = await deliver({ ...options({ async send(e) { p.accept(e); return { id: 'ok' }; } }), deadline: clock + 240_000 });
    expect(next.sent).toBe(stats.deferred);
    expect(p.delivered).toHaveLength(20);
  });

  it('doesn’t retry a possibly delivered email once the provider’s duplicate protection lapses', async () => {
    await enqueue(db, email('lost-response'), new Date(clock));
    const p = provider();
    // Resend accepts the email, but the response never arrives.
    const flaky: EmailSender = {
      async send(e) {
        p.accept(e);
        throw new SendError('Network error: socket hang up', true, 'unknown');
      },
    };
    await deliver(options(flaky));
    expect(p.delivered).toHaveLength(1);
    expect(await status('lost-response')).toMatchObject({ status: 'pending', uncertain: true });

    clock += 25 * HOUR; // the next day's run
    const healthy: EmailSender = { async send(e) { p.accept(e); return { id: 'ok' }; } };
    const stats = await deliver(options(healthy));
    expect(p.delivered).toHaveLength(1);
    expect(stats.failed).toBe(1);
    expect(await status('lost-response')).toMatchObject({ status: 'failed' });
  });

  it('retries a possibly delivered email within the window, where the key prevents a duplicate', async () => {
    await enqueue(db, email('retry-same-day'), new Date(clock));
    const p = provider();
    let respond = false;
    const sender: EmailSender = {
      async send(e) {
        p.accept(e);
        if (!respond) throw new SendError('Resend 503: unavailable', true, 'unknown');
        return { id: 'ok' };
      },
    };
    await deliver(options(sender));
    clock += 2 * HOUR; // the afternoon retry pass
    respond = true;
    await deliver(options(sender));
    expect(await status('retry-same-day')).toMatchObject({ status: 'sent' });
    expect(p.delivered).toHaveLength(1);
  });

  it('keeps retrying an email the provider refused, since it was never sent', async () => {
    await enqueue(db, email('rate-limited'), new Date(clock));
    let refuse = true;
    const sender: EmailSender = {
      async send() {
        if (refuse) throw new SendError('Resend 429 rate_limit_exceeded: slow down', true, 'rejected');
        return { id: 'ok' };
      },
    };
    await deliver(options(sender));
    expect(await status('rate-limited')).toMatchObject({ status: 'pending', uncertain: false });
    clock += 25 * HOUR;
    refuse = false;
    await deliver(options(sender));
    expect(await status('rate-limited')).toMatchObject({ status: 'sent' });
  });

  it('treats a run that died mid-send as possibly delivered', async () => {
    await enqueue(db, email('crashed'), new Date(clock));
    const p = provider();
    let midSend: Awaited<ReturnType<typeof status>>;
    await deliver(
      options({
        async send(e) {
          midSend = await status('crashed');
          p.accept(e);
          return { id: 'ok' };
        },
      }),
    );
    // While a send is in flight, the row already counts as possibly delivered.
    expect(midSend!).toMatchObject({ status: 'sending', uncertain: true });

    // Replay a function that timed out right there, after the provider accepted the email.
    await db.query(`update internal.alert_outbox set status = 'sending', sent_at = null, locked_until = $1 where delivery_key = 'crashed'`, [
      new Date(clock).toISOString(),
    ]);
    clock += (UNCERTAIN_RETRY_HOURS + 1) * HOUR;
    await deliver(options({ async send(e) { p.accept(e); return { id: 'ok' }; } }));
    expect(p.delivered).toHaveLength(1);
    expect(await status('crashed')).toMatchObject({ status: 'failed' });
  });
});
