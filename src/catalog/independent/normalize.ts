import { makeLocation } from '../location.js';
import type { OpportunityDetail, Provenance } from '../types.js';
import type { IndependentListing } from './schema.js';

export const INDEPENDENT_ID_PREFIX = 'independent-';

export function independentCatalogId(sourceId: string): string {
  return `${INDEPENDENT_ID_PREFIX}${sourceId}`;
}

export function isIndependentId(id: string): boolean {
  return id.startsWith(INDEPENDENT_ID_PREFIX);
}

function provenance(record: IndependentListing): Provenance {
  return {
    source: 'independent research',
    collection: 'independent',
    sourceId: record.id,
    /** Credited source link: the organization's official page, not AISafety.com. */
    listingUrl: record.officialUrl,
    license: null,
    updatedOn: record.lastVerified,
    addedOn: record.lastVerified,
    evidence: {
      sourceType: record.sourceType,
      officialUrl: record.officialUrl,
      xPostUrl: record.xPostUrl ?? null,
      xAccount: record.xAccount ?? null,
      xPostDate: record.xPostDate ?? null,
      lastVerified: record.lastVerified,
      round: record.round ?? null,
      deadlineTimezone: record.deadlineTimezone ?? null,
    },
  };
}

/** Turns a validated independent listing into a catalog item. */
export function toOpportunity(record: IndependentListing): OpportunityDetail {
  const loc = record.location;
  return {
    id: independentCatalogId(record.id),
    kind: record.kind,
    format: record.format,
    title: record.title,
    organization: record.organization,
    summary: record.summary,
    url: record.url,
    focus: record.focus,
    location: makeLocation(loc.text, loc.countries, loc.remote, loc.remoteCountries),
    status: record.status,
    deadline: record.deadline ?? null,
    startDate: record.startDate ?? null,
    startText: record.startText ?? null,
    familyLink: 'none',
    familyId: null,
    familyCandidates: [],
    facts: record.facts ?? [],
    tags: record.tags ?? [],
    provenance: provenance(record),
    description: record.description ?? null,
  };
}
