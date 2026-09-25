import type { Program, Question, ReuseClass } from '../data/schema';
import { questionsFor } from '../data/inventory';
import { DOSSIER_FIELD_META, missingReferenceParts, REFERENCE_PART_LABEL, type Dossier } from './dossier';
import { reuseClassOf, REUSE_ORDER } from './taxonomy';
import { answerFor, progressFor, type AnswerProgress, type Workspace } from '../state/workspace';

export interface Fit {
  state: 'compatible' | 'conflict' | 'unknown';
  reason: string;
}

const norm = (s: string) => s.trim().toLowerCase();
export const isRemote = (location: string) => norm(location).startsWith('remote');

/** Whether the dossier's location preferences overlap with where the program runs. */
export function locationFit(program: Program, dossier: Dossier): Fit {
  const prefs = dossier.locationPreferences;
  const accepted = [...(prefs.remote ? ['Remote'] : []), ...prefs.places];
  const offered = program.format === 'remote' && program.locations.length === 0 ? ['Remote'] : program.locations;

  if (offered.length === 0) return { state: 'unknown', reason: 'Location not published' };
  const matches = offered.filter((loc) => (isRemote(loc) ? prefs.remote : accepted.some((a) => norm(a) === norm(loc))));
  if (matches.length > 0) return { state: 'compatible', reason: `Works for you: ${matches.join(', ')}` };
  return {
    state: 'conflict',
    reason: `Runs in ${offered.join(' or ')}; your dossier lists ${accepted.length ? accepted.join(', ') : 'no locations'}`,
  };
}

/** Stage ids an applicant completes before any shortlisting. */
export function applicationStageIds(program: Program): Set<string> {
  return new Set(program.stages.filter((s) => s.phase === 'application').map((s) => s.id));
}

export interface PrepItem {
  question: Question;
  reuse: ReuseClass;
  answer: AnswerProgress;
  /** Dossier summary backing this item, when it has a dossier field and that field is filled. */
  fromDossier: string | null;
  /** Why the item is not done yet, when the dossier can explain it. */
  gap: string | null;
  done: boolean;
  /** Counted toward readiness: required and not behind a condition. */
  counted: boolean;
}

export interface ProgramPrep {
  program: Program;
  /** Required and optional items in the upfront application, grouped by reuse class. */
  groups: Record<ReuseClass, PrepItem[]>;
  /** Questions whose prompt is not published, plus anything in later stages. */
  notYetVisible: Question[];
  later: Question[];
  requiredTotal: number;
  requiredDone: number;
}

/** Artifacts attached to an answer that still exist in the dossier. */
export function attachedArtifacts(answer: AnswerProgress, dossier: Dossier) {
  return dossier.artifacts.filter((a) => answer.artifactIds.includes(a.id));
}

export function prepItem(q: Question, answer: AnswerProgress, dossier: Dossier): PrepItem {
  const reuse = reuseClassOf(q);
  const summary = q.dossierField ? DOSSIER_FIELD_META[q.dossierField].summarize(dossier) : null;
  const attached = attachedArtifacts(answer, dossier).length;
  let gap: string | null = null;
  let done: boolean;

  if (q.format === 'timed-task') {
    // Timed tasks cannot be drafted; preparing means blocking out uninterrupted time.
    done = answer.confirmed;
  } else if (reuse === 'dossier' && q.dossierField === 'references' && q.dossierSlots && q.referenceParts) {
    // Check the exact field of the exact reference the form asks for.
    const missing = missingReferenceParts(dossier, q.dossierSlots, q.referenceParts);
    done = missing.length === 0;
    if (!done) {
      const list = missing.map((m) => `reference ${m.slot} (${m.parts.map((p) => REFERENCE_PART_LABEL[p]).join(', ')})`);
      gap = `Missing in your dossier: ${list.join('; ')}`;
    }
  } else if (reuse === 'dossier' && q.dossierField === 'artifacts') {
    done = attached > 0;
    if (!done) gap = dossier.artifacts.length ? 'Attach an artifact from your dossier' : 'Add a work artifact to your dossier';
  } else if (reuse === 'dossier' && q.dossierField) {
    done = summary !== null || answer.confirmed;
    if (!done) gap = `Add ${DOSSIER_FIELD_META[q.dossierField].label.toLowerCase()} to your dossier`;
  } else if (reuse === 'dossier' || reuse === 'attest') {
    done = answer.confirmed;
  } else {
    done = answer.status === 'final';
    if (q.dossierField === 'artifacts' && attached === 0 && dossier.artifacts.length > 0) {
      gap = 'Attach the artifact this answer describes';
    }
  }
  const counted = q.required !== 'optional' && !q.condition;
  return { question: q, reuse, answer, fromDossier: summary, gap, done, counted };
}

export function programPrep(program: Program, ws: Workspace): ProgramPrep {
  const progress = progressFor(ws, program.id);
  const upfront = applicationStageIds(program);
  const groups = Object.fromEntries(REUSE_ORDER.map((r) => [r, [] as PrepItem[]])) as Record<ReuseClass, PrepItem[]>;
  const notYetVisible: Question[] = [];
  const later: Question[] = [];

  for (const q of questionsFor(program.id)) {
    if (!upfront.has(q.stage)) {
      later.push(q);
    } else if (q.promptVisibility === 'unknown') {
      notYetVisible.push(q);
    } else {
      const item = prepItem(q, answerFor(progress, q.id), ws.dossier);
      groups[item.reuse].push(item);
    }
  }

  const required = REUSE_ORDER.flatMap((r) => groups[r]).filter((i) => i.counted);
  return {
    program,
    groups,
    notYetVisible,
    later,
    requiredTotal: required.length,
    requiredDone: required.filter((i) => i.done).length,
  };
}

export function readinessPercent(prep: ProgramPrep): number {
  return prep.requiredTotal === 0 ? 0 : Math.round((prep.requiredDone / prep.requiredTotal) * 100);
}
