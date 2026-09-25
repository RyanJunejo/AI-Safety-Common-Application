import type { Category, InputFormat, Question, ReuseClass } from '../data/schema';

export interface CategoryMeta {
  label: string;
  description: string;
  defaultReuse: ReuseClass;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  'identity-cv': {
    label: 'Identity & CV',
    description: 'Name, contact details, CV, education, and experience counts.',
    defaultReuse: 'dossier',
  },
  'links-evidence': {
    label: 'Links & evidence of past work',
    description: 'Profiles, repositories, papers, and work samples.',
    defaultReuse: 'dossier',
  },
  'interests-motivation': {
    label: 'Research interests & motivation',
    description: 'Why this program, what you want to work on, and where you are headed.',
    defaultReuse: 'tailor',
  },
  'research-judgment': {
    label: 'Original research judgment',
    description: 'Critiques, disagreements, proposals, and reasoning tasks.',
    defaultReuse: 'original',
  },
  'program-fit': {
    label: 'Program or mentor fit',
    description: 'Streams, mentors, tracks, and program-specific questions.',
    defaultReuse: 'tailor',
  },
  references: {
    label: 'References',
    description: 'Referees and how they know your work.',
    defaultReuse: 'dossier',
  },
  'availability-eligibility': {
    label: 'Availability & eligibility',
    description: 'Dates, commitment, location, visas, and work authorization.',
    defaultReuse: 'dossier',
  },
  consent: {
    label: 'Consent & attestations',
    description: 'Privacy terms, data sharing, and AI-use attestations.',
    defaultReuse: 'attest',
  },
};

export interface ReuseMeta {
  label: string;
  short: string;
  description: string;
}

export const REUSE_META: Record<ReuseClass, ReuseMeta> = {
  dossier: {
    label: 'Prepare once',
    short: 'Reuse',
    description: 'Facts and artifacts kept in your dossier and carried across programs.',
  },
  tailor: {
    label: 'Tailor for this program',
    short: 'Tailor',
    description: 'Draws on your own notes, but the answer is written for this program’s prompt.',
  },
  original: {
    label: 'Original reasoning',
    short: 'Original',
    description: 'Fresh thinking for this prompt. Nothing from another application answers it.',
  },
  attest: {
    label: 'Confirm per program',
    short: 'Confirm',
    description: 'Quick program-specific choices and statements: streams, prior applications, consent, and AI-use terms.',
  },
};

export const REUSE_ORDER: readonly ReuseClass[] = ['dossier', 'tailor', 'original', 'attest'];

/**
 * How an applicant prepares an answer. Written answers about background become
 * tailored writing; short program-fit choices become quick confirmations.
 * Records can override this with an explicit `reuse` annotation.
 */
export function reuseClassOf(q: Question): ReuseClass {
  if (q.reuse) return q.reuse;
  const written = q.format === 'long-text';
  switch (q.category) {
    case 'identity-cv':
    case 'links-evidence':
      return written ? 'tailor' : 'dossier';
    case 'program-fit':
      return written ? 'tailor' : 'attest';
    default:
      return CATEGORY_META[q.category].defaultReuse;
  }
}

export const FORMAT_LABEL: Record<InputFormat, string> = {
  'short-text': 'Short text',
  'long-text': 'Long text',
  email: 'Email',
  url: 'URL',
  'file-upload': 'Upload',
  number: 'Number',
  'single-select': 'Single choice',
  'multi-select': 'Multiple choice',
  ranking: 'Ranking',
  checkbox: 'Checkbox',
  date: 'Date',
  'timed-task': 'Timed task',
};

export const VISIBILITY_META = {
  verbatim: { label: 'Exact prompt', description: 'Copied from the live official form on the verification date.' },
  paraphrased: {
    label: 'Wording not verified',
    description:
      'From an official description or a closed form’s source. The exact wording was not visible on a live page.',
  },
  unknown: { label: 'Prompt not published', description: 'The form is closed and no official source gives this prompt.' },
} as const;

export function lengthLabel(q: Question): string {
  if (q.statedLength) return q.statedLength.text;
  if (q.lengthStatus === 'unknown') return 'Length unknown';
  return 'No stated limit';
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
