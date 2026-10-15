import { describe, expect, it } from 'vitest';
import { browse, NO_FILTERS } from './browse';
import { buildCatalog } from './catalog';
import { addDays, nextDigestDay, weekOf } from './dates';
import { SNAPSHOT_FEEDS } from './fixtures';
import { matchesLocation, parseLocationText } from './location';
import { normalizeCollection, normalizeJob, normalizeTraining } from './normalize';
import { liveStatus } from './status';
import type { OpportunityDetail } from './types';

const catalog = buildCatalog(SNAPSHOT_FEEDS);
const byId = new Map(catalog.items.map((i) => [i.id, i]));
const get = (id: string): OpportunityDetail => {
  const item = byId.get(id);
  if (!item) throw new Error(`missing ${id}`);
  return item;
};
const titled = (title: string) => catalog.items.find((i) => i.title === title)!;

describe('normalizing the AISafety.com feed', () => {
  it('reads every record in the snapshot', () => {
    expect(catalog.rejected).toEqual([]);
    expect(catalog.duplicates).toEqual([]);
    const count = (kind: string) => catalog.items.filter((i) => i.kind === kind).length;
    // 96 training records (8 of them cohort courses) + 29 self-study courses.
    expect({ program: count('program'), course: count('course'), job: count('job'), community: count('community') }).toEqual({
      program: 88,
      course: 37,
      job: 120,
      community: 256,
    });
  });

  it('namespaces source IDs by collection and keeps provenance', () => {
    const mats = titled('MATS: Winter 2027');
    expect(mats.id).toBe('training-recYtOVOnv2DW5XTv');
    expect(mats.provenance).toEqual({
      source: 'AISafety.com',
      collection: 'training',
      sourceId: 'recYtOVOnv2DW5XTv',
      listingUrl: 'https://aisafety.com/training',
      license: 'CC BY 4.0',
      updatedOn: '2026-09-29',
      addedOn: '2026-08-20',
    });
  });

  it('maps types, focus, status, and deadlines', () => {
    expect(titled('Iliad Fellowship: January 2027')).toMatchObject({
      kind: 'program',
      format: 'Fellowship',
      focus: ['technical'],
      status: 'open',
      deadline: '2026-11-16',
      startDate: '2027-01-04',
    });
    // Closed, but marked "not yet open": it opens later.
    expect(titled('AI Safety Camp (AISC): 12th edition')).toMatchObject({ status: 'upcoming', deadline: '2026-11-29' });
    // Recurring records are program families with no deadline of their own.
    expect(titled('ARENA (Alignment Research Engineer Accelerator)')).toMatchObject({ status: 'recurring', familyLink: 'family', deadline: null });
    // Training records of type Course belong with courses.
    expect(titled('Dilemmas and Dangers in AI: Autumn 2026')).toMatchObject({ kind: 'course', format: 'Cohort course', focus: ['general'] });
    // Self-study: "Strategy" counts as governance.
    expect(titled('AGI Strategy')).toMatchObject({ kind: 'course', format: 'Self-paced', status: 'ongoing', focus: ['governance'] });
  });

  it('gives jobs and communities no focus and no deadline', () => {
    for (const item of catalog.items.filter((i) => i.kind === 'job' || i.kind === 'community')) {
      expect(item.focus).toEqual([]);
      expect(item.deadline).toBeNull();
      expect(item.status).toBe('ongoing');
    }
  });

  it('reads locations, including remote scopes and unknowns', () => {
    expect(parseLocationText('Online & Berkeley, USA & London, UK + more')).toEqual({
      countries: ['USA', 'UK'],
      remote: true,
      remoteCountries: [],
      remoteAnywhere: true,
    });
    expect(parseLocationText('Remote (USA); San Francisco Bay Area, USA; London, UK')).toMatchObject({ countries: ['USA', 'UK'], remoteCountries: ['USA'] });
    expect(parseLocationText('Australia, New Zealand & Asia').countries).toEqual(['Australia', 'New Zealand']);
    expect(parseLocationText('New city each cohort')).toMatchObject({ countries: [], remote: false });

    expect(titled('Foresight Fellowship: 2027').location.known).toBe(false); // hybrid, place not given
    expect(titled('AI Security Bootcamp (AISB)').location.known).toBe(false); // "New city each cohort"
    expect(titled('AI Governance Taskforce: Autumn 2026').location).toMatchObject({ remote: true, countries: [], known: true });
  });

  it('keeps one copy of a duplicated record, the most recently updated', () => {
    const rec = (lastModified: string, name: string) => ({ id: 'recDup', name, url: 'https://example.org', type: ['Fellowship'], lastModified, recurring: false });
    const result = normalizeCollection('training', [rec('2026-09-01', 'Old'), rec('2026-10-01', 'New'), rec('2026-08-01', 'Older')]);
    expect(result.items.map((i) => i.title)).toEqual(['New']);
    expect(result.duplicates).toEqual(['recDup']);
  });

  it('rejects records it cannot use, and blanks malformed fields', () => {
    expect(normalizeTraining({ id: 'recX', name: 'No link' })).toEqual({ collection: 'training', sourceId: 'recX', reason: 'missing id, name, or url' });
    const job = normalizeJob({ id: 'recJ', name: 'Researcher', url: 'https://example.org/job', datePublished: 'last week', countries: 'nope' });
    expect(job).toMatchObject({ id: 'jobs-recJ', provenance: { updatedOn: null }, location: { known: false } });
  });
});

describe('deadlines and status', () => {
  const open = { kind: 'program' as const, status: 'open' as const, deadline: '2026-10-18' };

  it('treats a published deadline as the last day to apply', () => {
    expect(liveStatus(open, '2026-10-11')).toMatchObject({ state: 'open', detail: 'Closes Oct 18, 2026', daysLeft: 7 });
    expect(liveStatus(open, '2026-10-18')).toMatchObject({ state: 'open', daysLeft: 0 });
    expect(liveStatus(open, '2026-10-19')).toMatchObject({ state: 'closed', detail: 'Deadline passed Oct 18, 2026' });
  });

  it('closes an "upcoming" round whose deadline has passed', () => {
    expect(liveStatus({ ...open, status: 'upcoming' }, '2026-10-19').state).toBe('closed');
  });

  it('counts digest weeks from Monday', () => {
    expect(weekOf('2026-10-09')).toBe('2026-10-05'); // Friday → Monday
    expect(weekOf('2026-10-12')).toBe('2026-10-12');
    expect(nextDigestDay('2026-10-12')).toBe('2026-10-19');
    expect(nextDigestDay('2026-10-18')).toBe('2026-10-19');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('location preferences', () => {
  const uk = parseLocationText('London, UK');
  const loc = (text: string, remote = false) => {
    const p = parseLocationText(text);
    return { text, countries: p.countries, remote: remote || p.remote, remoteCountries: p.remoteCountries, known: p.countries.length > 0 || remote || p.remote };
  };

  it('matches unknown locations only for "Any location"', () => {
    const unknown = loc('New city each cohort');
    expect(matchesLocation(unknown, { anyLocation: true, countries: [], remote: false })).toBe(true);
    expect(matchesLocation(unknown, { anyLocation: false, countries: ['UK'], remote: true })).toBe(false);
  });

  it('matches by country, or by remote availability and its scope', () => {
    expect(uk.countries).toEqual(['UK']);
    expect(matchesLocation(loc('London, UK'), { anyLocation: false, countries: ['UK'], remote: false })).toBe(true);
    expect(matchesLocation(loc('London, UK'), { anyLocation: false, countries: ['Canada'], remote: true })).toBe(false);
    expect(matchesLocation(loc('Online'), { anyLocation: false, countries: ['Canada'], remote: true })).toBe(true);
    expect(matchesLocation(loc('Online'), { anyLocation: false, countries: ['Canada'], remote: false })).toBe(false);
    expect(matchesLocation(loc('Remote (USA)'), { anyLocation: false, countries: ['Canada'], remote: true })).toBe(false);
    expect(matchesLocation(loc('Remote (USA)'), { anyLocation: false, countries: ['USA'], remote: true })).toBe(true);
  });
});

describe('browsing', () => {
  const today = '2026-10-09';

  it('lists open rounds first, soonest deadline first, and hides closed ones by default', () => {
    const programs = browse(catalog.items, { ...NO_FILTERS, kind: 'program' }, today);
    const states = programs.map((p) => liveStatus(p, today).state);
    expect(states[0]).toBe('open');
    expect(states).not.toContain('closed');
    const deadlines = programs.filter((p) => liveStatus(p, today).state === 'open' && p.deadline).map((p) => p.deadline!);
    expect(deadlines).toEqual([...deadlines].sort());
  });

  it('shows a recurring program only while none of its rounds is open or upcoming', () => {
    const programs = browse(catalog.items, { ...NO_FILTERS, kind: 'program' }, today).map((p) => p.title);
    expect(programs).toContain('Iliad Fellowship: January 2027');
    expect(programs).not.toContain('Iliad Fellowship'); // the family: a round is open
    expect(programs).toContain('ARENA (Alignment Research Engineer Accelerator)'); // no round listed
  });

  it('ignores the focus filter for jobs and communities', () => {
    const all = browse(catalog.items, { ...NO_FILTERS, focus: ['governance'] }, today);
    expect(all.some((o) => o.kind === 'job')).toBe(true);
    expect(all.filter((o) => o.kind === 'program').every((o) => o.focus.includes('governance'))).toBe(true);
  });

  it('searches titles, organizations, and places', () => {
    const results = browse(catalog.items, { ...NO_FILTERS, q: 'iliad intensive' }, today).map((o) => o.title);
    expect(results).toContain('Iliad Intensive: January 2027');
  });

  it('filters by country and remote availability', () => {
    const results = browse(catalog.items, { ...NO_FILTERS, kind: 'community', country: 'Germany' }, today);
    expect(results.length).toBeGreaterThan(3);
    expect(results.every((o) => o.location.countries.includes('Germany'))).toBe(true);
    const remote = browse(catalog.items, { ...NO_FILTERS, kind: 'program', remote: true }, today);
    expect(remote.every((o) => o.location.remote)).toBe(true);
    expect(get('training-recCxaxr5fdB0gVrM').location.remote).toBe(true);
  });
});
