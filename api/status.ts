import { handleStatus } from '../server/handlers.js';
import { withDb } from '../server/runtime.js';

/** Health check for uptime monitoring: catalog freshness and alert delivery. */
export const GET = withDb((request, db) => handleStatus(request, { db }));
