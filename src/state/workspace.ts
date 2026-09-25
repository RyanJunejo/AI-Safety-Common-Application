import { withDossierDefaults, type Dossier } from '../domain/dossier';
import { SAMPLE_DOSSIER } from './sample';

export const APPLICATION_STATUSES = ['considering', 'preparing', 'ready', 'submitted', 'ruled-out'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  considering: 'Considering',
  preparing: 'Preparing',
  ready: 'Ready to submit',
  submitted: 'Submitted on official form',
  'ruled-out': 'Ruled out',
};

export const ANSWER_STATUSES = ['not-started', 'outlined', 'drafted', 'final'] as const;
export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

export const ANSWER_STATUS_LABEL: Record<AnswerStatus, string> = {
  'not-started': 'Not started',
  outlined: 'Outlined',
  drafted: 'Drafted',
  final: 'Final',
};

export interface AnswerProgress {
  status: AnswerStatus;
  /** The applicant's own working text, kept only in this browser. */
  draft: string;
  /** Dossier artifacts attached to this answer. */
  artifactIds: string[];
  /** For consent items: the applicant has read the official wording. */
  confirmed: boolean;
}

export interface ProgramProgress {
  status: ApplicationStatus;
  ruledOutReason: string;
  answers: Record<string, AnswerProgress>;
}

export interface Workspace {
  version: 1;
  dossier: Dossier;
  programs: Record<string, ProgramProgress>;
  savedAt: string | null;
}

export const EMPTY_ANSWER: AnswerProgress = { status: 'not-started', draft: '', artifactIds: [], confirmed: false };
export const EMPTY_PROGRESS: ProgramProgress = { status: 'considering', ruledOutReason: '', answers: {} };

export function progressFor(ws: Workspace, programId: string): ProgramProgress {
  return ws.programs[programId] ?? EMPTY_PROGRESS;
}

/** Saved answers are merged over the defaults so older saved shapes still load. */
export function answerFor(progress: ProgramProgress, questionId: string): AnswerProgress {
  return { ...EMPTY_ANSWER, ...progress.answers[questionId] };
}

export function sampleWorkspace(): Workspace {
  return { version: 1, dossier: structuredClone(SAMPLE_DOSSIER), programs: {}, savedAt: null };
}

export type Action =
  | { type: 'dossier/replace'; dossier: Dossier }
  | { type: 'program/status'; programId: string; status: ApplicationStatus; reason?: string }
  | { type: 'answer/update'; programId: string; questionId: string; patch: Partial<AnswerProgress> }
  | { type: 'workspace/reset' };

export function reducer(ws: Workspace, action: Action): Workspace {
  switch (action.type) {
    case 'dossier/replace':
      return { ...ws, dossier: action.dossier };
    case 'program/status': {
      const prev = progressFor(ws, action.programId);
      const next: ProgramProgress = {
        ...prev,
        status: action.status,
        ruledOutReason: action.status === 'ruled-out' ? (action.reason ?? prev.ruledOutReason) : '',
      };
      return { ...ws, programs: { ...ws.programs, [action.programId]: next } };
    }
    case 'answer/update': {
      const prev = progressFor(ws, action.programId);
      const answer = { ...answerFor(prev, action.questionId), ...action.patch };
      // Working on an answer moves a program out of "considering".
      const status = prev.status === 'considering' ? 'preparing' : prev.status;
      const next: ProgramProgress = { ...prev, status, answers: { ...prev.answers, [action.questionId]: answer } };
      return { ...ws, programs: { ...ws.programs, [action.programId]: next } };
    }
    case 'workspace/reset':
      return sampleWorkspace();
  }
}

export const STORAGE_KEY = 'fellowship-workspace/v1';

/** Reads a saved workspace, falling back to the sample when nothing valid is stored. */
export function loadWorkspace(storage: Storage | undefined = globalThis.localStorage): Workspace {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return sampleWorkspace();
    const parsed = JSON.parse(raw) as Partial<Workspace>;
    if (parsed.version !== 1 || !parsed.dossier || !parsed.programs) return sampleWorkspace();
    return {
      version: 1,
      dossier: withDossierDefaults(parsed.dossier),
      programs: parsed.programs,
      savedAt: parsed.savedAt ?? null,
    };
  } catch {
    return sampleWorkspace();
  }
}

export function saveWorkspace(ws: Workspace, storage: Storage | undefined = globalThis.localStorage): Workspace {
  const saved = { ...ws, savedAt: new Date().toISOString() };
  storage?.setItem(STORAGE_KEY, JSON.stringify(saved));
  return saved;
}
