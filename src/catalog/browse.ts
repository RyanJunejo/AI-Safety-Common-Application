import { matchesLocation, type LocationPreference } from './location.js';
import { isActionable, liveStatus } from './status.js';
import { FOCUSED_KINDS, type Focus, type Kind, type Opportunity } from './types.js';

export interface Filters {
  kind: Kind | null;
  q: string;
  focus: Focus[];
  country: string | null;
  remote: boolean;
  includeClosed: boolean;
}

export const NO_FILTERS: Filters = { kind: null, q: '', focus: [], country: null, remote: false, includeClosed: false };

/** The location preference an Explore search stands for. No location filter means any location. */
export function locationFilter(f: Pick<Filters, 'country' | 'remote'>): LocationPreference {
  return { anyLocation: !f.country && !f.remote, countries: f.country ? [f.country] : [], remote: f.remote };
}

/** Focus applies to programs and courses only; jobs and communities pass through. */
export function matchesFocus(o: Pick<Opportunity, 'kind' | 'focus'>, focus: readonly Focus[]): boolean {
  if (focus.length === 0 || !FOCUSED_KINDS.includes(o.kind) || o.focus.length === 0) return true;
  return o.focus.some((f) => focus.includes(f));
}

function haystack(o: Opportunity): string {
  return [o.title, o.organization, o.summary, o.format, o.location.text, ...o.tags, ...o.location.countries].join(' ').toLowerCase();
}

export function matchesQuery(o: Opportunity, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = haystack(o);
  return words.every((w) => text.includes(w));
}

/** Cohorts linked to a family, soonest first. */
export function cohortsOf(familyId: string, items: readonly Opportunity[]): Opportunity[] {
  return items
    .filter((i) => i.familyLink === 'linked' && i.familyId === familyId)
    .sort((a, b) => (b.deadline ?? '').localeCompare(a.deadline ?? ''));
}

/**
 * A recurring program is listed on its own only while none of its cohorts is open or
 * opening soon. Otherwise the cohort card stands in for it.
 */
export function hasActionableCohort(familyId: string, items: readonly Opportunity[], today: string): boolean {
  return cohortsOf(familyId, items).some((c) => isActionable(liveStatus(c, today).state));
}

const STATE_RANK = { open: 0, upcoming: 1, ongoing: 2, recurring: 3, unknown: 4, closed: 5 } as const;

/**
 * Sort order: open rounds by soonest deadline, then upcoming rounds, then always-open
 * listings by most recently updated, then recurring programs, then closed rounds.
 */
export function compareForListing(today: string) {
  return (a: Opportunity, b: Opportunity): number => {
    const sa = liveStatus(a, today).state;
    const sb = liveStatus(b, today).state;
    if (sa !== sb) return STATE_RANK[sa] - STATE_RANK[sb];
    if (sa === 'open' || sa === 'upcoming') {
      if (a.deadline && b.deadline && a.deadline !== b.deadline) return a.deadline.localeCompare(b.deadline);
      if (a.deadline !== b.deadline) return a.deadline ? -1 : 1;
    }
    if (sa === 'closed' && a.deadline !== b.deadline) return (b.deadline ?? '').localeCompare(a.deadline ?? '');
    const updated = (b.provenance.updatedOn ?? '').localeCompare(a.provenance.updatedOn ?? '');
    return updated || a.title.localeCompare(b.title);
  };
}

/** Explore results: filtered and in listing order. */
export function browse(items: readonly Opportunity[], f: Filters, today: string): Opportunity[] {
  const where = locationFilter(f);
  return items
    .filter((o) => {
      if (f.kind && o.kind !== f.kind) return false;
      const state = liveStatus(o, today).state;
      if (!f.includeClosed && state === 'closed') return false;
      if (o.familyLink === 'family' && hasActionableCohort(o.id, items, today)) return false;
      return matchesFocus(o, f.focus) && matchesLocation(o.location, where) && matchesQuery(o, f.q);
    })
    .sort(compareForListing(today));
}

/** Countries named by any listing, most common first. */
export function countriesIn(items: readonly Opportunity[]): string[] {
  const counts = new Map<string, number>();
  for (const o of items) for (const c of new Set([...o.location.countries, ...o.location.remoteCountries])) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}
