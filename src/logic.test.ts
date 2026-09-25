import { describe, expect, it } from 'vitest';
import { catalogProgram, CATALOG_PROGRAMS } from './data/catalog';
import { applicationProgress, csvCell, isAnswered, requirements } from './logic';
import { EMPTY_APPLICATION, reducer, type AppState } from './state/app';
import { sampleState } from './state/sample';

const NOW = new Date('2026-09-25T12:00:00Z');
const program = (id: string) => catalogProgram(id)!;
const question = (programId: string, id: string) => {
  const c = program(programId);
  return [...c.choices, ...c.questions].find((q) => q.id === id)!;
};

describe('catalog', () => {
  it('lists every researched program with its own questions from the inventory', () => {
    expect(CATALOG_PROGRAMS).toHaveLength(8);
    for (const c of CATALOG_PROGRAMS) expect(c.questions.length, c.program.id).toBeGreaterThan(0);
  });
});

describe('Common Application', () => {
  it('starts empty and is complete for the sample applicant', () => {
    expect(applicationProgress(EMPTY_APPLICATION)).toMatchObject({ done: 0, complete: false });
    expect(applicationProgress(sampleState().application)).toMatchObject({ done: 5, complete: true });
  });

  it('requires a personal statement of 100 to 500 words', () => {
    const app = sampleState().application;
    expect(applicationProgress({ ...app, statement: 'Too short.' }).complete).toBe(false);
    expect(applicationProgress({ ...app, statement: 'word '.repeat(501) }).complete).toBe(false);
  });
});

describe('program questions', () => {
  it('needs exactly the number of choices a program asks for', () => {
    const q = question('lasr', 'lasr-risk-priorities');
    expect(isAnswered(q, [q.options![0]!])).toBe(false);
    expect(isAnswered(q, q.options!.slice(0, 2))).toBe(true);
  });

  it('needs every item placed in a ranking', () => {
    const q = question('iaps', 'iaps-issue-ranking');
    expect(isAnswered(q, undefined)).toBe(false);
    expect(isAnswered(q, q.options!)).toBe(true);
    expect(isAnswered(q, q.options!.slice(1))).toBe(false);
  });

  it('treats blank text as unanswered', () => {
    expect(isAnswered(question('iliad', 'iliad-why-applying'), '   ')).toBe(false);
  });
});

describe('readiness', () => {
  it('holds back Anthropic Fellows until a third recommendation is requested', () => {
    let state: AppState = sampleState();
    expect(requirements(state, program('anthropic-fellows'), NOW)).toMatchObject({
      status: 'in-progress',
      recommenders: { have: 2, need: 3 },
      blockers: ['Request 1 more recommendation.'],
    });
    state = reducer(state, { type: 'recommender/request', id: 'rec-okoye', at: NOW.toISOString() });
    expect(requirements(state, program('anthropic-fellows'), NOW)).toMatchObject({ status: 'ready', blockers: [] });
  });

  it('never lets a closed round be submitted, even when everything is filled in', () => {
    let state: AppState = { ...sampleState(), programs: {} };
    state = reducer(state, { type: 'program/add', programId: 'lasr' });
    for (const q of [...program('lasr').choices, ...program('lasr').questions]) {
      const value = q.format === 'multi-select' ? q.options!.slice(0, 2) : 'An answer.';
      state = reducer(state, { type: 'answer', programId: 'lasr', questionId: q.id, value });
    }
    const req = requirements(state, program('lasr'), NOW);
    expect(req.questions.answered).toBe(req.questions.total);
    expect(req.status).toBe('closed');
    expect(req.blockers).toEqual(['This round is closed.']);
  });

  it('tells apart programs not on the list, not started, and submitted', () => {
    let state: AppState = sampleState();
    expect(requirements(state, program('iaps'), NOW).status).toBe('not-added');
    state = reducer(state, { type: 'program/add', programId: 'iaps' });
    expect(requirements(state, program('iaps'), NOW).status).toBe('not-started');
    state = reducer(state, { type: 'submit', programId: 'iaps', at: NOW.toISOString() });
    expect(requirements(state, program('iaps'), NOW).status).toBe('submitted');
  });
});

describe('export', () => {
  it('quotes CSV cells that contain commas, quotes, or line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"\nthen go')).toBe('"say ""hi""\nthen go"');
  });
});
