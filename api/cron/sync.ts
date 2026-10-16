import { handleSyncCron } from '../../server/handlers.js';
import { opsEmail, sender, syncDeps, withDb } from '../../server/runtime.js';

/** Daily catalog sync from AISafety.com. Scheduled in vercel.json at 08:00 UTC. */
export const GET = withDb((request, db) =>
  handleSyncCron(request, { ...syncDeps(db), cronSecret: process.env.CRON_SECRET, sender: sender(), opsEmail: opsEmail() }),
);
