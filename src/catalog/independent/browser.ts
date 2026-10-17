import type { OpportunityDetail } from '../types.js';
import { toOpportunity } from './normalize.js';
import { parseIndependentListing } from './schema.js';

/**
 * Vite-friendly loader for preview mode. Eagerly imports every JSON file under
 * `data/independent-listings/`. An empty directory yields no modules.
 */
const modules = import.meta.glob('../../../data/independent-listings/*.json', { eager: true }) as Record<
  string,
  { default: unknown }
>;

export function loadIndependentOpportunitiesBrowser(): OpportunityDetail[] {
  const items: OpportunityDetail[] = [];
  for (const [path, mod] of Object.entries(modules)) {
    const file = path.split('/').pop() ?? path;
    const record = parseIndependentListing(mod.default, file);
    if (file !== `${record.id}.json`) {
      throw new Error(`Independent listing file ${file} must be named ${record.id}.json`);
    }
    items.push(toOpportunity(record));
  }
  return items.sort((a, b) => a.id.localeCompare(b.id));
}
