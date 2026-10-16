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

/**
 * The site's address for links in emails. Preview deployments use their branch URL,
 * so staging emails point at staging.
 */
export function siteUrl(): string {
  const branch = process.env.VERCEL_ENV === 'preview' ? optionalEnv('VERCEL_BRANCH_URL') : null;
  return optionalEnv('SITE_URL') ?? (branch ? `https://${branch}` : 'https://safetyapps.org');
}

/** DATABASE_URL, or the POSTGRES_URL that Vercel's Supabase integration provides. */
export function databaseUrl(): string {
  return optionalEnv('DATABASE_URL') ?? optionalEnv('POSTGRES_URL') ?? requireEnv('DATABASE_URL');
}

export function sender(): EmailSender {
  return resendSender({
    apiKey: requireEnv('RESEND_API_KEY'),
    from: optionalEnv('ALERTS_FROM') ?? 'SafetyApps <alerts@safetyapps.org>',
    replyTo: optionalEnv('ALERTS_REPLY_TO') ?? undefined,
  });
}

/** The email sender, or null until RESEND_API_KEY is set. The sync works without it. */
export function optionalSender(): EmailSender | null {
  return optionalEnv('RESEND_API_KEY') ? sender() : null;
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
      db = connect(databaseUrl());
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
