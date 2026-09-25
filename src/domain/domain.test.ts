import { describe, expect, it } from 'vitest';
import { DOSSIER_FIELDS, REFERENCE_PARTS } from '../data/schema';
import { getProgram, INVENTORY, questionsFor } from '../data/inventory';
import { DOSSIER_FIELD_META, EMPTY_DOSSIER, withDossierDefaults, type Dossier, type Reference } from './dossier';
import { checklistMarkdown } from './export';
import { locationFit, prepItem, programPrep } from './prep';
import { formatDeadline, roundStatus } from './round';
import { reuseClassOf } from './taxonomy';
import { EMPTY_ANSWER, loadWorkspace, reducer, sampleWorkspace, saveWorkspace, STORAGE_KEY, type Workspace } from '../state/workspace';

const NOW = new Date('2026-09-25T12:00:00Z');
const program = (id: string) => getProgram(id)!;
const question = (programId: string, id: string) => questionsFor(programId).find((q) => q.id === id)!;
const THIRD_REFERENCE = (r: Reference): Reference => ({
  ...r,
  name: 'Sam Okoye (fictional)',
  email: 's.okoye@example.org',
  role: 'Research scientist',
  organization: 'Example Lab (fictional)',
  relationship: 'Co-author on the workshop paper.',
});
const item = (ws: Workspace, programId: string, questionId: string) =>
  Object.values(programPrep(program(programId), ws).groups)
    .flat()
    .find((i) => i.question.id === questionId)!;

describe('deadlines', () => {
  it('shows the date as the program published it, not the UTC date', () => {
    expect(formatDeadline(program('iaps').deadlines[0]!.at)).toBe('Sep 27, 2026');
    expect(formatDeadline(program('mats').deadlines[0]!.at)).toBe('Sep 6, 2026');
    expect(roundStatus(program('iaps'), NOW).detail).toBe('Closes Sep 27, 2026');
  });

  it('treats LASR as closed even though its form is still reachable', () => {
    expect(program('lasr').formVisibility).toBe('visible');
    expect(roundStatus(program('lasr'), NOW)).toMatchObject({ state: 'closed', detail: 'Deadline passed Sep 20, 2026' });
  });
});

describe('location fit for the sample researcher', () => {
  const ws = sampleWorkspace();

  it('flags a program that only runs somewhere the researcher cannot go', () => {
    expect(locationFit(program('pibbss'), ws.dossier).state).toBe('conflict');
  });

  it('accepts remote programs and programs with a London option', () => {
    expect(locationFit(program('spar'), ws.dossier).state).toBe('compatible');
    expect(locationFit(program('mats'), ws.dossier).state).toBe('compatible');
    expect(locationFit(program('anthropic-fellows'), ws.dossier).state).toBe('compatible');
  });

  it('turns MATS into a conflict when London is removed', () => {
    const d = { ...ws.dossier, locationPreferences: { ...ws.dossier.locationPreferences, places: [] } };
    expect(locationFit(program('mats'), d).state).toBe('conflict');
  });
});

describe('reuse classes', () => {
  it('separates prepared facts, tailored writing, original reasoning, and confirmations', () => {
    expect(reuseClassOf(question('iliad', 'iliad-cv'))).toBe('dossier');
    expect(reuseClassOf(question('iliad', 'iliad-why-applying'))).toBe('tailor');
    expect(reuseClassOf(question('iliad', 'iliad-difficult-math-concepts'))).toBe('original');
    expect(reuseClassOf(question('iliad', 'iliad-privacy-consent'))).toBe('attest');
    expect(reuseClassOf(question('iliad', 'iliad-program-choice'))).toBe('attest');
  });
});

describe('program preparation', () => {
  it('needs a third complete reference for Anthropic Fellows', () => {
    let ws = sampleWorkspace();
    expect(item(ws, 'anthropic-fellows', 'anthropic-fellows-reference-2-name').done).toBe(true);
    const ref3 = item(ws, 'anthropic-fellows', 'anthropic-fellows-reference-3-name');
    expect(ref3.done).toBe(false);
    expect(ref3.gap).toBe('Missing in your dossier: reference 3 (name)');

    const references = ws.dossier.references.map((r, i) => (i === 2 ? THIRD_REFERENCE(r) : r));
    ws = reducer(ws, { type: 'dossier/replace', dossier: { ...ws.dossier, references } });
    expect(item(ws, 'anthropic-fellows', 'anthropic-fellows-reference-3-name').done).toBe(true);
  });

  it('marks an evidence question ready once a dossier artifact is attached', () => {
    let ws = sampleWorkspace();
    const id = 'anthropic-fellows-work-links';
    expect(item(ws, 'anthropic-fellows', id).done).toBe(false);
    ws = reducer(ws, { type: 'answer/update', programId: 'anthropic-fellows', questionId: id, patch: { artifactIds: ['artifact-probe-drift'] } });
    expect(item(ws, 'anthropic-fellows', id).done).toBe(true);
    expect(ws.programs['anthropic-fellows']!.status).toBe('preparing');
  });

  it('counts only required, unconditional questions toward readiness', () => {
    const prep = programPrep(program('anthropic-fellows'), sampleWorkspace());
    const all = Object.values(prep.groups).flat();
    const conditional = all.filter((i) => i.question.condition);
    expect(conditional.length).toBeGreaterThan(0);
    expect(conditional.every((i) => !i.counted)).toBe(true);
    expect(prep.requiredTotal).toBe(all.filter((i) => i.question.required !== 'optional' && !i.question.condition).length);
  });

  it('keeps unpublished prompts and later stages out of the checklist', () => {
    const prep = programPrep(program('pivotal'), sampleWorkspace());
    expect(prep.notYetVisible.map((q) => q.id)).toEqual(['pivotal-mentor-specific-questions']);
    expect(prep.later.map((q) => q.id)).toEqual(['pivotal-work-task']);
    const listed = Object.values(prep.groups).flat().map((i) => i.question.id);
    expect(listed).not.toContain('pivotal-mentor-specific-questions');
  });

  it('prepares timed tasks by setting aside time rather than drafting', () => {
    let ws = sampleWorkspace();
    const id = 'iaps-timed-reasoning';
    expect(item(ws, 'iaps', id).reuse).toBe('original');
    expect(item(ws, 'iaps', id).done).toBe(false);
    ws = reducer(ws, { type: 'answer/update', programId: 'iaps', questionId: id, patch: { confirmed: true } });
    expect(item(ws, 'iaps', id).done).toBe(true);
  });
});

describe('dossier-backed readiness', () => {
  it('reports every dossier fact as missing on an empty dossier', () => {
    for (const field of DOSSIER_FIELDS) {
      expect(DOSSIER_FIELD_META[field].summarize(EMPTY_DOSSIER), field).toBeNull();
    }
  });

  it('never marks a dossier-backed question ready when the dossier is empty', () => {
    const ws = { ...sampleWorkspace(), dossier: structuredClone(EMPTY_DOSSIER) };
    for (const { program: p } of INVENTORY) {
      for (const i of Object.values(programPrep(p, ws).groups).flat()) {
        if (i.reuse === 'dossier') expect(i.done, i.question.id).toBe(false);
      }
    }
  });

  it('un-readies exactly the question whose fact was cleared', () => {
    const base = sampleWorkspace();
    const lasr = ['lasr-years-work', 'lasr-years-swe', 'lasr-years-research', 'lasr-publications', 'lasr-peer-reviewed'];
    for (const id of lasr) expect(item(base, 'lasr', id).done, id).toBe(true);

    const cleared = { ...base.dossier, experience: { ...base.dossier.experience, yearsSoftware: '', publications: ' ' } };
    const ws = reducer(base, { type: 'dossier/replace', dossier: cleared });
    expect(item(ws, 'lasr', 'lasr-years-swe')).toMatchObject({ done: false, gap: 'Add years of software engineering to your dossier' });
    expect(item(ws, 'lasr', 'lasr-publications').done).toBe(false);
    expect(item(ws, 'lasr', 'lasr-years-work').done).toBe(true);
    expect(item(ws, 'lasr', 'lasr-years-research').done).toBe(true);
    expect(item(ws, 'lasr', 'lasr-peer-reviewed').done).toBe(true);
  });

  it('asks for confirmation where the dossier holds no answer', () => {
    let ws = sampleWorkspace();
    for (const [p, id] of [
      ['iaps', 'iaps-dc-kickoff'],
      ['mats', 'mats-early-decision'],
      ['spar', 'spar-weekly-hours'],
      ['anthropic-fellows', 'anthropic-fellows-earliest-full-time-start'],
    ] as const) {
      expect(question(p, id).dossierField, id).toBeUndefined();
      expect(item(ws, p, id).done, id).toBe(false);
      ws = reducer(ws, { type: 'answer/update', programId: p, questionId: id, patch: { confirmed: true } });
      expect(item(ws, p, id).done, id).toBe(true);
    }
  });

  it('does not mark optional demographic questions ready by default', () => {
    const ws = sampleWorkspace();
    for (const id of ['mats-gender', 'mats-disability']) expect(item(ws, 'mats', id).done, id).toBe(false);
    expect(item(ws, 'iaps', 'iaps-gender').done).toBe(false);
  });
});

describe('reference readiness', () => {
  const withRefs = (d: Dossier, change: (r: Reference, i: number) => Reference): Workspace => ({
    ...sampleWorkspace(),
    dossier: { ...d, references: d.references.map(change) },
  });
  const full = withRefs(sampleWorkspace().dossier, (r, i) => (i === 2 ? THIRD_REFERENCE(r) : r)).dossier;

  it('un-readies job title and background when both references lose their role', () => {
    const ws = withRefs(full, (r) => ({ ...r, role: '' }));
    expect(item(ws, 'mats', 'mats-referee-job-title')).toMatchObject({
      done: false,
      gap: 'Missing in your dossier: reference 1 (role or job title); reference 2 (role or job title)',
    });
    for (const id of ['mats-referee-name', 'mats-referee-email', 'mats-referee-organization', 'mats-referee-relationship']) {
      expect(item(ws, 'mats', id).done, id).toBe(true);
    }
    expect(item(ws, 'anthropic-fellows', 'anthropic-fellows-reference-1-background').done).toBe(false);
    expect(item(ws, 'anthropic-fellows', 'anthropic-fellows-reference-1-name').done).toBe(true);
  });

  it('checks the numbered reference the question names', () => {
    const ws = withRefs(full, (r, i) => (i === 1 ? { ...r, email: '' } : r));
    expect(item(ws, 'anthropic-fellows', 'anthropic-fellows-reference-1-email').done).toBe(true);
    expect(item(ws, 'anthropic-fellows', 'anthropic-fellows-reference-2-email')).toMatchObject({
      done: false,
      gap: 'Missing in your dossier: reference 2 (email)',
    });
    expect(item(ws, 'anthropic-fellows', 'anthropic-fellows-reference-3-email').done).toBe(true);
    // MATS asks every field of two referees, so either one missing counts.
    expect(item(ws, 'mats', 'mats-referee-email').done).toBe(false);
  });

  it('readies each reference question exactly when its own slots and fields are filled', () => {
    const questions = INVENTORY.flatMap((r) => r.questions).filter((q) => q.dossierSlots);
    expect(questions.length).toBe(21);
    for (const q of questions) {
      expect(prepItem(q, EMPTY_ANSWER, full).done, `${q.id} with every field filled`).toBe(true);
      for (const slot of [1, 2, 3]) {
        for (const part of REFERENCE_PARTS) {
          const cleared = { ...full, references: full.references.map((r, i) => (i === slot - 1 ? { ...r, [part]: '' } : r)) };
          const needed = q.dossierSlots!.includes(slot) && q.referenceParts!.includes(part);
          expect(prepItem(q, EMPTY_ANSWER, cleared).done, `${q.id} without reference ${slot} ${part}`).toBe(!needed);
        }
      }
    }
  });
});

describe('persistence', () => {
  it('fills fields missing from an older saved dossier with blanks, not sample data', () => {
    // A dossier saved before `currentRole` existed.
    const saved = JSON.parse(JSON.stringify({ ...sampleWorkspace().dossier, fullName: 'Real Applicant' }));
    saved.experience = Object.fromEntries(Object.entries(saved.experience).filter(([k]) => k !== 'currentRole'));
    const d = withDossierDefaults(saved);
    expect(d.fullName).toBe('Real Applicant');
    expect(d.experience.currentRole).toBe('');
    expect(d.experience.yearsWork).toBe('5');
  });

  it('gives references saved before the organization field a blank organization', () => {
    const saved = JSON.parse(JSON.stringify(sampleWorkspace().dossier));
    saved.references = saved.references.map(({ organization: _, ...rest }: Reference) => rest);
    const d = withDossierDefaults(saved);
    expect(d.references.map((r) => r.organization)).toEqual(['', '', '']);
    expect(d.references[0]!.role).toBe('Associate Professor');
  });

  it('round-trips the workspace through storage', () => {
    let ws = sampleWorkspace();
    ws = reducer(ws, { type: 'program/status', programId: 'lasr', status: 'ruled-out', reason: 'Round closed' });
    saveWorkspace(ws, localStorage);
    const loaded = loadWorkspace(localStorage);
    expect(loaded.programs.lasr).toMatchObject({ status: 'ruled-out', ruledOutReason: 'Round closed' });
    expect(loaded.savedAt).not.toBeNull();
  });

  it('falls back to the sample when storage holds something else', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadWorkspace(localStorage).dossier.fullName).toContain('(sample)');
  });
});

describe('checklist export', () => {
  it('lists active programs, ruled-out reasons, and never claims submission', () => {
    let ws = sampleWorkspace();
    ws = reducer(ws, { type: 'program/status', programId: 'pibbss', status: 'ruled-out', reason: 'Location: Cape Town only' });
    ws = reducer(ws, { type: 'answer/update', programId: 'iliad', questionId: 'iliad-why-applying', patch: { draft: 'PRIVATE DRAFT TEXT' } });
    const md = checklistMarkdown(ws, NOW);

    expect(md).toContain('# Application preparation checklist');
    expect(md).toContain('## Iliad');
    expect(md).toContain('- [x] CV — from dossier:');
    expect(md).toContain('## Ruled out\n\n- PIBBSS — Location: Cape Town only');
    expect(md).not.toContain('## PIBBSS');
    expect(md).toContain('Nothing here has been submitted');
    expect(md).not.toContain('PRIVATE DRAFT TEXT');
  });
});
