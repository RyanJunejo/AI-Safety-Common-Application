import type { Feeds } from '../catalog.js';
import communities from './aisafety-2026-10-09/communities.json';
import courses from './aisafety-2026-10-09/courses.json';
import jobs from './aisafety-2026-10-09/jobs.json';
import training from './aisafety-2026-10-09/training.json';

/**
 * A trimmed AISafety.com snapshot (CC BY 4.0), taken with `node scripts/snapshot-aisafety.mjs`.
 * Tests use it, and the site falls back to it when Supabase isn't configured.
 */
export const SNAPSHOT_DAY = '2026-10-09';

export const SNAPSHOT_FEEDS: Feeds = {
  training: training.data,
  courses: courses.data,
  jobs: jobs.data,
  communities: communities.data,
};
