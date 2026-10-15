/**
 * Fabricated independent listings for tests only. Do not import into production sync paths.
 */
import type { OpportunityDetail } from '../types.js';
import { toOpportunity } from './normalize.js';
import { parseIndependentListing, type IndependentListing } from './schema.js';

export function testIndependentRecord(overrides: Partial<IndependentListing> & Pick<IndependentListing, 'id'>): IndependentListing {
  const { id, ...rest } = overrides;
  return parseIndependentListing({
    id,
    kind: 'program',
    format: 'Fellowship',
    title: 'Test Fellowship: Winter 2099',
    organization: 'Test Institute',
    summary: 'A fabricated listing used only in tests.',
    description: 'Longer test description.',
    url: 'https://example.test/fellowship-winter-2099',
    focus: ['technical'],
    location: { text: 'Online', countries: [], remote: true, remoteCountries: [] },
    status: 'open',
    deadline: '2099-01-15',
    deadlineTimezone: 'America/Los_Angeles',
    startDate: '2099-02-01',
    startText: null,
    round: 'Winter 2099',
    sourceType: 'official',
    officialUrl: 'https://example.test/fellowship-winter-2099',
    xPostUrl: null,
    xAccount: null,
    xPostDate: null,
    lastVerified: '2026-10-15',
    facts: [{ label: 'Stipend', value: 'None' }],
    tags: ['Entry bar: Low'],
    ...rest,
  });
}

export function testIndependentOpportunity(overrides: Partial<IndependentListing> & Pick<IndependentListing, 'id'>): OpportunityDetail {
  return toOpportunity(testIndependentRecord(overrides));
}
