/**
 * Build-time check: every file in data/independent-listings/ validates, and
 * none collide with each other on the dedupe key. Run from `npm run build`.
 */
import { findDedupeCollisions, formatDedupeError } from '../src/catalog/independent/index.js';
import { loadIndependentOpportunities } from '../server/independentListings.js';

const items = loadIndependentOpportunities();
const collisions = findDedupeCollisions(items);
if (collisions.length) {
  console.error(formatDedupeError(collisions));
  process.exit(1);
}
console.log(`independent listings: ${items.length} valid`);
