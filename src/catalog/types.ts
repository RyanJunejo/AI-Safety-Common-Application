/**
 * The normalized SafetyApps catalog.
 *
 * Code in `src/catalog` and `src/alerts` also runs in Vercel Functions, which load
 * ES modules without a bundler. Keep it free of browser APIs and Vite features, and
 * end relative imports in `.js`.
 */

/** The four top-level categories. */
export const KINDS = ['program', 'course', 'job', 'community'] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABEL: Record<Kind, { one: string; many: string }> = {
  program: { one: 'Program', many: 'Programs' },
  course: { one: 'Course', many: 'Courses' },
  job: { one: 'Job', many: 'Jobs' },
  community: { one: 'Community', many: 'Communities' },
};

export const FOCUSES = ['technical', 'governance', 'general'] as const;
export type Focus = (typeof FOCUSES)[number];

export const FOCUS_LABEL: Record<Focus, string> = {
  technical: 'Technical',
  governance: 'Governance',
  general: 'General',
};

/** Kinds whose source records carry a technical/governance/general focus. */
export const FOCUSED_KINDS: readonly Kind[] = ['program', 'course'];

/** The AISafety.com Data API collections SafetyApps imports. */
export const COLLECTIONS = ['training', 'courses', 'jobs', 'communities'] as const;
export type Collection = (typeof COLLECTIONS)[number];

/**
 * Application status as published by the source.
 * - `open` / `upcoming` / `closed`: a cohort with an application round.
 * - `recurring`: a program family that runs regularly; its rounds are separate records.
 * - `ongoing`: always available while listed (jobs, self-paced courses, communities).
 */
export type SourceStatus = 'open' | 'upcoming' | 'closed' | 'recurring' | 'ongoing' | 'unknown';

export interface Location {
  /** As published, e.g. "Online & Berkeley, USA & London, UK". */
  text: string | null;
  /** Countries where you can take part in person. */
  countries: string[];
  /** Whether you can take part remotely or online. */
  remote: boolean;
  /** Countries a remote role is limited to. Empty when remote is open anywhere. */
  remoteCountries: string[];
  /** False when neither a country nor remote availability could be determined. */
  known: boolean;
}

/**
 * How a cohort relates to a recurring program family.
 * - `family`: this record is itself the recurring program.
 * - `linked`: a reviewed rule or a reviewer tied it to `familyId`.
 * - `review`: it may belong to a family; waiting for a person to decide.
 * - `none`: a standalone opportunity.
 */
export type FamilyLink = 'family' | 'linked' | 'review' | 'none';

export interface Fact {
  label: string;
  value: string;
}

/** Where a catalog row was researched or imported from. */
export type ListingSource = 'AISafety.com' | 'independent research';

/** Evidence for an independently researched listing (not AISafety.com). */
export interface IndependentEvidence {
  sourceType: 'official' | 'x-post' | 'both';
  /** Organization's official page — what the site credits. */
  officialUrl: string;
  xPostUrl: string | null;
  xAccount: string | null;
  /** When the X post was published (YYYY-MM-DD). */
  xPostDate: string | null;
  /** When a researcher last verified the listing (YYYY-MM-DD). */
  lastVerified: string;
  /** Cohort / round label, when applicable. */
  round: string | null;
  /** IANA timezone for the application deadline, when known. */
  deadlineTimezone: string | null;
}

export interface Provenance {
  source: ListingSource;
  /** AISafety.com collection, or `independent` for researched listings. */
  collection: Collection | 'independent';
  /** The source's stable record ID. */
  sourceId: string;
  /**
   * Page credited as this listing's source: an AISafety.com directory page, or
   * the organization's official URL for independently researched listings.
   */
  listingUrl: string;
  license: 'CC BY 4.0' | null;
  /** When the source last changed the record (YYYY-MM-DD), or published it for jobs. */
  updatedOn: string | null;
  /** When the source first listed the record (YYYY-MM-DD). */
  addedOn: string | null;
  /** Present only for independently researched listings. */
  evidence?: IndependentEvidence;
}

export interface Opportunity {
  /** `${collection}-${sourceId}`, stable across syncs. */
  id: string;
  kind: Kind;
  /** Display subtype, e.g. "Fellowship", "Bootcamp", "Self-paced", "Full-time". */
  format: string;
  title: string;
  organization: string | null;
  /** One or two sentences for cards and emails. */
  summary: string;
  /** Official page or join link. */
  url: string;
  focus: Focus[];
  location: Location;
  status: SourceStatus;
  /** Published application deadline, date only (YYYY-MM-DD). */
  deadline: string | null;
  /** Published start date (YYYY-MM-DD), or approximate text when that's all there is. */
  startDate: string | null;
  startText: string | null;
  familyLink: FamilyLink;
  /** For `linked` cohorts, the family's opportunity id. */
  familyId: string | null;
  /** For `review` cohorts, the families a reviewer should choose between. */
  familyCandidates: string[];
  /** Kind-specific details for the detail page, e.g. stipend or experience level. */
  facts: Fact[];
  /** Short labels shown on cards and searched, e.g. "Entry bar: Low". */
  tags: string[];
  provenance: Provenance;
}

/** A catalog item with its long description, as shown on detail pages. */
export interface OpportunityDetail extends Opportunity {
  description: string | null;
}
