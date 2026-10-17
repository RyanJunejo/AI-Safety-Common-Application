import type { Opportunity } from '../types.js';

/**
 * Duplicate detection across AISafety.com and independently researched listings.
 * Two records collide when URL, organization, title, and cohort all match
 * (case-insensitive, with URLs normalized).
 */

function normText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Strip tracking noise and trailing slashes so the same page compares equal. */
export function normalizeListingUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|ref$|fbclid|gclid)/i.test(key)) u.searchParams.delete(key);
    }
    let path = u.pathname.replace(/\/+$/, '');
    if (!path) path = '/';
    u.pathname = path;
    u.hostname = u.hostname.toLowerCase();
    u.protocol = u.protocol.toLowerCase();
    return u.toString();
  } catch {
    return normText(url);
  }
}

/** Cohort / round label used for dedupe: explicit round when present, else empty. */
export function cohortKey(o: Pick<Opportunity, 'title' | 'provenance'>): string {
  const round = o.provenance.evidence?.round;
  return normText(round);
}

export function dedupeKey(o: Pick<Opportunity, 'url' | 'organization' | 'title' | 'provenance'>): string {
  return [normalizeListingUrl(o.url), normText(o.organization), normText(o.title), cohortKey(o)].join('\u0001');
}

export interface DedupeCollision {
  key: string;
  ids: string[];
}

/** Returns groups of catalog ids that share a dedupe key (size ≥ 2). */
export function findDedupeCollisions(items: readonly Pick<Opportunity, 'id' | 'url' | 'organization' | 'title' | 'provenance'>[]): DedupeCollision[] {
  const byKey = new Map<string, string[]>();
  for (const item of items) {
    const key = dedupeKey(item);
    const list = byKey.get(key);
    if (list) list.push(item.id);
    else byKey.set(key, [item.id]);
  }
  return [...byKey.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, ids: [...ids].sort() }))
    .sort((a, b) => a.ids[0]!.localeCompare(b.ids[0]!));
}

export function formatDedupeError(collisions: DedupeCollision[]): string {
  const lines = collisions.map((c) => `  ${c.ids.join(' ↔ ')}`);
  return `Duplicate listings (same URL, organization, title, and cohort):\n${lines.join('\n')}`;
}
