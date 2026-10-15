import { describe, expect, it } from 'vitest';
import { makeLocation } from '../catalog/location';
import type { Opportunity } from '../catalog/types';
import { renderEmail } from './email';
import { planAlerts, type CatalogEvent, type PlanInput, type Subscriber } from './plan';
import { DEFAULT_PREFERENCES, matchesPreferences } from './preferences';

/** The week of Monday Oct 12, 2026. */
const MON = '2026-10-12';
const TUE = '2026-10-13';
const WED = '2026-10-14';

function opp(id: string, o: Partial<Opportunity> = {}): Opportunity {
  return {
    id,
    kind: 'program',
    format: 'Fellowship',
    title: id,
    organization: null,
    summary: '',
    url: `https://example.org/${id}`,
    focus: ['technical'],
    location: makeLocation('Online', [], true),
    status: 'open',
    deadline: '2026-11-30',
    startDate: null,
    startText: null,
    familyLink: 'none',
    familyId: null,
    familyCandidates: [],
    facts: [],
    tags: [],
    provenance: { source: 'AISafety.com', collection: 'training', sourceId: id, listingUrl: '', license: 'CC BY 4.0', updatedOn: null, addedOn: null },
    ...o,
  };
}

const event = (opportunityId: string, day: string, type: CatalogEvent['type'] = 'listed', baseline = false): CatalogEvent => ({
  opportunityId,
  type,
  day,
  at: `${day}T08:00:05.000Z`,
  baseline,
});

const sub = (o: Partial<Subscriber> = {}): Subscriber => ({
  userId: 'u1',
  email: 'ada@example.com',
  preferences: DEFAULT_PREFERENCES,
  saved: [],
  follows: [],
  ...o,
});

function input(o: Partial<PlanInput> & { items?: Opportunity[] }): PlanInput {
  const { items = [], ...rest } = o;
  return {
    today: MON,
    digestDue: true,
    catalogFresh: true,
    subscribers: [sub()],
    opportunities: new Map(items.map((i) => [i.id, i])),
    events: [],
    sent: new Set(),
    ...rest,
  };
}

const keysOf = (emails: ReturnType<typeof planAlerts>) => emails.map((e) => e.deliveryKey);

describe('weekly digest', () => {
  it('sends newly listed and newly opened matches on Monday', () => {
    const items = [opp('a'), opp('b'), opp('c', { status: 'upcoming' })];
    const emails = planAlerts(input({ items, events: [event('a', '2026-10-07'), event('b', '2026-10-08', 'opened'), event('c', MON)] }));
    expect(keysOf(emails)).toEqual(['digest:u1:2026-10-12']);
    expect(emails[0]!.matches.map((m) => [m.opportunity.id, m.change])).toEqual([
      ['a', 'listed'],
      ['b', 'opened'],
      ['c', 'listed'],
    ]);
  });

  it('never announces the baseline import', () => {
    const emails = planAlerts(input({ items: [opp('a')], events: [event('a', '2026-10-09', 'listed', true)] }));
    expect(emails).toEqual([]);
  });

  it('skips listings that closed, or that it already announced', () => {
    const items = [opp('closed', { deadline: '2026-10-10' }), opp('told'), opp('new')];
    const events = [event('closed', '2026-10-08'), event('told', '2026-10-08'), event('new', '2026-10-08')];
    const emails = planAlerts(input({ items, events, sent: new Set(['u1|match:told:listed']) }));
    expect(emails[0]!.matches.map((m) => m.opportunity.id)).toEqual(['new']);
  });

  it('announces an upcoming listing again when it opens', () => {
    const items = [opp('a')];
    const events = [event('a', '2026-10-06'), event('a', '2026-10-09', 'opened')];
    const emails = planAlerts(input({ items, events, sent: new Set(['u1|match:a:listed']) }));
    expect(emails[0]!.matches).toMatchObject([{ change: 'opened' }]);
  });

  it('respects types, focus, and location, but not focus for jobs and communities', () => {
    const items = [
      opp('gov', { focus: ['governance'] }),
      opp('tech'),
      opp('job', { kind: 'job', focus: [], status: 'ongoing', deadline: null }),
      opp('london', { location: makeLocation('London, UK', ['UK'], false) }),
      opp('unknown', { location: makeLocation(null, [], false) }),
    ];
    const prefs = { kinds: ['program', 'job'] as const, focus: ['governance'] as const, location: { anyLocation: false, countries: ['Canada'], remote: true } };
    const subscriber = sub({ preferences: { kinds: [...prefs.kinds], focus: [...prefs.focus], location: prefs.location } });
    const emails = planAlerts(input({ items, subscribers: [subscriber], events: items.map((i) => event(i.id, '2026-10-08')) }));
    expect(emails[0]!.matches.map((m) => m.opportunity.id).sort()).toEqual(['gov', 'job']);
    expect(matchesPreferences(items[4]!, { ...DEFAULT_PREFERENCES })).toBe(true); // "Any location" matches unknown places
  });

  it('waits for Monday, and catches up later in the week if Monday was missed', () => {
    const items = [opp('a')];
    const events = [event('a', TUE)];
    expect(planAlerts(input({ today: WED, digestDue: false, items, events }))).toEqual([]);
    expect(keysOf(planAlerts(input({ today: WED, digestDue: true, items, events })))).toEqual(['digest:u1:2026-10-12']);
  });

  it('holds new-listing alerts when the catalog sync failed', () => {
    const emails = planAlerts(input({ catalogFresh: false, items: [opp('a')], events: [event('a', '2026-10-08')] }));
    expect(emails).toEqual([]);
  });
});

describe('same-day alerts for urgent new matches', () => {
  it('sends a new match that closes before the next digest', () => {
    const items = [opp('soon', { deadline: '2026-10-16' }), opp('later', { deadline: '2026-10-30' })];
    const emails = planAlerts(input({ today: WED, digestDue: false, items, events: [event('soon', WED), event('later', WED)] }));
    expect(keysOf(emails)).toEqual(['daily:u1:2026-10-14']);
    expect(emails[0]!.urgent.map((m) => m.opportunity.id)).toEqual(['soon']);
    // The digest won't repeat it.
    expect(emails[0]!.itemKeys).toContain('match:soon:listed');
  });

  it('counts a deadline on digest day itself as too late to wait for', () => {
    const items = [opp('mon', { deadline: '2026-10-19' })];
    expect(planAlerts(input({ today: WED, digestDue: false, items, events: [event('mon', WED)] }))[0]!.urgent).toHaveLength(1);
  });

  it('leaves Monday to the digest, and never applies to listings without deadlines', () => {
    const items = [opp('soon', { deadline: '2026-10-14' }), opp('job', { kind: 'job', status: 'ongoing', deadline: null, focus: [] })];
    const monday = planAlerts(input({ today: MON, items, events: [event('soon', MON), event('job', MON)] }));
    expect(keysOf(monday)).toEqual(['digest:u1:2026-10-12']);
    const wednesday = planAlerts(input({ today: WED, digestDue: false, items, events: [event('job', WED)] }));
    expect(wednesday).toEqual([]);
  });
});

describe('opening alerts for followed programs', () => {
  const family = opp('fam', { status: 'recurring', familyLink: 'family', deadline: null });
  const cohort = (o: Partial<Opportunity> = {}) => opp('cohort', { familyLink: 'linked', familyId: 'fam', deadline: '2026-11-20', ...o });
  const follower = sub({ follows: [{ familyId: 'fam', since: '2026-10-01T00:00:00.000Z' }] });

  it('tells followers the day a new round opens', () => {
    const emails = planAlerts(input({ today: WED, digestDue: false, subscribers: [follower], items: [family, cohort()], events: [event('cohort', WED, 'opened')] }));
    expect(emails).toHaveLength(1);
    expect(emails[0]!.openings).toMatchObject([{ opportunity: { id: 'cohort' }, family: { id: 'fam' } }]);
    expect(renderEmail(emails[0]!, { siteUrl: 'https://safetyapps.org', unsubscribeUrl: 'https://safetyapps.org/u' }).subject).toBe('Now open: cohort');
  });

  it('holds a cohort that is still waiting for family review', () => {
    const inReview = cohort({ familyLink: 'review', familyId: null, familyCandidates: ['fam'] });
    expect(planAlerts(input({ today: WED, digestDue: false, subscribers: [follower], items: [family, inReview], events: [event('cohort', WED)] }))).toEqual([]);
    // Once reviewed and linked, the follower hears about it, within two weeks of the opening.
    const linked = planAlerts(input({ today: '2026-10-20', digestDue: false, subscribers: [follower], items: [family, cohort()], events: [event('cohort', WED)] }));
    expect(linked[0]!.openings).toHaveLength(1);
  });

  it('skips rounds that opened before the person followed, or that are not open', () => {
    const late = sub({ follows: [{ familyId: 'fam', since: '2026-10-14T12:00:00.000Z' }] });
    expect(planAlerts(input({ today: WED, digestDue: false, subscribers: [late], items: [family, cohort()], events: [event('cohort', WED)] }))).toEqual([]);
    const upcoming = cohort({ status: 'upcoming' });
    expect(planAlerts(input({ today: WED, digestDue: false, subscribers: [follower], items: [family, upcoming], events: [event('cohort', WED)] }))).toEqual([]);
  });
});

describe('deadline reminders for saved listings', () => {
  const saved = (savedOn: string) => sub({ saved: [{ opportunityId: 'a', savedOn }] });
  const items = [opp('a', { deadline: '2026-10-21' })];
  const remindersOn = (today: string, savedOn = '2026-10-01', sent = new Set<string>()) =>
    planAlerts(input({ today, digestDue: false, subscribers: [saved(savedOn)], items, sent })).flatMap((e) => e.reminders.map((r) => r.daysLeft));

  it('reminds 7 and 2 calendar days before the deadline', () => {
    const days = ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21'];
    const sent = new Set<string>();
    const log: [string, number[]][] = [];
    for (const day of days) {
      const emails = planAlerts(input({ today: day, digestDue: false, subscribers: [saved('2026-10-01')], items, sent }));
      emails.forEach((e) => e.itemKeys.forEach((k) => sent.add(`u1|${k}`)));
      log.push([day, emails.flatMap((e) => e.reminders.map((r) => r.daysLeft))]);
    }
    expect(log.filter(([, r]) => r.length)).toEqual([
      ['2026-10-14', [7]],
      ['2026-10-19', [2]],
    ]);
  });

  it('sends a missed reminder at the next run, but not one that was never due', () => {
    expect(remindersOn('2026-10-16')).toEqual([5]); // the 7-day reminder, two days late
    expect(remindersOn('2026-10-16', '2026-10-15')).toEqual([]); // saved after the 7-day mark
    expect(remindersOn('2026-10-19', '2026-10-15')).toEqual([2]);
  });

  it('stops once the deadline passes, and skips closed rounds', () => {
    expect(remindersOn('2026-10-22')).toEqual([]);
    const closed = [opp('a', { deadline: '2026-10-21', status: 'closed' })];
    expect(planAlerts(input({ today: '2026-10-14', digestDue: false, subscribers: [saved('2026-10-01')], items: closed }))).toEqual([]);
  });

  it('still reminds on a day the sync failed', () => {
    const emails = planAlerts(input({ today: '2026-10-14', digestDue: false, catalogFresh: false, subscribers: [saved('2026-10-01')], items }));
    expect(emails[0]!.reminders).toHaveLength(1);
  });

  it('renders with the published date and a prompt to check the exact time', () => {
    const [email] = planAlerts(input({ today: '2026-10-14', digestDue: false, subscribers: [saved('2026-10-01')], items }));
    const rendered = renderEmail(email!, { siteUrl: 'https://safetyapps.org', unsubscribeUrl: 'https://safetyapps.org/api/unsubscribe?token=t' });
    expect(rendered.subject).toBe('Closes in 7 days: a');
    expect(rendered.text).toContain('Closes in 7 days: Oct 21, 2026 (as published)');
    expect(rendered.text).toContain('Check the official page for the exact closing time.');
    expect(rendered.text).toContain('https://safetyapps.org/opportunities/a');
    expect(rendered.html).toContain('https://safetyapps.org/api/unsubscribe?token=t');
    expect(rendered.text).toContain('AISafety.com (CC BY 4.0)');
  });
});

it('sends one daily email and one digest at most, without repeating items between them', () => {
  const family = opp('fam', { status: 'recurring', familyLink: 'family', deadline: null });
  const cohort = opp('cohort', { familyLink: 'linked', familyId: 'fam' });
  const subscriber = sub({ follows: [{ familyId: 'fam', since: '2026-10-01T00:00:00.000Z' }] });
  const emails = planAlerts(input({ today: MON, subscribers: [subscriber], items: [family, cohort, opp('other')], events: [event('cohort', MON, 'opened'), event('other', MON)] }));
  expect(keysOf(emails)).toEqual(['daily:u1:2026-10-12', 'digest:u1:2026-10-12']);
  expect(emails[1]!.matches.map((m) => m.opportunity.id)).toEqual(['other']);
});
