import { handleAlertsCron } from '../../server/handlers.js';
import { log, opsEmail, requireEnv, runSync, sender, siteUrl, syncDeps, withDb } from '../../server/runtime.js';

/** Daily alert emails. Scheduled in vercel.json at 09:00 UTC, after the sync. */
export const GET = withDb((request, db) =>
  handleAlertsCron(request, {
    db,
    cronSecret: process.env.CRON_SECRET,
    sender: sender(),
    siteUrl: siteUrl(),
    unsubscribeSecret: requireEnv('UNSUBSCRIBE_SECRET'),
    opsEmail: opsEmail(),
    sync: () => runSync(syncDeps(db)),
    log,
  }),
);
