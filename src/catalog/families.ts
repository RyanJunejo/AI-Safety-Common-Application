import { FAMILY_RULES, type FamilyRule } from './familyRules.js';
import type { Opportunity } from './types.js';

/** Hosts that many unrelated programs use, so sharing one says nothing about family. */
const SHARED_HOSTS = [
  'airtable.com',
  'docs.google.com',
  'forms.gle',
  'github.io',
  'greenhouse.io',
  'job-boards.greenhouse.io',
  'jobs.ashbyhq.com',
  'jobs.lever.co',
  'linktr.ee',
  'lu.ma',
  'luma.com',
  'medium.com',
  'notion.site',
  'notion.so',
  'substack.com',
  'tally.so',
  'typeform.com',
  'vercel.app',
];

function hostPath(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname}`.toLowerCase();
  } catch {
    return null;
  }
}

function isShared(host: string): boolean {
  return SHARED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** The family ID a cohort's opportunity id points to, from the family's source record ID. */
export function familyIdFor(sourceId: string): string {
  return `training-${sourceId}`;
}

export type FamilyMatch = { link: 'linked'; familyId: string } | { link: 'review'; candidates: string[] } | { link: 'none' };

/**
 * Which recurring program a cohort belongs to, using the reviewed rules.
 * One title match links it. Otherwise a shared web host, or more than one title
 * match, sends it to review.
 */
export function matchFamily(cohort: Pick<Opportunity, 'title' | 'url'>, families: readonly Opportunity[], rules: Record<string, FamilyRule> = FAMILY_RULES): FamilyMatch {
  const title = cohort.title.trim();
  const strong = Object.entries(rules)
    .filter(([, rule]) => rule.titles.some((re) => re.test(title)))
    .map(([sourceId]) => familyIdFor(sourceId));
  if (strong.length === 1) return { link: 'linked', familyId: strong[0]! };
  if (strong.length > 1) return { link: 'review', candidates: strong.sort() };

  const cohortHost = hostPath(cohort.url);
  if (!cohortHost) return { link: 'none' };
  const weak = new Set<string>();
  for (const family of families) {
    const own = hostPath(family.url)?.split('/')[0];
    const rule = rules[family.provenance.sourceId];
    const hosts = [...(own && !isShared(own) ? [own] : []), ...(rule?.hosts ?? [])];
    if (hosts.some((h) => cohortHost === h || cohortHost.startsWith(h.includes('/') ? h : `${h}/`))) weak.add(family.id);
  }
  return weak.size ? { link: 'review', candidates: [...weak].sort() } : { link: 'none' };
}

/** A reviewer's decision for a cohort: the family it belongs to, or null for a standalone opportunity. */
export type FamilyDecisions = ReadonlyMap<string, string | null>;

export interface LinkedCatalog<T extends Opportunity> {
  items: T[];
  /** Recurring programs in the feed that have no reviewed rule yet. */
  familiesWithoutRules: string[];
}

/** Sets each cohort's family link. Reviewer decisions override the rules. */
export function linkFamilies<T extends Opportunity>(items: readonly T[], decisions: FamilyDecisions = new Map(), rules: Record<string, FamilyRule> = FAMILY_RULES): LinkedCatalog<T> {
  const families = items.filter((i) => i.familyLink === 'family');
  const familiesWithoutRules = families.filter((f) => !rules[f.provenance.sourceId]).map((f) => f.id);
  const linked = items.map((item): T => {
    if (item.provenance.collection !== 'training' || item.familyLink === 'family') return item;
    if (decisions.has(item.id)) {
      const familyId = decisions.get(item.id) ?? null;
      return { ...item, familyLink: familyId ? 'linked' : 'none', familyId, familyCandidates: [] };
    }
    const match = matchFamily(item, families, rules);
    if (match.link === 'linked') return { ...item, familyLink: 'linked', familyId: match.familyId, familyCandidates: [] };
    if (match.link === 'review') return { ...item, familyLink: 'review', familyId: null, familyCandidates: match.candidates };
    return { ...item, familyLink: 'none', familyId: null, familyCandidates: [] };
  });
  return { items: linked, familiesWithoutRules };
}
