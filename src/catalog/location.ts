import type { Location } from './types.js';

/**
 * Country names as SafetyApps shows them. The source writes "USA" and "UK", so those
 * stay short; everything else uses its common English name.
 */
export const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
  'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia',
  'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon',
  'Canada', 'Cape Verde', 'Chad', 'Chile', 'China', 'Colombia', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic',
  'Denmark', 'Dominican Republic', 'DR Congo', 'Ecuador', 'Egypt', 'El Salvador', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji',
  'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Guatemala', 'Guinea', 'Haiti', 'Honduras',
  'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast',
  'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon',
  'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives',
  'Mali', 'Malta', 'Mauritius', 'Mexico', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Macedonia', 'Norway', 'Oman',
  'Pakistan', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar',
  'Romania', 'Russia', 'Rwanda', 'Saudi Arabia', 'Senegal', 'Serbia', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia',
  'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Sweden', 'Switzerland', 'Syria',
  'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Togo', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan',
  'Uganda', 'UK', 'Ukraine', 'United Arab Emirates', 'Uruguay', 'USA', 'Uzbekistan', 'Venezuela', 'Vietnam', 'Yemen',
  'Zambia', 'Zimbabwe',
] as const;

const ALIASES: Record<string, string> = {
  us: 'USA',
  'u.s.': 'USA',
  'u.s.a.': 'USA',
  'united states': 'USA',
  'united states of america': 'USA',
  'united kingdom': 'UK',
  'u.k.': 'UK',
  'great britain': 'UK',
  britain: 'UK',
  england: 'UK',
  scotland: 'UK',
  wales: 'UK',
  'northern ireland': 'UK',
  czechia: 'Czech Republic',
  'the netherlands': 'Netherlands',
  holland: 'Netherlands',
  'korea': 'South Korea',
  'republic of korea': 'South Korea',
  uae: 'United Arab Emirates',
  "côte d'ivoire": 'Ivory Coast',
  'cote d’ivoire': 'Ivory Coast',
  türkiye: 'Turkey',
  'hong kong sar': 'Hong Kong',
};

const BY_NAME = new Map<string, string>([...COUNTRIES.map((c) => [c.toLowerCase(), c] as const), ...Object.entries(ALIASES)]);

/** The canonical country for a name or alias, or null when it isn't a country (a city, region, or note). */
export function toCountry(name: string): string | null {
  return BY_NAME.get(name.trim().replace(/\.$/, '').toLowerCase()) ?? null;
}

const REMOTE_WORDS = /^(online|remote|virtual|anywhere|global|worldwide)$/i;

/**
 * Reads a published location such as "Online & Berkeley, USA & London, UK + more",
 * "Remote (USA); San Francisco Bay Area, USA", or "Australia, New Zealand & Asia".
 * Parts that aren't countries (cities, regions, "Various") are ignored.
 */
export function parseLocationText(text: string | null | undefined): { countries: string[]; remote: boolean; remoteCountries: string[]; remoteAnywhere: boolean } {
  const countries = new Set<string>();
  const remoteCountries = new Set<string>();
  let remote = false;
  let remoteAnywhere = false;

  const parts = (text ?? '')
    .replace(/\+\s*more\b/gi, '')
    .split(/\s*[;&/]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    // "Remote (USA)", "Remote (Global)", "Online (Europe)"
    const scoped = /^(remote|online)\s*\(([^)]*)\)$/i.exec(part);
    if (scoped) {
      remote = true;
      const where = scoped[2]!.split(',').map((s) => toCountry(s)).filter((c): c is string => c !== null);
      if (where.length) where.forEach((c) => remoteCountries.add(c));
      else remoteAnywhere = true;
      continue;
    }
    if (REMOTE_WORDS.test(part)) {
      remote = true;
      remoteAnywhere = true;
      continue;
    }
    for (const token of part.split(',')) {
      const country = toCountry(token);
      if (country) countries.add(country);
    }
  }
  return { countries: [...countries], remote, remoteCountries: [...remoteCountries], remoteAnywhere };
}

export function makeLocation(text: string | null, countries: Iterable<string>, remote: boolean, remoteCountries: Iterable<string> = []): Location {
  const c = [...new Set(countries)].sort();
  const rc = remote ? [...new Set(remoteCountries)].sort() : [];
  return { text: text?.trim() || null, countries: c, remote, remoteCountries: rc, known: remote || c.length > 0 };
}

/** A location preference, from account settings or the Explore filters. */
export interface LocationPreference {
  /** Matches everything, including listings whose location is unknown. */
  anyLocation: boolean;
  /** Countries the person can be in. */
  countries: string[];
  /** Whether remote and online listings suit them. */
  remote: boolean;
}

export const ANY_LOCATION: LocationPreference = { anyLocation: true, countries: [], remote: true };

/**
 * Whether a listing's location suits a preference. Unknown locations match only
 * "Any location". A remote listing limited to certain countries matches when the
 * person's countries include one of them, or when they haven't named any.
 */
export function matchesLocation(location: Location, pref: LocationPreference): boolean {
  if (pref.anyLocation) return true;
  if (!location.known) return false;
  const mine = new Set(pref.countries);
  if (location.countries.some((c) => mine.has(c))) return true;
  if (pref.remote && location.remote) {
    return location.remoteCountries.length === 0 || mine.size === 0 || location.remoteCountries.some((c) => mine.has(c));
  }
  return false;
}

/** "Online · USA · UK" style summary for cards. */
export function describeLocation(location: Location): string {
  if (location.text) return location.text;
  if (location.remote && location.countries.length === 0) return 'Online';
  return location.known ? location.countries.join(' · ') : 'Location not listed';
}
