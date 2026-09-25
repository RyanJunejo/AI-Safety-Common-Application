import type { Program } from '../data/schema';

export type RoundState = 'open' | 'closed' | 'unknown';

export interface RoundStatus {
  state: RoundState;
  /** Short badge text, e.g. "Open", "Closed". */
  label: string;
  /** One-line explanation, e.g. "Deadline passed Sep 20, 2026". */
  detail: string;
}

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const DAY_MS = 86_400_000;

/** Formats the calendar date as published, in the program's own timezone (the date part of the ISO string). */
export function formatDeadline(iso: string): string {
  return dateFmt.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
}

export function formatVerified(isoDay: string): string {
  return dateFmt.format(new Date(`${isoDay}T12:00:00Z`));
}

/** An "open" record with no deadline is only trusted for this long after verification. */
export const OPEN_STATUS_TTL_DAYS = 21;

/** The most recent date any source for this program was checked. */
export function lastVerified(program: Program): string {
  return program.sources.map((s) => s.accessed).sort().at(-1)!;
}

function staleAt(program: Program): number {
  return new Date(`${lastVerified(program)}T00:00:00Z`).getTime() + OPEN_STATUS_TTL_DAYS * DAY_MS;
}

/** Deadlines in time order. */
export function sortedDeadlines(program: Program) {
  return [...program.deadlines].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/**
 * The round status to show the applicant right now.
 *
 * A recorded "open" status is never trusted past its last stated deadline, so a
 * form that stays reachable afterwards still reads as closed. When one form
 * serves several cohorts, the round stays open until the last cohort's deadline.
 * An open round without a deadline becomes "recheck" once its verification is old.
 */
export function roundStatus(program: Program, now: Date = new Date()): RoundStatus {
  const t = now.getTime();
  const deadlines = sortedDeadlines(program);
  const last = deadlines.at(-1);
  const upcoming = deadlines.filter((d) => t <= Date.parse(d.at));

  if (program.roundStatus === 'closed' || (last && upcoming.length === 0)) {
    const detail = last && t > Date.parse(last.at) ? `Deadline passed ${formatDeadline(last.at)}` : 'Not accepting applications';
    return { state: 'closed', label: 'Closed', detail };
  }
  if (program.roundStatus === 'open') {
    const next = upcoming[0];
    if (next) {
      const cohort = deadlines.length > 1 && next.label ? ` (${next.label})` : '';
      return { state: 'open', label: 'Open', detail: `Closes ${formatDeadline(next.at)}${cohort}` };
    }
    if (t > staleAt(program)) {
      return { state: 'unknown', label: 'Recheck status', detail: `Rolling; last verified open ${formatVerified(lastVerified(program))}` };
    }
    return { state: 'open', label: 'Open', detail: 'Rolling admissions, no deadline stated' };
  }
  return { state: 'unknown', label: 'Status unknown', detail: 'Check the official page' };
}

/**
 * Milliseconds until any program's displayed status could next change (a deadline
 * passing or a rolling verification going stale), or null if none is ahead.
 */
export function msUntilNextStatusChange(programs: readonly Program[], now: Date = new Date()): number | null {
  const t = now.getTime();
  const moments = programs.flatMap((p) => [
    ...p.deadlines.map((d) => Date.parse(d.at)),
    ...(p.roundStatus === 'open' && p.deadlines.length === 0 ? [staleAt(p)] : []),
  ]);
  const ahead = moments.filter((m) => m >= t);
  return ahead.length ? Math.min(...ahead) - t : null;
}
