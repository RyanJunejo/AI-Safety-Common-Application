import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  INDEPENDENT_LISTINGS_DIR,
  parseIndependentListing,
  toOpportunity,
  type IndependentListing,
} from '../src/catalog/independent/index.js';
import type { OpportunityDetail } from '../src/catalog/types.js';

export function independentListingsPath(cwd = process.cwd()): string {
  return join(cwd, INDEPENDENT_LISTINGS_DIR);
}

/**
 * Loads and validates every `*.json` file in the independent listings directory.
 * Missing or empty directories are fine (no listings). Invalid JSON or schema fails loudly.
 */
export function loadIndependentRecords(dir = independentListingsPath()): IndependentListing[] {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const records: IndependentListing[] = [];
  const ids = new Set<string>();
  for (const file of files) {
    const path = join(dir, file);
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    const record = parseIndependentListing(raw, `${INDEPENDENT_LISTINGS_DIR}/${file}`);
    if (ids.has(record.id)) {
      throw new Error(`Duplicate independent listing id "${record.id}" in ${INDEPENDENT_LISTINGS_DIR}/${file}`);
    }
    if (file !== `${record.id}.json`) {
      throw new Error(`Independent listing file ${file} must be named ${record.id}.json`);
    }
    ids.add(record.id);
    records.push(record);
  }
  return records;
}

export function loadIndependentOpportunities(dir = independentListingsPath()): OpportunityDetail[] {
  return loadIndependentRecords(dir).map(toOpportunity);
}
