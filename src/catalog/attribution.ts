import { formatDay } from './dates.js';
import type { Opportunity } from './types.js';

/** How the site credits a listing's actual research/import source. */

export interface Attribution {
  /** Short label for cards, e.g. "Official page" or "AISafety.com". */
  shortLabel: string;
  /** Primary credited href (card link). */
  href: string;
  /** Kind of source, for detail-page copy. */
  kind: 'aisafety' | 'official' | 'x-post' | 'both';
  /** AISafety.com last-updated day, when applicable. */
  updatedOn: string | null;
  /** Independent evidence fields used on the detail page. */
  officialUrl: string | null;
  xPostUrl: string | null;
  xAccount: string | null;
  xPostDate: string | null;
  lastVerified: string | null;
  license: 'CC BY 4.0' | null;
}

export function listingAttribution(o: Opportunity): Attribution {
  if (o.provenance.source === 'independent research') {
    const ev = o.provenance.evidence;
    const official = ev?.officialUrl ?? o.provenance.listingUrl;
    const kind = ev?.sourceType === 'x-post' ? 'x-post' : ev?.sourceType === 'both' ? 'both' : 'official';
    return {
      shortLabel: kind === 'x-post' ? 'X announcement' : 'Official page',
      href: kind === 'x-post' && ev?.xPostUrl ? ev.xPostUrl : official,
      kind,
      updatedOn: null,
      officialUrl: official,
      xPostUrl: ev?.xPostUrl ?? null,
      xAccount: ev?.xAccount ?? null,
      xPostDate: ev?.xPostDate ?? null,
      lastVerified: ev?.lastVerified ?? null,
      license: null,
    };
  }

  return {
    shortLabel: 'AISafety.com',
    href: o.provenance.listingUrl,
    kind: 'aisafety',
    updatedOn: o.provenance.updatedOn,
    officialUrl: null,
    xPostUrl: null,
    xAccount: null,
    xPostDate: null,
    lastVerified: null,
    license: o.provenance.license,
  };
}

/** Compact card line: "Source: Official page". */
export function attributionCardLabel(a: Attribution): string {
  return `Source: ${a.shortLabel}`;
}

export function formatVerified(day: string | null): string | null {
  return day ? `Last verified ${formatDay(day)}` : null;
}
