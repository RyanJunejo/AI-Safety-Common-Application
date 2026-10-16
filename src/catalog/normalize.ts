import { isIsoDay } from './dates.js';
import { makeLocation, parseLocationText, toCountry } from './location.js';
import type { Collection, Fact, Focus, Kind, OpportunityDetail, SourceStatus } from './types.js';

/**
 * Turns AISafety.com Data API records (https://aisafety.com/developers) into catalog items.
 * Fields are read defensively: a record without an id, name, or link is rejected and
 * reported, and anything else that's missing or malformed is left blank.
 */

export const SOURCE_API = 'https://aisafety.com/api/v1';

export const LISTING_URL: Record<Collection, string> = {
  training: 'https://aisafety.com/training',
  courses: 'https://aisafety.com/self-study',
  jobs: 'https://aisafety.com/jobs',
  communities: 'https://aisafety.com/communities',
};

type Raw = Record<string, unknown>;

function str(v: unknown): string | null {
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s || null;
}

function strs(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).filter((s): s is string => s !== null);
  const s = str(v);
  return s ? s.split(/\s*,\s*/).filter(Boolean) : [];
}

function day(v: unknown): string | null {
  return isIsoDay(v) ? v : null;
}

function link(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Keeps paragraph breaks but tidies spacing. */
function longText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s || null;
}

/** The first sentence or two, up to `max` characters, for cards and emails. */
export function summarize(text: string | null, max = 220): string {
  if (!text) return '';
  const flat = text.replace(/^[*\-•]\s+/gm, '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const sentences = flat.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  let out = '';
  for (const s of sentences) {
    if ((out + s).trim().length > max) break;
    out += s;
  }
  out = out.trim();
  return out || `${flat.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

function facts(entries: [string, string | null | undefined][]): Fact[] {
  return entries.filter((e): e is [string, string] => Boolean(e[1])).map(([label, value]) => ({ label, value }));
}

const FOCUS_BY_WORD: Record<string, Focus> = {
  technical: 'technical',
  'technical alignment': 'technical',
  governance: 'governance',
  policy: 'governance',
  strategy: 'governance',
  general: 'general',
  'general intro': 'general',
};

function toFocus(values: string[]): Focus[] {
  const out = new Set<Focus>();
  for (const v of values) {
    const f = FOCUS_BY_WORD[v.toLowerCase()];
    if (f) out.add(f);
  }
  return [...out];
}

function base(collection: Collection, r: Raw) {
  const sourceId = str(r.id);
  const title = str(r.name);
  return { sourceId, title, id: sourceId ? `${collection}-${sourceId}` : null };
}

export type Rejection = { collection: Collection; sourceId: string | null; reason: string };

type Result = OpportunityDetail | Rejection;

function reject(collection: Collection, sourceId: string | null, reason: string): Rejection {
  return { collection, sourceId, reason };
}

function provenance(collection: Collection, sourceId: string, updatedOn: string | null, addedOn: string | null) {
  return { source: 'AISafety.com' as const, collection, sourceId, listingUrl: LISTING_URL[collection], license: 'CC BY 4.0' as const, updatedOn, addedOn };
}

/** Training programs: recurring program families and individual cohorts. */
export function normalizeTraining(r: Raw): Result {
  const { sourceId, title, id } = base('training', r);
  const url = link(r.url);
  if (!sourceId || !id || !title || !url) return reject('training', sourceId, 'missing id, name, or url');

  const types = strs(r.type);
  const kind: Kind = types.length > 0 && types.every((t) => t === 'Course') ? 'course' : 'program';
  const format = kind === 'course' ? 'Cohort course' : types.filter((t) => t !== 'Other').join(' / ') || 'Program';
  const mode = str(r.mode);
  const locationText = str(r.location);
  const parsed = parseLocationText(locationText);
  const remote = parsed.remote || mode === 'Online' || mode === 'Online or in person';

  const recurring = r.recurring === true;
  const published = str(r.applicationStatus)?.toLowerCase() ?? null;
  let status: SourceStatus = 'unknown';
  if (recurring) status = 'recurring';
  else if (published === 'open' || published === 'rolling') status = 'open';
  else if (published === 'closed') status = r.notYetOpen === true ? 'upcoming' : 'closed';

  const description = longText(r.description);
  const entryBar = str(r.entryBar);
  const length = str(r.typicalLength) ?? str(r.lengthBucket);
  const timeCommitment = str(r.timeCommitment);
  const stipend = str(r.stipend);

  return {
    id,
    kind,
    format,
    title,
    organization: null,
    summary: str(r.homepageBlurb) ?? summarize(description),
    description,
    url,
    focus: toFocus(strs(r.focus)),
    location: makeLocation(locationText ?? (mode === 'Online' ? 'Online' : null), parsed.countries, remote, parsed.remoteCountries),
    status,
    deadline: recurring ? null : day(r.applicationsClose),
    startDate: day(r.startDate),
    startText: str(r.startDateApprox),
    familyLink: recurring ? 'family' : 'none',
    familyId: null,
    familyCandidates: [],
    facts: facts([
      ['Format', mode],
      ['Time commitment', timeCommitment],
      ['Length', length],
      ['Stipend', stipend],
      ['Entry bar', entryBar],
      ['Ends', day(r.endDate)],
    ]),
    tags: [timeCommitment, stipend, entryBar ? `${entryBar} entry bar` : null].filter((t): t is string => Boolean(t)),
    provenance: provenance('training', sourceId, day(r.lastModified), day(r.dateAdded)),
  };
}

/** Self-study courses and reading lists. Always available. */
export function normalizeCourse(r: Raw): Result {
  const { sourceId, title, id } = base('courses', r);
  const url = link(r.url);
  if (!sourceId || !id || !title || !url) return reject('courses', sourceId, 'missing id, name, or url');
  const courseType = str(r.courseType);
  const categories = strs(r.category);
  const description = longText(r.description);
  return {
    id,
    kind: 'course',
    format: courseType === 'Reading list' ? 'Reading list' : 'Self-paced',
    title,
    organization: str(r.organizer),
    summary: summarize(description),
    description,
    url,
    focus: toFocus(categories),
    location: makeLocation('Online', [], true),
    status: 'ongoing',
    deadline: null,
    startDate: null,
    startText: null,
    familyLink: 'none',
    familyId: null,
    familyCandidates: [],
    facts: facts([
      ['Type', courseType],
      ['Organizer', str(r.organizer)],
      ['Topics', categories.join(', ') || null],
    ]),
    tags: categories,
    provenance: provenance('courses', sourceId, day(r.lastModified), day(r.dateAdded)),
  };
}

/** Open roles. The source has no application deadlines for jobs. */
export function normalizeJob(r: Raw): Result {
  const { sourceId, title, id } = base('jobs', r);
  const url = link(r.url);
  if (!sourceId || !id || !title || !url) return reject('jobs', sourceId, 'missing id, name, or url');

  const locationText = str(r.location);
  const parsed = parseLocationText(locationText);
  const workLocation = strs(r.workLocation);
  const sourceCountries = strs(r.countries);
  const remote = parsed.remote || workLocation.includes('Remote');
  // Remote with no stated scope ("Remote, On-site" for a London role) is taken to mean remote within the listed countries.
  const remoteCountries = parsed.remoteAnywhere ? [] : parsed.remoteCountries.length ? parsed.remoteCountries : parsed.countries;
  const onSite = workLocation.length === 0 || workLocation.includes('On-site') || workLocation.includes('Hybrid');
  // The source's country list also names remote-only countries; those aren't places to work in person.
  const countries = onSite
    ? [...parsed.countries, ...sourceCountries.map(toCountry).filter((c): c is string => c !== null && !parsed.remoteCountries.includes(c))]
    : [];
  const description = longText(r.description);
  const roleType = strs(r.roleType);
  const skills = strs(r.skillSet);
  const experience = str(r.minimumExperience);
  const published = day(r.datePublished);

  return {
    id,
    kind: 'job',
    format: roleType.join(' / ') || 'Job',
    title,
    organization: str(r.organization),
    summary: str(r.summary) ?? summarize(description),
    description,
    url,
    focus: [],
    location: makeLocation(locationText, countries, remote, remoteCountries),
    status: 'ongoing',
    deadline: null,
    startDate: null,
    startText: null,
    familyLink: 'none',
    familyId: null,
    familyCandidates: [],
    facts: facts([
      ['Role type', roleType.join(', ') || null],
      ['Work location', workLocation.join(', ') || null],
      ['Experience', experience],
      ['Degree', str(r.requiredDegree)],
      ['Salary', str(r.salary)],
      ['Skills', skills.join(', ') || null],
    ]),
    tags: [...skills, ...workLocation],
    provenance: provenance('jobs', sourceId, published, published),
  };
}

/** Online and local AI safety communities. */
export function normalizeCommunity(r: Raw): Result {
  const { sourceId, title, id } = base('communities', r);
  if (!sourceId || !id || !title) return reject('communities', sourceId, 'missing id or name');
  const url = link(r.joinLink) ?? link(r.url) ?? LISTING_URL.communities;

  const types = strs(r.type);
  const online = types.includes('Online');
  const inPerson = types.includes('In person');
  const locationText = str(r.location);
  const parsed = parseLocationText(locationText);
  const description = longText(r.description);
  const activity = str(r.activityLevel);
  const platforms = strs(r.platformText ?? r.platform);

  return {
    id,
    kind: 'community',
    format: online && inPerson ? 'Online and in person' : online ? 'Online' : inPerson ? 'In person' : 'Community',
    title,
    organization: null,
    summary: summarize(description),
    description,
    url,
    focus: [],
    location: makeLocation(locationText ?? (online ? 'Online' : null), parsed.countries, online || parsed.remote),
    status: 'ongoing',
    deadline: null,
    startDate: null,
    startText: null,
    familyLink: 'none',
    familyId: null,
    familyCandidates: [],
    facts: facts([
      ['Platform', platforms.join(', ') || null],
      ['Activity', activity],
      ['Members', str(r.size)],
      ['Focus', str(r.focus)],
    ]),
    tags: [...platforms.filter((p) => p !== 'Local'), activity].filter((t): t is string => Boolean(t)),
    provenance: provenance('communities', sourceId, day(r.lastModified), day(r.dateAdded)),
  };
}

const NORMALIZERS: Record<Collection, (r: Raw) => Result> = {
  training: normalizeTraining,
  courses: normalizeCourse,
  jobs: normalizeJob,
  communities: normalizeCommunity,
};

export interface NormalizedCollection {
  items: OpportunityDetail[];
  rejected: Rejection[];
  /** Source IDs that appeared more than once. The most recently updated copy is kept. */
  duplicates: string[];
}

export function normalizeCollection(collection: Collection, records: readonly unknown[]): NormalizedCollection {
  const byId = new Map<string, OpportunityDetail>();
  const rejected: Rejection[] = [];
  const duplicates = new Set<string>();
  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      rejected.push(reject(collection, null, 'not an object'));
      continue;
    }
    const result = NORMALIZERS[collection](record as Raw);
    if (!('id' in result)) {
      rejected.push(result);
      continue;
    }
    const existing = byId.get(result.id);
    if (existing) {
      duplicates.add(result.provenance.sourceId);
      if ((result.provenance.updatedOn ?? '') < (existing.provenance.updatedOn ?? '')) continue;
    }
    byId.set(result.id, result);
  }
  return { items: [...byId.values()], rejected, duplicates: [...duplicates] };
}
