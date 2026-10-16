import { addDays, daysBetween, nextDigestDay, weekOf, weekday, DIGEST_WEEKDAY } from '../catalog/dates.js';
import { liveStatus } from '../catalog/status.js';
import type { Opportunity } from '../catalog/types.js';
import { matchesPreferences, type AlertPreferences } from './preferences.js';

/**
 * Decides which alert emails to send on a given day. Pure: the alerts job loads the
 * inputs, and the outbox makes sending them idempotent.
 *
 * - Weekly digest (Mondays): matches that were newly listed or newly opened.
 * - Daily alert, when there's something to say:
 *   - a program the person follows opened a new round;
 *   - a new match closes before the next digest would reach them;
 *   - a saved deadline is 7 or 2 calendar days away.
 *
 * Every item has a key in the sent-items ledger, so nothing is announced twice.
 */

export type EventType = 'listed' | 'opened' | 'closed' | 'deadline-changed' | 'removed' | 'relisted';

export interface CatalogEvent {
  opportunityId: string;
  type: EventType;
  /** UTC day of the sync that saw the change. */
  day: string;
  at: string;
  /** Events from the first import describe the existing catalog, not news. */
  baseline: boolean;
}

export interface Subscriber {
  userId: string;
  email: string;
  preferences: AlertPreferences;
  saved: { opportunityId: string; savedOn: string }[];
  follows: { familyId: string; since: string }[];
}

export interface PlanInput {
  /** UTC day the job runs for. */
  today: string;
  /** Whether this run should send the weekly digest. */
  digestDue: boolean;
  /** False when today's catalog sync failed: no alerts about new or opened listings. */
  catalogFresh: boolean;
  subscribers: readonly Subscriber[];
  /** Listings currently in the catalog, families included. */
  opportunities: ReadonlyMap<string, Opportunity>;
  /** Recent catalog events. */
  events: readonly CatalogEvent[];
  /** Ledger of items already sent, as `${userId}|${itemKey}`. */
  sent: ReadonlySet<string>;
}

export const REMINDER_DAYS = [7, 2] as const;
/** How long after a round opens a follower can still be told, e.g. after a family review. */
export const OPENING_WINDOW_DAYS = 14;

export interface NewMatch {
  opportunity: Opportunity;
  /** `opened` when the listing was already known and has just opened. */
  change: 'listed' | 'opened';
}

export interface Reminder {
  opportunity: Opportunity;
  daysLeft: number;
}

export interface Opening {
  opportunity: Opportunity;
  family: Opportunity | null;
}

export interface PlannedEmail {
  /** Unique per email. Stops duplicate cron runs from sending twice. */
  deliveryKey: string;
  userId: string;
  to: string;
  kind: 'digest' | 'daily';
  day: string;
  openings: Opening[];
  urgent: NewMatch[];
  reminders: Reminder[];
  matches: NewMatch[];
  /** Ledger keys this email claims. */
  itemKeys: string[];
}

export const itemKey = {
  match: (id: string, change: NewMatch['change']) => `match:${id}:${change}`,
  opening: (id: string) => `opening:${id}`,
  reminder: (id: string, deadline: string, days: number) => `reminder:${id}:${deadline}:${days}`,
};

export function deliveryKey(kind: PlannedEmail['kind'], userId: string, day: string): string {
  return kind === 'digest' ? `digest:${userId}:${weekOf(day)}` : `daily:${userId}:${day}`;
}

/** Changes worth announcing, per listing, newest first. Baseline events never count. */
function newsByOpportunity(events: readonly CatalogEvent[], fromDay: string, toDay: string) {
  const out = new Map<string, CatalogEvent[]>();
  for (const e of events) {
    if (e.baseline || (e.type !== 'listed' && e.type !== 'opened') || e.day < fromDay || e.day > toDay) continue;
    out.set(e.opportunityId, [...(out.get(e.opportunityId) ?? []), e]);
  }
  for (const list of out.values()) list.sort((a, b) => b.at.localeCompare(a.at));
  return out;
}

const ANNOUNCEABLE = new Set(['open', 'upcoming', 'ongoing', 'recurring']);

/** New matches from events in the window that the person hasn't been told about. */
function newMatches(sub: Subscriber, input: PlanInput, fromDay: string, claimed: Set<string>): NewMatch[] {
  const out: NewMatch[] = [];
  for (const [id, list] of newsByOpportunity(input.events, fromDay, input.today)) {
    const o = input.opportunities.get(id);
    if (!o || !ANNOUNCEABLE.has(liveStatus(o, input.today).state) || !matchesPreferences(o, sub.preferences)) continue;
    // A listing that was announced as upcoming is news again when it opens.
    const change = list.find((e) => !claimed.has(itemKey.match(id, e.type as NewMatch['change'])))?.type as NewMatch['change'] | undefined;
    if (change) out.push({ opportunity: o, change });
  }
  return out;
}

function sentFor(sub: Subscriber, sent: ReadonlySet<string>): Set<string> {
  const prefix = `${sub.userId}|`;
  return new Set([...sent].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)));
}

function byDeadline(a: { opportunity: Opportunity }, b: { opportunity: Opportunity }) {
  return (a.opportunity.deadline ?? '9999').localeCompare(b.opportunity.deadline ?? '9999') || a.opportunity.title.localeCompare(b.opportunity.title);
}

function planDaily(sub: Subscriber, input: PlanInput, claimed: Set<string>): PlannedEmail | null {
  const { today } = input;
  const keys: string[] = [];

  // Followed programs that opened a round. Held for cohorts still awaiting family review.
  const openings: Opening[] = [];
  if (input.catalogFresh && sub.follows.length) {
    const news = newsByOpportunity(input.events, addDays(today, -OPENING_WINDOW_DAYS), today);
    for (const [id, list] of news) {
      const o = input.opportunities.get(id);
      if (!o || o.familyLink !== 'linked' || !o.familyId || claimed.has(itemKey.opening(id))) continue;
      const follow = sub.follows.find((f) => f.familyId === o.familyId);
      if (!follow || liveStatus(o, today).state !== 'open' || !list.some((e) => e.at >= follow.since)) continue;
      openings.push({ opportunity: o, family: input.opportunities.get(o.familyId) ?? null });
      keys.push(itemKey.opening(id));
    }
  }

  // New matches that would close before the next digest arrives. Mondays have the digest itself.
  const urgent: NewMatch[] = [];
  if (input.catalogFresh && weekday(today) !== DIGEST_WEEKDAY) {
    const digestDay = nextDigestDay(today);
    for (const m of newMatches(sub, input, today, claimed)) {
      const status = liveStatus(m.opportunity, today);
      // The exact closing time is unknown, so a deadline on digest day itself counts as too late.
      if (status.state !== 'open' || !m.opportunity.deadline || m.opportunity.deadline > digestDay) continue;
      if (openings.some((x) => x.opportunity.id === m.opportunity.id)) continue;
      urgent.push(m);
      keys.push(itemKey.match(m.opportunity.id, m.change));
    }
  }

  // Saved deadlines 7 and 2 days out. A reminder missed on its day (say, a skipped run) goes
  // out at the next run, but only if the item was saved before the reminder was due.
  const reminders: Reminder[] = [];
  for (const s of sub.saved) {
    const o = input.opportunities.get(s.opportunityId);
    if (!o?.deadline) continue;
    const state = liveStatus(o, today).state;
    if (state !== 'open' && state !== 'upcoming') continue;
    const left = daysBetween(today, o.deadline);
    const due = REMINDER_DAYS.find((d, i) => left <= d && left > (REMINDER_DAYS[i + 1] ?? -1));
    if (due === undefined || s.savedOn > addDays(o.deadline, -due)) continue;
    const key = itemKey.reminder(o.id, o.deadline, due);
    if (claimed.has(key)) continue;
    reminders.push({ opportunity: o, daysLeft: left });
    keys.push(key);
  }

  if (openings.length + urgent.length + reminders.length === 0) return null;
  // Whatever this email announces, the digest shouldn't repeat.
  for (const x of openings) keys.push(itemKey.match(x.opportunity.id, 'listed'), itemKey.match(x.opportunity.id, 'opened'));
  return {
    deliveryKey: deliveryKey('daily', sub.userId, today),
    userId: sub.userId,
    to: sub.email,
    kind: 'daily',
    day: today,
    openings: openings.sort(byDeadline),
    urgent: urgent.sort(byDeadline),
    reminders: reminders.sort((a, b) => a.daysLeft - b.daysLeft || byDeadline(a, b)),
    matches: [],
    itemKeys: [...new Set(keys)],
  };
}

function planDigest(sub: Subscriber, input: PlanInput, claimed: Set<string>): PlannedEmail | null {
  if (!input.digestDue || !input.catalogFresh) return null;
  // Since the start of the previous digest week, so a late digest still covers everything.
  const matches = newMatches(sub, input, addDays(weekOf(input.today), -6), claimed);
  if (matches.length === 0) return null;
  const order = { program: 0, course: 1, job: 2, community: 3 } as const;
  matches.sort((a, b) => order[a.opportunity.kind] - order[b.opportunity.kind] || byDeadline(a, b));
  return {
    deliveryKey: deliveryKey('digest', sub.userId, input.today),
    userId: sub.userId,
    to: sub.email,
    kind: 'digest',
    day: input.today,
    openings: [],
    urgent: [],
    reminders: [],
    matches,
    itemKeys: matches.map((m) => itemKey.match(m.opportunity.id, m.change)),
  };
}

/** Every email to send today. The daily alert is planned first, so the digest doesn't repeat it. */
export function planAlerts(input: PlanInput): PlannedEmail[] {
  const out: PlannedEmail[] = [];
  for (const sub of input.subscribers) {
    const claimed = sentFor(sub, input.sent);
    const daily = planDaily(sub, input, claimed);
    if (daily) {
      out.push(daily);
      daily.itemKeys.forEach((k) => claimed.add(k));
    }
    const digest = planDigest(sub, input, claimed);
    if (digest) out.push(digest);
  }
  return out;
}
