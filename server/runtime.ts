import { connect, type Db } from './db.js';
import { resendSender, type EmailSender } from './sender.js';
import { fetchFeeds } from './source.js';
import { runSync } from './sync.js';

/** Builds handler dependencies from environment variables. See `.env.example`. */

export class ConfigError extends Error {}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ConfigError(`Missing environment variable ${name}`);
  return value;
}

function optionalEnv(name: string): string | null {
  return process.env[name]?.trim() || null;
}

export function siteUrl(): string {
  return optionalEnv('SITE_URL') ?? 'https://safetyapps.org';
}

export function sender(): EmailSender {
  return resendSender({
    apiKey: requireEnv('RESEND_API_KEY'),
    from: optionalEnv('ALERTS_FROM') ?? 'SafetyApps <alerts@safetyapps.org>',
    replyTo: optionalEnv('ALERTS_REPLY_TO') ?? undefined,
  });
}

export function opsEmail(): string | null {
  return optionalEnv('OPS_EMAIL');
}

const log = (message: string, data?: Record<string, unknown>) => console.log(JSON.stringify({ message, ...data }));

export function syncDeps(db: Db) {
  return {
    db,
    fetchFeeds: () => fetchFeeds({ baseUrl: optionalEnv('AISAFETY_API_URL') ?? undefined }),
    log,
  };
}

/**
 * Runs a handler with a database connection that's closed afterwards. Missing
 * configuration becomes a 500 that names the variable, without leaking values.
 */
export function withDb(handler: (request: Request, db: Db) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    let db: Db | null = null;
    try {
      db = connect(requireEnv('DATABASE_URL'));
      return await handler(request, db);
    } catch (err) {
      if (err instanceof ConfigError) return Response.json({ error: err.message }, { status: 500 });
      log('request failed', { path: new URL(request.url).pathname, error: err instanceof Error ? err.message : String(err) });
      return Response.json({ error: 'Something went wrong' }, { status: 500 });
    } finally {
      await db?.close();
    }
  };
}

export { log, runSync };
