import { linkFamilies, type FamilyDecisions } from './families.js';
import { normalizeCollection, type Rejection } from './normalize.js';
import { COLLECTIONS, type Collection, type OpportunityDetail } from './types.js';

/** The `data` array of each AISafety.com collection. */
export type Feeds = Record<Collection, readonly unknown[]>;

export interface BuiltCatalog {
  items: OpportunityDetail[];
  rejected: Rejection[];
  duplicates: { collection: Collection; sourceId: string }[];
  familiesWithoutRules: string[];
}

/** Normalizes every collection, then links cohorts to their recurring programs. */
export function buildCatalog(feeds: Feeds, decisions?: FamilyDecisions): BuiltCatalog {
  const items: OpportunityDetail[] = [];
  const rejected: Rejection[] = [];
  const duplicates: BuiltCatalog['duplicates'] = [];
  for (const collection of COLLECTIONS) {
    const result = normalizeCollection(collection, feeds[collection]);
    items.push(...result.items);
    rejected.push(...result.rejected);
    duplicates.push(...result.duplicates.map((sourceId) => ({ collection, sourceId })));
  }
  const linked = linkFamilies(items, decisions);
  return { items: linked.items, rejected, duplicates, familiesWithoutRules: linked.familiesWithoutRules };
}
