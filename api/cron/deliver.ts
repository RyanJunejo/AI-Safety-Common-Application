import { handleDeliverCron } from '../../server/handlers.js';
import { log, opsEmail, sender, withDb } from '../../server/runtime.js';

/** Retries undelivered alert emails. Scheduled in vercel.json at 11:00 and 15:00 UTC. */
export const GET = withDb((request, db) => handleDeliverCron(request, { db, sender: sender(), cronSecret: process.env.CRON_SECRET, opsEmail: opsEmail(), log }));
