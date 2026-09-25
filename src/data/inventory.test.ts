import { describe, expect, it } from 'vitest';
import { INVENTORY, PROGRAMS } from './inventory';
import { msUntilNextStatusChange, OPEN_STATUS_TTL_DAYS, roundStatus, sortedDeadlines } from '../domain/round';

const VERIFIED_ON = '2026-09-25';
const AT_VERIFICATION = new Date('2026-09-25T12:00:00Z');

const EXPECTED_IDS = ['anthropic-fellows', 'iaps', 'iliad', 'lasr', 'mats', 'pibbss', 'pivotal', 'spar'];
/** Programs whose application forms were closed when the inventory was built. */
const CLOSED_FORMS = ['mats', 'spar', 'pibbss', 'pivotal'];

describe('source records', () => {
  it('covers exactly the eight researched programs', () => {
    expect(PROGRAMS.map((p) => p.id).sort()).toEqual(EXPECTED_IDS);
  });

  it.each(INVENTORY.map((r) => [r.program.id, r] as const))('%s is dated, sourced, and internally consistent', (_id, record) => {
    const { program, questions } = record;
    const sourceUrls = new Set(program.sources.map((s) => s.url));
    const stageIds = new Set(program.stages.map((s) => s.id));

    expect(program.sources.some((s) => s.accessed === VERIFIED_ON)).toBe(true);
    expect(program.roundStatusEvidence.trim().length).toBeGreaterThan(10);
    expect(
      sourceUrls.has(program.roundStatusSourceUrl) ||
        [program.applyUrl, program.infoUrl].includes(program.roundStatusSourceUrl),
    ).toBe(true);
    expect(program.stages.some((s) => s.phase === 'application')).toBe(true);
    expect(questions.length).toBeGreaterThan(0);

    const ids = questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of questions) {
      expect(q.id.startsWith(`${program.id}-`)).toBe(true);
      expect(stageIds.has(q.stage)).toBe(true);
      expect(q.verifiedOn).toBe(VERIFIED_ON);
      if (q.dossierSlots || q.referenceParts) {
        expect(q.dossierField).toBe('references');
        expect(q.dossierSlots && q.referenceParts, `${q.id} needs both slots and parts`).toBeTruthy();
      }
      if (q.statedLength) expect(q.lengthStatus).toBe('stated');
    }
  });

  it('records an AI policy with a quote and source wherever one is stated', () => {
    const stance = Object.fromEntries(PROGRAMS.map((p) => [p.id, p.aiPolicy.stance]));
    expect(stance).toMatchObject({
      lasr: 'prohibited',
      mats: 'prohibited',
      spar: 'prohibited',
      'anthropic-fellows': 'own-draft-refinement',
      iaps: 'section-specific',
    });
    for (const p of PROGRAMS.filter((p) => p.aiPolicy.stance !== 'not-stated')) {
      expect(p.aiPolicy.quote).toBeTruthy();
      expect(p.aiPolicy.sourceUrl).toBeTruthy();
    }
  });

  it('only records a time estimate the program itself published', () => {
    for (const p of PROGRAMS) {
      if (p.publishedTimeEstimate) expect(p.publishedTimeEstimate.sourceUrl).toMatch(/^https:\/\//);
    }
    expect(PROGRAMS.filter((p) => p.publishedTimeEstimate).map((p) => p.id).sort()).toEqual(['iaps', 'mats', 'pivotal']);
  });
});

describe('verification labels', () => {
  it('never labels a prompt exact when its form was closed and unpublished', () => {
    for (const { program, questions } of INVENTORY) {
      if (program.formVisibility === 'closed') {
        expect(questions.filter((q) => q.promptVisibility === 'verbatim')).toEqual([]);
      }
    }
  });

  it('marks every closed-form program as not fully visible', () => {
    for (const id of CLOSED_FORMS) {
      expect(PROGRAMS.find((p) => p.id === id)!.formVisibility).not.toBe('visible');
    }
  });

  it('does not treat wording read from a closed form’s source code as verified', () => {
    const spar = INVENTORY.find((r) => r.program.id === 'spar')!;
    const fromForm = spar.questions.filter((q) => q.sourceUrl.startsWith('https://forms.sparai.org'));
    expect(fromForm.length).toBeGreaterThan(0);
    expect(fromForm.every((q) => q.promptVisibility !== 'verbatim')).toBe(true);
  });

  it('keeps unknown prompts free of stated lengths', () => {
    const unknown = INVENTORY.flatMap((r) => r.questions).filter((q) => q.promptVisibility === 'unknown');
    expect(unknown.length).toBeGreaterThan(0);
    for (const q of unknown) expect(q.lengthStatus).toBe('unknown');
  });

  it('has exact prompts for every program whose form was visible', () => {
    for (const { program, questions } of INVENTORY.filter((r) => r.program.formVisibility === 'visible')) {
      expect(questions.some((q) => q.promptVisibility === 'verbatim'), program.id).toBe(true);
    }
  });

  it('contains no screening internals from any form', () => {
    const text = JSON.stringify(INVENTORY).toLowerCase();
    for (const term of ['answer key', 'fictitious', 'overclaim', 'flagger', 'likeliness', 'partial credit', 'form code']) {
      expect(text).not.toContain(term);
    }
  });
});

describe('round status', () => {
  it('matches what the official pages showed on the verification date', () => {
    const open = PROGRAMS.filter((p) => roundStatus(p, AT_VERIFICATION).state === 'open').map((p) => p.id);
    expect(open.sort()).toEqual(['anthropic-fellows', 'iaps', 'iliad']);
  });

  it('never shows a closed program as open, at any time', () => {
    const times = ['2026-01-01', '2026-09-25', '2027-06-01'].map((d) => new Date(`${d}T12:00:00Z`));
    for (const p of PROGRAMS.filter((p) => p.roundStatus === 'closed')) {
      for (const t of times) expect(roundStatus(p, t).state, `${p.id} at ${t.toISOString()}`).toBe('closed');
    }
  });

  it('closes every program the minute its last stated deadline passes', () => {
    for (const p of PROGRAMS.filter((p) => p.deadlines.length)) {
      const after = new Date(Date.parse(sortedDeadlines(p).at(-1)!.at) + 60_000);
      expect(roundStatus(p, after).state, p.id).toBe('closed');
    }
  });

  it('keeps a multi-cohort form open until its last cohort closes', () => {
    const iliad = PROGRAMS.find((p) => p.id === 'iliad')!;
    expect(iliad.deadlines.map((d) => d.label)).toEqual(['Nov 2026 Intensive', 'Dec 2026 Fellowship']);
    expect(roundStatus(iliad, AT_VERIFICATION).detail).toBe('Closes Sep 28, 2026 (Nov 2026 Intensive)');
    expect(roundStatus(iliad, new Date('2026-10-01T12:00:00Z'))).toMatchObject({
      state: 'open',
      detail: 'Closes Oct 19, 2026 (Dec 2026 Fellowship)',
    });
    // 11pm on Oct 19 in the Bay Area is still open; the next morning is not.
    expect(roundStatus(iliad, new Date('2026-10-20T06:00:00Z')).state).toBe('open');
    expect(roundStatus(iliad, new Date('2026-10-20T08:00:00Z'))).toMatchObject({ state: 'closed', detail: 'Deadline passed Oct 19, 2026' });
  });

  it('shows open only while a stated deadline is ahead or a rolling status is fresh', () => {
    const start = Date.parse('2026-07-01T00:00:00Z');
    for (let t = start; t < start + 200 * 86_400_000; t += 6 * 3_600_000) {
      const now = new Date(t);
      for (const p of PROGRAMS.filter((p) => roundStatus(p, now).state === 'open')) {
        const aheadDeadline = p.deadlines.some((d) => Date.parse(d.at) >= t);
        const freshRolling = p.deadlines.length === 0 && t - AT_VERIFICATION.getTime() < OPEN_STATUS_TTL_DAYS * 86_400_000;
        expect(p.roundStatus === 'open' && (aheadDeadline || freshRolling), `${p.id} at ${now.toISOString()}`).toBe(true);
      }
    }
  });

  it('knows when the next status change is due', () => {
    // IAPS closes first: Sep 27, 23:59 US Eastern.
    expect(msUntilNextStatusChange(PROGRAMS, AT_VERIFICATION)).toBe(Date.parse('2026-09-27T23:59:00-04:00') - AT_VERIFICATION.getTime());
    expect(msUntilNextStatusChange(PROGRAMS, new Date('2027-06-01T00:00:00Z'))).toBeNull();
  });

  it('stops calling a rolling program open once its verification is stale', () => {
    const rolling = PROGRAMS.filter((p) => p.roundStatus === 'open' && p.deadlines.length === 0);
    expect(rolling.map((p) => p.id)).toEqual(['anthropic-fellows']);
    const stale = new Date(AT_VERIFICATION.getTime() + (OPEN_STATUS_TTL_DAYS + 1) * 86_400_000);
    for (const p of rolling) expect(roundStatus(p, stale).state).toBe('unknown');
  });
});
