// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INDEPENDENT_LISTINGS_DIR } from '../src/catalog/independent/index.js';
import { testIndependentRecord } from '../src/catalog/independent/testing.js';
import { loadIndependentOpportunities, loadIndependentRecords } from './independentListings.js';

describe('loading independent listings from disk', () => {
  it('treats a missing or empty directory as zero listings', () => {
    expect(loadIndependentRecords(join(tmpdir(), 'no-such-independent-dir'))).toEqual([]);
    const empty = mkdtempSync(join(tmpdir(), 'empty-independent-'));
    expect(loadIndependentOpportunities(empty)).toEqual([]);
  });

  it('loads the repo data directory (seeded empty)', () => {
    expect(loadIndependentRecords()).toEqual([]);
    expect(INDEPENDENT_LISTINGS_DIR).toBe('data/independent-listings');
  });

  it('validates files and requires id.json naming', () => {
    const r = testIndependentRecord({ id: 'named-ok' });
    const dir = mkdtempSync(join(tmpdir(), 'independent-listings-'));
    writeFileSync(join(dir, `${r.id}.json`), JSON.stringify(r, null, 2));
    expect(loadIndependentOpportunities(dir)).toHaveLength(1);

    const bad = mkdtempSync(join(tmpdir(), 'bad-name-'));
    writeFileSync(join(bad, 'wrong-name.json'), JSON.stringify(r));
    expect(() => loadIndependentRecords(bad)).toThrow(/must be named named-ok\.json/);
  });
});
