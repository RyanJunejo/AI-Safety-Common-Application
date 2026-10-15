/** The applicant's data. In this prototype it lives in the browser's localStorage. */

export interface Application {
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    country: string;
    city: string;
    citizenship: string;
    workAuthorization: string;
  };
  background: {
    education: string;
    field: string;
    institution: string;
    currentRole: string;
    yearsExperience: string;
    yearsResearch: string;
    publications: string;
  };
  work: {
    cvFileName: string;
    github: string;
    linkedin: string;
    website: string;
    sampleUrl: string;
    sampleSummary: string;
  };
  availability: {
    startDate: string;
    commitment: '' | 'full-time' | 'part-time';
    locations: string[];
    needsVisa: '' | 'yes' | 'no' | 'unsure';
    notes: string;
  };
  statement: string;
}

export interface Recommender {
  id: string;
  name: string;
  email: string;
  role: string;
  organization: string;
  relationship: string;
  /** When the (simulated) request was sent. */
  requestedAt: string | null;
}

export type Answer = string | string[];

export interface ProgramEntry {
  answers: Record<string, Answer>;
  confirmations: Record<string, boolean>;
  submittedAt: string | null;
}

export interface AppState {
  version: 1;
  application: Application;
  recommenders: Recommender[];
  /** Programs on the applicant's list, keyed by program id. */
  programs: Record<string, ProgramEntry>;
}

export const EMPTY_APPLICATION: Application = {
  profile: { firstName: '', lastName: '', email: '', country: '', city: '', citizenship: '', workAuthorization: '' },
  background: { education: '', field: '', institution: '', currentRole: '', yearsExperience: '', yearsResearch: '', publications: '' },
  work: { cvFileName: '', github: '', linkedin: '', website: '', sampleUrl: '', sampleSummary: '' },
  availability: { startDate: '', commitment: '', locations: [], needsVisa: '', notes: '' },
  statement: '',
};

export const EMPTY_STATE: AppState = { version: 1, application: EMPTY_APPLICATION, recommenders: [], programs: {} };

export const EMPTY_ENTRY: ProgramEntry = { answers: {}, confirmations: {}, submittedAt: null };

export type SectionId = 'profile' | 'background' | 'work' | 'availability';

export type Action =
  | { type: 'section'; section: SectionId; patch: Record<string, unknown> }
  | { type: 'statement'; text: string }
  | { type: 'program/add'; programId: string }
  | { type: 'program/remove'; programId: string }
  | { type: 'answer'; programId: string; questionId: string; value: Answer }
  | { type: 'confirm'; programId: string; questionId: string; value: boolean }
  | { type: 'submit'; programId: string; at: string }
  | { type: 'recommender/add'; id: string }
  | { type: 'recommender/update'; id: string; patch: Partial<Recommender> }
  | { type: 'recommender/remove'; id: string }
  | { type: 'recommender/request'; id: string; at: string }
  | { type: 'load'; state: AppState };

function updateEntry(state: AppState, programId: string, fn: (e: ProgramEntry) => ProgramEntry): AppState {
  const entry = state.programs[programId] ?? EMPTY_ENTRY;
  return { ...state, programs: { ...state.programs, [programId]: fn(entry) } };
}

function updateRecommender(state: AppState, id: string, fn: (r: Recommender) => Recommender): AppState {
  return { ...state, recommenders: state.recommenders.map((r) => (r.id === id ? fn(r) : r)) };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'section':
      return {
        ...state,
        application: { ...state.application, [action.section]: { ...state.application[action.section], ...action.patch } },
      };
    case 'statement':
      return { ...state, application: { ...state.application, statement: action.text } };
    case 'program/add':
      return state.programs[action.programId] ? state : { ...state, programs: { ...state.programs, [action.programId]: EMPTY_ENTRY } };
    case 'program/remove': {
      const { [action.programId]: _removed, ...rest } = state.programs;
      return { ...state, programs: rest };
    }
    case 'answer':
      return updateEntry(state, action.programId, (e) => ({ ...e, answers: { ...e.answers, [action.questionId]: action.value } }));
    case 'confirm':
      return updateEntry(state, action.programId, (e) => ({
        ...e,
        confirmations: { ...e.confirmations, [action.questionId]: action.value },
      }));
    case 'submit':
      return updateEntry(state, action.programId, (e) => ({ ...e, submittedAt: action.at }));
    case 'recommender/add':
      return {
        ...state,
        recommenders: [
          ...state.recommenders,
          { id: action.id, name: '', email: '', role: '', organization: '', relationship: '', requestedAt: null },
        ],
      };
    case 'recommender/update':
      return updateRecommender(state, action.id, (r) => ({ ...r, ...action.patch }));
    case 'recommender/remove':
      return { ...state, recommenders: state.recommenders.filter((r) => r.id !== action.id) };
    case 'recommender/request':
      return updateRecommender(state, action.id, (r) => ({ ...r, requestedAt: action.at }));
    case 'load':
      return action.state;
  }
}

export const STORAGE_KEY = 'ai-safety-common-app/v1';

/** Reads saved state, filling any missing fields with blanks. Falls back to an empty application. */
export function loadState(storage: Storage | undefined = globalThis.localStorage): AppState {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const saved = JSON.parse(raw) as Partial<AppState>;
    if (saved.version !== 1) return EMPTY_STATE;
    const app = (saved.application ?? {}) as Partial<Application>;
    return {
      version: 1,
      application: {
        profile: { ...EMPTY_APPLICATION.profile, ...app.profile },
        background: { ...EMPTY_APPLICATION.background, ...app.background },
        work: { ...EMPTY_APPLICATION.work, ...app.work },
        availability: { ...EMPTY_APPLICATION.availability, ...app.availability },
        statement: app.statement ?? '',
      },
      recommenders: saved.recommenders ?? [],
      programs: Object.fromEntries(Object.entries(saved.programs ?? {}).map(([id, e]) => [id, { ...EMPTY_ENTRY, ...e }])),
    };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(state: AppState, storage: Storage | undefined = globalThis.localStorage): void {
  storage?.setItem(STORAGE_KEY, JSON.stringify(state));
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
