/**
 * Calendar-day helpers. Source deadlines are dates without a time or timezone, so
 * days are handled as YYYY-MM-DD strings and compared as calendar days.
 */

const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: unknown): value is string {
  return typeof value === 'string' && ISO_DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** The UTC calendar day of an instant. Scheduled jobs use UTC days. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** The calendar day in the viewer's own timezone. Pages use local days. */
export function localDay(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

function toUtc(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

export function addDays(day: string, n: number): string {
  return new Date(toUtc(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(day: string): number {
  return new Date(toUtc(day)).getUTCDay();
}

export const DIGEST_WEEKDAY = 1; // Monday

/** The Monday on or before `day`. Identifies the digest week. */
export function weekOf(day: string): string {
  return addDays(day, -((weekday(day) - DIGEST_WEEKDAY + 7) % 7));
}

/** The next digest day strictly after `day`. */
export function nextDigestDay(day: string): string {
  return addDays(weekOf(day), 7);
}

const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Oct 18, 2026" */
export function formatDay(day: string): string {
  return dayFmt.format(new Date(`${day}T12:00:00Z`));
}

/** "Oct 18" */
export function formatShortDay(day: string): string {
  return shortFmt.format(new Date(`${day}T12:00:00Z`));
}
