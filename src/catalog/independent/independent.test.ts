import { describe, expect, it } from 'vitest';
import { attributionCardLabel, listingAttribution } from '../attribution.js';
import { buildCatalog } from '../catalog.js';
import { SNAPSHOT_FEEDS } from '../fixtures/index.js';
import { findDedupeCollisions, formatDedupeError, normalizeListingUrl } from './dedupe.js';
import { INDEPENDENT_LISTINGS_DIR } from './load.js';
import { independentCatalogId, toOpportunity } from './normalize.js';
import { parseIndependentListing } from './schema.js';
import { testIndependentRecord } from './testing.js';

const sample = testIndependentRecord;

describe('independent listing schema', () => {
  it('accepts a complete researched record with evidence fields', () => {
    const r = sample({ id: 'test-fellowship-winter-2099' });
    expect(r.deadlineTimezone).toBe('America/Los_Angeles');
    expect(r.sourceType).toBe('official');
    expect(r.lastVerified).toBe('2026-10-15');
    expect(r.round).toBe('Winter 2099');
  });

  it('requires an X post URL when sourceType includes x-post', () => {
    expect(() =>
      parseIndependentListing({
        ...sample({ id: 'needs-x' }),
        sourceType: 'x-post',
        xPostUrl: null,
      }),
    ).toThrow(/xPostUrl/);
  });

  it('rejects deadlineTimezone without a deadline', () => {
    expect(() =>
      parseIndependentListing({
        ...sample({ id: 'tz-only' }),
        deadline: null,
        deadlineTimezone: 'UTC',
      }),
    ).toThrow(/deadlineTimezone/);
  });

  it('rejects a bad id slug', () => {
    expect(() => parseIndependentListing({ ...sample({ id: 'ok-id' }), id: 'Bad_ID' })).toThrow(/slug/);
  });
});

describe('independent listing normalize', () => {
  it('namespaces ids and credits the official URL, not AISafety.com', () => {
    const o = toOpportunity(sample({ id: 'test-fellowship-winter-2099' }));
    expect(o.id).toBe('independent-test-fellowship-winter-2099');
    expect(o.provenance).toMatchObject({
      source: 'independent research',
      collection: 'independent',
      sourceId: 'test-fellowship-winter-2099',
      listingUrl: 'https://example.test/fellowship-winter-2099',
      license: null,
    });
    expect(o.provenance.evidence).toMatchObject({
      sourceType: 'official',
      officialUrl: 'https://example.test/fellowship-winter-2099',
      deadlineTimezone: 'America/Los_Angeles',
      round: 'Winter 2099',
      lastVerified: '2026-10-15',
    });
  });
});

describe('dedupe across sources', () => {
  it('normalizes URLs for comparison', () => {
    expect(normalizeListingUrl('https://Example.TEST/path/?utm_source=x')).toBe('https://example.test/path');
  });

  it('detects collisions by URL, organization, title, and cohort', () => {
    const a = toOpportunity(sample({ id: 'dup-a', round: 'Winter 2099' }));
    const b = toOpportunity(
      sample({
        id: 'dup-b',
        title: a.title,
        organization: a.organization,
        url: a.url,
        round: 'Winter 2099',
      }),
    );
    const collisions = findDedupeCollisions([a, b]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0]!.ids).toEqual([a.id, b.id].sort());
    expect(formatDedupeError(collisions)).toContain(a.id);
  });

  it('does not collide when the cohort differs', () => {
    const a = toOpportunity(sample({ id: 'cohort-a', round: 'Winter 2099' }));
    const b = toOpportunity(
      sample({ id: 'cohort-b', title: a.title, organization: a.organization, url: a.url, round: 'Summer 2099' }),
    );
    expect(findDedupeCollisions([a, b])).toEqual([]);
  });

  it('detects an independent listing that duplicates an AISafety.com record', () => {
    const catalog = buildCatalog(SNAPSHOT_FEEDS);
    const mats = catalog.items.find((i) => i.id === 'training-recYtOVOnv2DW5XTv')!;
    const clone = toOpportunity(
      sample({
        id: 'dup-mats',
        title: mats.title,
        organization: mats.organization,
        url: mats.url,
        round: mats.provenance.evidence?.round ?? null,
      }),
    );
    expect(findDedupeCollisions([mats, clone]).length).toBeGreaterThan(0);
  });
});

describe('attribution', () => {
  it('credits the official page for independent listings on cards and detail', () => {
    const o = toOpportunity(sample({ id: 'attr-official' }));
    const a = listingAttribution(o);
    expect(a.kind).toBe('official');
    expect(a.shortLabel).toBe('Official page');
    expect(a.href).toBe('https://example.test/fellowship-winter-2099');
    expect(attributionCardLabel(a)).toBe('Source: Official page');
    expect(a.href).not.toContain('aisafety.com');
  });

  it('credits an X post when that is the researched source', () => {
    const o = toOpportunity(
      sample({
        id: 'attr-x',
        sourceType: 'x-post',
        xPostUrl: 'https://x.com/test/status/1',
        xAccount: '@test',
        xPostDate: '2026-10-01',
        officialUrl: 'https://example.test/official',
      }),
    );
    const a = listingAttribution(o);
    expect(a.kind).toBe('x-post');
    expect(a.href).toBe('https://x.com/test/status/1');
    expect(attributionCardLabel(a)).toBe('Source: X announcement');
  });

  it('keeps AISafety.com attribution for imported listings', () => {
    const catalog = buildCatalog(SNAPSHOT_FEEDS);
    const mats = catalog.items.find((i) => i.id === 'training-recYtOVOnv2DW5XTv')!;
    const a = listingAttribution(mats);
    expect(a.kind).toBe('aisafety');
    expect(a.shortLabel).toBe('AISafety.com');
    expect(a.href).toContain('aisafety.com');
  });
});

describe('independentCatalogId', () => {
  it('uses a stable independent- prefix', () => {
    expect(independentCatalogId('abc')).toBe('independent-abc');
  });

  it('documents the researcher data directory', () => {
    expect(INDEPENDENT_LISTINGS_DIR).toBe('data/independent-listings');
  });
});
