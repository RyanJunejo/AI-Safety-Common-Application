import { handleUnsubscribe } from '../server/handlers.js';
import { requireEnv, siteUrl, withDb } from '../server/runtime.js';

/** One-click unsubscribe links in alert emails. */
const handler = withDb((request, db) => handleUnsubscribe(request, { db, unsubscribeSecret: requireEnv('UNSUBSCRIBE_SECRET'), siteUrl: siteUrl() }));

export const GET = handler;
export const POST = handler;
