import type { Question } from './data/schema';
import { CATALOG_PROGRAMS, type CatalogProgram } from './data/catalog';
import { roundStatus, type RoundStatus } from './domain/round';
import { EMPTY_ENTRY, type Answer, type Application, type AppState, type Recommender } from './state/app';

export const STATEMENT_MIN_WORDS = 100;
export const STATEMENT_MAX_WORDS = 500;

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

const filled = (...values: string[]) => values.every((v) => v.trim() !== '');

export const SECTIONS = [
  {
    id: 'profile',
    title: 'Profile',
    complete: (a: Application) => filled(a.profile.firstName, a.profile.lastName, a.profile.email, a.profile.country, a.profile.citizenship),
  },
  {
    id: 'background',
    title: 'Education & experience',
    complete: (a: Application) => filled(a.background.education, a.background.currentRole, a.background.yearsExperience),
  },
  {
    id: 'work',
    title: 'Work & links',
    complete: (a: Application) => filled(a.work.cvFileName) && (filled(a.work.sampleUrl) || filled(a.work.sampleSummary)),
  },
  {
    id: 'availability',
    title: 'Availability',
    complete: (a: Application) =>
      filled(a.availability.startDate, a.availability.commitment, a.availability.needsVisa) && a.availability.locations.length > 0,
  },
  {
    id: 'statement',
    title: 'Personal statement',
    complete: (a: Application) => {
      const n = countWords(a.statement);
      return n >= STATEMENT_MIN_WORDS && n <= STATEMENT_MAX_WORDS;
    },
  },
] as const;

export type SectionKey = (typeof SECTIONS)[number]['id'];

export function applicationProgress(a: Application) {
  const done = SECTIONS.filter((s) => s.complete(a)).length;
  return { done, total: SECTIONS.length, complete: done === SECTIONS.length };
}

/** How many choices a multi-select asks for, when the program states it (e.g. "which two"). */
function choiceRange(q: Question): { min: number; max: number } {
  const len = q.statedLength?.unit === 'items' ? q.statedLength : null;
  return { min: len?.min ?? 1, max: len?.max ?? Infinity };
}

export function isAnswered(q: Question, value: Answer | undefined): boolean {
  if (value === undefined) return false;
  if (Array.isArray(value)) {
    if (q.format === 'ranking') return value.length === (q.options?.length ?? 0);
    const { min, max } = choiceRange(q);
    return value.length >= min && value.length <= max;
  }
  return value.trim() !== '';
}

export function requestedRecommenders(recommenders: Recommender[]): Recommender[] {
  return recommenders.filter((r) => r.requestedAt && filled(r.name, r.email));
}

export type ProgramStatus = 'not-added' | 'not-started' | 'in-progress' | 'ready' | 'submitted' | 'closed';

export interface Requirements {
  program: CatalogProgram;
  round: RoundStatus;
  commonApp: boolean;
  questions: { answered: number; total: number };
  recommenders: { have: number; need: number };
  confirmations: { done: number; total: number };
  status: ProgramStatus;
  /** What still blocks submission, in plain words. */
  blockers: string[];
}

export function requirements(state: AppState, program: CatalogProgram, now: Date): Requirements {
  const entry = state.programs[program.program.id];
  const e = entry ?? EMPTY_ENTRY;
  const round = roundStatus(program.program, now);
  const asked = [...program.choices, ...program.questions];
  const answered = asked.filter((q) => isAnswered(q, e.answers[q.id])).length;
  const have = Math.min(requestedRecommenders(state.recommenders).length, program.references);
  const confirmed = program.confirmations.filter((q) => e.confirmations[q.id]).length;
  const commonApp = applicationProgress(state.application).complete;

  const blockers: string[] = [];
  if (round.state !== 'open') blockers.push(round.state === 'closed' ? 'This round is closed.' : 'Check the round is still open.');
  if (!commonApp) blockers.push('Finish your Common Application.');
  if (answered < asked.length) blockers.push(`Answer ${asked.length - answered} more program question${asked.length - answered === 1 ? '' : 's'}.`);
  if (have < program.references) {
    const n = program.references - have;
    blockers.push(`Request ${n} more recommendation${n === 1 ? '' : 's'}.`);
  }

  let status: ProgramStatus;
  if (!entry) status = 'not-added';
  else if (entry.submittedAt) status = 'submitted';
  else if (round.state === 'closed') status = 'closed';
  else if (blockers.length === 0) status = 'ready';
  else if (answered === 0 && Object.keys(e.answers).length === 0) status = 'not-started';
  else status = 'in-progress';

  return {
    program,
    round,
    commonApp,
    questions: { answered, total: asked.length },
    recommenders: { have, need: program.references },
    confirmations: { done: confirmed, total: program.confirmations.length },
    status,
    blockers,
  };
}

export function myPrograms(state: AppState, now: Date): Requirements[] {
  return CATALOG_PROGRAMS.filter((c) => state.programs[c.program.id]).map((c) => requirements(state, c, now));
}

/** Escapes a value for a CSV cell. */
export function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function answerText(value: Answer | undefined): string {
  if (value === undefined) return '';
  return Array.isArray(value) ? value.join('; ') : value;
}
