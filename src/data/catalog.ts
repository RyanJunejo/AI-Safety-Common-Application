import type { Program, Question } from './schema';
import { getProgram, PROGRAMS, questionsFor } from './inventory';

/**
 * What each program asks beyond the Common Application, chosen from the sourced
 * inventory. Everything factual (contact details, CV, education, availability)
 * is answered once in the Common Application instead.
 */
interface CatalogEntry {
  /** One sentence on what the program is. */
  blurb: string;
  focus: 'Technical research' | 'Theory & math' | 'Policy' | 'Interdisciplinary';
  stipend: string;
  /** Short practical note shown on the program page. */
  goodToKnow?: string;
  /** Stream, track, or role choices, in form order. */
  choices: string[];
  /** Written and ranked questions, in form order. */
  questions: string[];
  /** Program statements the applicant confirms when submitting. */
  confirmations: string[];
  /** References the program asks for upfront. */
  references: number;
  /** Steps that happen outside the Common App, such as timed tests. */
  extraSteps: string[];
}

const CATALOG: Record<string, CatalogEntry> = {
  'anthropic-fellows': {
    blurb: 'Four months of funded research with Anthropic mentors, in Berkeley, London, or remotely from the US, UK, or Canada.',
    focus: 'Technical research',
    stipend: '$3,850 a week, plus compute',
    goodToKnow:
      'The official application is Constellation’s form. The Greenhouse job posting links to it and says you don’t need to apply there.',
    choices: ['anthropic-fellows-top-stream'],
    questions: [
      'anthropic-fellows-motivation',
      'anthropic-fellows-research-areas',
      'anthropic-fellows-full-time-offer-likelihood',
      'anthropic-fellows-continue-in-streams-likelihood',
    ],
    confirmations: ['anthropic-fellows-ai-policy-confirmation'],
    references: 3,
    extraSteps: [],
  },
  iliad: {
    blurb: 'Mathematical alignment research: a four-week Intensive in London and a three-month Fellowship in the Bay Area, through one form.',
    focus: 'Theory & math',
    stipend: 'Travel and housing allowance',
    goodToKnow: 'The November Intensive closes Sep 28; the December Fellowship closes Oct 19. You can ask to be considered for both.',
    choices: ['iliad-program-choice'],
    questions: ['iliad-why-applying', 'iliad-career-aspirations', 'iliad-difficult-math-concepts'],
    confirmations: ['iliad-privacy-consent'],
    references: 0,
    extraSteps: [],
  },
  iaps: {
    blurb: 'A 12-week AI policy fellowship in Washington, D.C., London, or remote, starting with two weeks together in D.C.',
    focus: 'Policy',
    stipend: '$18,000–$24,000',
    choices: ['iaps-role', 'iaps-track', 'iaps-project-type'],
    questions: [
      'iaps-key-experiences',
      'iaps-issue-ranking',
      'iaps-research-interest',
      'iaps-career-goals',
      'iaps-stakeholder-response',
    ],
    confirmations: ['iaps-ai-processing-consent', 'iaps-no-ai-agreement'],
    references: 0,
    extraSteps: ['A 15-minute timed reasoning test, taken on IAPS’s own form.'],
  },
  lasr: {
    blurb: 'A 13-week, full-time research program in London where teams of three or four write a technical paper.',
    focus: 'Technical research',
    stipend: '£15,000',
    choices: [],
    questions: [
      'lasr-why-lasr',
      'lasr-six-months-after',
      'lasr-self-directed-project',
      'lasr-disagreement',
      'lasr-technical-artifact',
      'lasr-risk-priorities',
      'lasr-why-those-two',
    ],
    confirmations: ['lasr-no-llm-attestation', 'lasr-privacy-policy'],
    references: 0,
    extraSteps: [],
  },
  mats: {
    blurb: 'A 12-week mentored research program in Berkeley or London, with an optional extension.',
    focus: 'Technical research',
    stipend: '$19,200, plus housing and compute',
    choices: ['mats-tracks'],
    questions: ['mats-sr1-ranking', 'mats-sr1-framework', 'mats-sr2-deep-project'],
    confirmations: ['mats-ai-use-policy-ack'],
    references: 2,
    extraSteps: ['A 20-minute reasoning test on an external site.', 'Some tracks ask extra questions or writing samples.'],
  },
  spar: {
    blurb: 'Part-time, remote research projects with mentors, over about three months.',
    focus: 'Technical research',
    stipend: 'Unpaid; project costs covered',
    choices: [],
    questions: ['spar-career-plan', 'spar-relevant-experience', 'spar-ai-safety-engagement', 'spar-ai-risk-concerns'],
    confirmations: ['spar-no-ai-confirmation'],
    references: 0,
    extraSteps: ['Choose projects from SPAR’s project list. Some mentors add their own question.', 'Some applicants are asked for references later.'],
  },
  pibbss: {
    blurb: 'A three-month fellowship in Cape Town that brings fields like biology, physics, and philosophy to AI alignment.',
    focus: 'Interdisciplinary',
    stipend: '$3,000 a month, plus housing',
    choices: [],
    questions: ['pibbss-personal-statement'],
    confirmations: [],
    references: 0,
    extraSteps: ['Work samples are optional but recommended.', 'Shortlisted applicants do a work task and interviews.'],
  },
  pivotal: {
    blurb: 'A 15-week research fellowship in London with a mentor you choose.',
    focus: 'Technical research',
    stipend: '£6,000–£8,000, plus housing support',
    choices: [],
    questions: ['pivotal-interests'],
    confirmations: [],
    references: 0,
    extraSteps: ['Choose at least one mentor. Each mentor adds their own questions, which aren’t published yet.'],
  },
};

export interface CatalogProgram extends Omit<CatalogEntry, 'choices' | 'questions' | 'confirmations'> {
  program: Program;
  choices: Question[];
  questions: Question[];
  confirmations: Question[];
}

function resolve(programId: string, ids: string[]): Question[] {
  const all = questionsFor(programId);
  return ids.map((id) => {
    const q = all.find((x) => x.id === id);
    if (!q) throw new Error(`Catalog references unknown question ${id}`);
    return q;
  });
}

export const CATALOG_PROGRAMS: readonly CatalogProgram[] = PROGRAMS.map((program) => {
  const entry = CATALOG[program.id];
  if (!entry) throw new Error(`No catalog entry for ${program.id}`);
  return {
    ...entry,
    program,
    choices: resolve(program.id, entry.choices),
    questions: resolve(program.id, entry.questions),
    confirmations: resolve(program.id, entry.confirmations),
  };
});

export function catalogProgram(id: string): CatalogProgram | undefined {
  return getProgram(id) ? CATALOG_PROGRAMS.find((c) => c.program.id === id) : undefined;
}
