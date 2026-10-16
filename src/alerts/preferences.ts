import { matchesFocus } from '../catalog/browse.js';
import { ANY_LOCATION, matchesLocation, type LocationPreference } from '../catalog/location.js';
import { FOCUSES, KINDS, type Focus, type Kind, type Opportunity } from '../catalog/types.js';

/** What a subscriber wants to hear about. Focus applies to programs and courses only. */
export interface AlertPreferences {
  kinds: Kind[];
  focus: Focus[];
  location: LocationPreference;
}

export const DEFAULT_PREFERENCES: AlertPreferences = {
  kinds: [...KINDS],
  focus: [...FOCUSES],
  location: ANY_LOCATION,
};

/** Whether a listing is a match for someone's alert preferences. */
export function matchesPreferences(o: Pick<Opportunity, 'kind' | 'focus' | 'location'>, prefs: AlertPreferences): boolean {
  if (!prefs.kinds.includes(o.kind)) return false;
  if (!matchesFocus(o, prefs.focus.length ? prefs.focus : FOCUSES)) return false;
  return matchesLocation(o.location, prefs.location);
}

/** Problems that would make preferences match nothing, in words for the settings page. */
export function preferenceProblems(prefs: AlertPreferences): string[] {
  const problems: string[] = [];
  if (prefs.kinds.length === 0) problems.push('Choose at least one kind of opportunity.');
  if (prefs.kinds.some((k) => k === 'program' || k === 'course') && prefs.focus.length === 0) problems.push('Choose at least one focus.');
  if (!prefs.location.anyLocation && prefs.location.countries.length === 0 && !prefs.location.remote) {
    problems.push('Choose a country, remote, or any location.');
  }
  return problems;
}
