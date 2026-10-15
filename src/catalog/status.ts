import { daysBetween, formatDay } from './dates.js';
import type { Opportunity } from './types.js';

export type LiveState = 'open' | 'upcoming' | 'closed' | 'recurring' | 'ongoing' | 'unknown';

export interface LiveStatus {
  state: LiveState;
  /** Short badge text, e.g. "Open", "Opening soon". */
  label: string;
  /** One line, e.g. "Closes Oct 18, 2026". */
  detail: string;
  /** Calendar days until the published deadline, when there is one ahead. */
  daysLeft: number | null;
}

const ONGOING_LABEL: Record<Opportunity['kind'], string> = {
  program: 'Ongoing',
  course: 'Anytime',
  job: 'Hiring',
  community: 'Open to join',
};

/**
 * The status to show on `today` (YYYY-MM-DD). A published deadline is trusted over a
 * stale "Open": once the deadline day has passed, the round reads as closed.
 */
export function liveStatus(o: Pick<Opportunity, 'status' | 'deadline' | 'kind'>, today: string): LiveStatus {
  const left = o.deadline ? daysBetween(today, o.deadline) : null;
  const passed = left !== null && left < 0;
  const daysLeft = left !== null && left >= 0 ? left : null;

  switch (o.status) {
    case 'open':
      if (passed) return { state: 'closed', label: 'Closed', detail: `Deadline passed ${formatDay(o.deadline!)}`, daysLeft: null };
      return { state: 'open', label: 'Open', detail: o.deadline ? `Closes ${formatDay(o.deadline)}` : 'Open now, no deadline published', daysLeft };
    case 'upcoming':
      if (passed) return { state: 'closed', label: 'Closed', detail: `Deadline passed ${formatDay(o.deadline!)}`, daysLeft: null };
      return {
        state: 'upcoming',
        label: 'Opening soon',
        detail: o.deadline ? `Not open yet; expected to close ${formatDay(o.deadline)}` : 'Not open yet',
        daysLeft,
      };
    case 'closed':
      return { state: 'closed', label: 'Closed', detail: o.deadline ? `Closed ${formatDay(o.deadline)}` : 'Applications closed', daysLeft: null };
    case 'recurring':
      return { state: 'recurring', label: 'Runs regularly', detail: 'No round listed right now', daysLeft: null };
    case 'ongoing':
      return { state: 'ongoing', label: ONGOING_LABEL[o.kind], detail: ONGOING_LABEL[o.kind], daysLeft: null };
    default:
      return { state: 'unknown', label: 'Status unknown', detail: 'Check the official page', daysLeft: null };
  }
}

/** "Closes today", "Closes tomorrow", "Closes in 5 days". */
export function closesIn(daysLeft: number): string {
  if (daysLeft === 0) return 'Closes today';
  if (daysLeft === 1) return 'Closes tomorrow';
  return `Closes in ${daysLeft} days`;
}

/** Whether people can act on it now or soon: open, opening soon, or always available. */
export function isActionable(state: LiveState): boolean {
  return state === 'open' || state === 'upcoming' || state === 'ongoing';
}
