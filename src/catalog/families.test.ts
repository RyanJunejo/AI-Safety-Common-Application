import { describe, expect, it } from 'vitest';
import { buildCatalog } from './catalog';
import { linkFamilies, matchFamily } from './families';
import { FAMILY_RULES } from './familyRules';
import { SNAPSHOT_FEEDS } from './fixtures';

const catalog = buildCatalog(SNAPSHOT_FEEDS);
const titleOf = (id: string | null) => catalog.items.find((i) => i.id === id)?.title ?? null;

/**
 * The reviewed answer for every cohort in the Oct 9, 2026 snapshot: its family, or
 * `review` / `none`. Changing a rule should change this table deliberately.
 */
const EXPECTED: Record<string, string> = {
  'AI Governance Taskforce: Autumn 2026': 'AI Governance Taskforce',
  'AI Safety Camp (AISC): 12th edition': 'AI Safety Camp (AISC)',
  'AI Security Bootcamp (AISB): London, December 2026': 'AI Security Bootcamp (AISB)',
  'Anthropic AI Safety Fellows Program: January 2027': 'Anthropic Fellows Program',
  'Anthropic AI Safety Fellows Program: November 2026 cohort': 'Anthropic Fellows Program',
  'CBAI Fall Research Fellowship 2026': 'CBAI Research Fellowship',
  'Dilemmas and Dangers in AI: Autumn 2026': 'Dilemmas and Dangers in AI',
  'ERA:AI Fellowship: Winter 2027': 'ERA:AI Fellowship',
  'Foresight Fellowship: 2027': 'Foresight Fellowship',
  'Foresight Fellowship: 2028': 'Foresight Fellowship',
  'Global Challenges Project (GCP): London November 2026': 'Global Challenges Project (GCP)',
  'GovAI DC Winter Fellowship: 2027': 'GovAI Fellowship',
  'GovAI UK Winter Fellowship: 2027, Applied Track': 'GovAI Fellowship',
  'GovAI UK Winter Fellowship: 2027, Research Track': 'GovAI Fellowship',
  'HIP Impact Accelerator Program (IAP): Autumn 2026': 'HIP Impact Accelerator Program (IAP)',
  'Horizon Fellowship 2027': 'Horizon Fellowship',
  'Iliad Fellowship: December 2026': 'Iliad Fellowship',
  'Iliad Fellowship: January 2027': 'Iliad Fellowship',
  'Iliad Fellowship: November 2026': 'Iliad Fellowship',
  'Iliad Intensive: January 2027': 'Iliad Intensive',
  'Iliad Intensive: November 2026': 'Iliad Intensive',
  'Institute for AI Policy and Strategy (IAPS) AI Policy Fellowship: Spring 2027': 'IAPS AI Policy Fellowship',
  'LASR Labs: Winter 2027': 'LASR Labs',
  'LawAI Summer Fellowship (US): 2027': 'LawAI Research Fellowships',
  'LawAI Summer Research Fellowship (Legal Frontiers): 2027': 'LawAI Research Fellowships',
  'LawAI Winter Research Fellowship (EU Law): 2027': 'LawAI Research Fellowships',
  'MATS: Winter 2027': 'MATS (Machine Alignment, Transparency, and Security)',
  'ML4Good Governance: France October 2026': 'ML4Good',
  'ML4Good Governance: Hong Kong October 2026': 'ML4Good',
  'ML4Good Technical: Hong Kong October 2026': 'ML4Good',
  'PIBBSS Fellowship: Winter 2026': 'PIBBSS Fellowship',
  'Tarbell Fellowship: 2027': 'Tarbell Fellowship',
  // Same organization, different program: a person decides.
  'CBAI AIxBiosecurity Research Fellowship: Fall 2026': 'review',
  'Effective Thesis Accelerator: Fall 2026': 'review',
  // Not part of any recurring program in the feed.
  'AFFINE Superintelligence Alignment Seminar: Winter 2027': 'none',
  'AI Safety for Italy Mentorship Program: Winter 2026/27': 'none',
  'AI and National Security Convergence Fellowship: 2026-2027': 'none',
  'Better Futures Fellowship – AI Safety Collab: Fall 2026': 'none',
  'DISPATCH – AI Safety Comms Fellowship': 'none',
  'Frontier AI Security Residency (FASR)': 'none',
  'LASST Summer Fellowship: 2027': 'none',
  'Maths for AI Safety Workshop': 'none',
};

describe('recurring program families', () => {
  it('has a reviewed rule for every recurring program in the feed', () => {
    const families = catalog.items.filter((i) => i.familyLink === 'family');
    expect(families).toHaveLength(54);
    expect(catalog.familiesWithoutRules).toEqual([]);
    expect(Object.keys(FAMILY_RULES).sort()).toEqual(families.map((f) => f.provenance.sourceId).sort());
  });

  it('links every cohort in the snapshot as reviewed', () => {
    const cohorts = catalog.items.filter((i) => i.provenance.collection === 'training' && i.familyLink !== 'family');
    const actual = Object.fromEntries(cohorts.map((c) => [c.title, c.familyLink === 'linked' ? titleOf(c.familyId) : c.familyLink]));
    expect(actual).toEqual(EXPECTED);
  });

  it('lists the candidates for a cohort in review', () => {
    const cbai = catalog.items.find((i) => i.title.startsWith('CBAI AIxBiosecurity'))!;
    expect(cbai.familyCandidates.map(titleOf).sort()).toEqual(['CAMBRIA', 'CBAI Research Fellowship']);
  });

  it('sends a new cohort of an unfamiliar shape to review rather than guessing', () => {
    const families = catalog.items.filter((i) => i.familyLink === 'family');
    // Shares Iliad's site but matches neither Iliad rule.
    expect(matchFamily({ title: 'Iliad Summer School 2027', url: 'https://www.iliad.ac/summer' }, families)).toEqual({
      link: 'review',
      candidates: ['training-recraUtUpAHxmv1FL', 'training-recydfEpm2p9tW6oF'],
    });
    // Recognized by title even on a job board.
    expect(matchFamily({ title: 'MATS: Summer 2027', url: 'https://jobs.lever.co/mats/123' }, families)).toEqual({
      link: 'linked',
      familyId: 'training-receOAca5S5nHnSpU',
    });
    // A shared host such as Notion says nothing about family.
    expect(matchFamily({ title: 'Reading group', url: 'https://someone.notion.site/page' }, families)).toEqual({ link: 'none' });
  });

  it('lets a reviewer decide, overriding the rules', () => {
    const effective = catalog.items.find((i) => i.title.startsWith('Effective Thesis Accelerator'))!;
    const mats = catalog.items.find((i) => i.title === 'MATS: Winter 2027')!;
    const decisions = new Map([
      [effective.id, 'training-recU9TIvuBwGmPSwF'],
      [mats.id, null],
    ]);
    const relinked = linkFamilies(catalog.items, decisions).items;
    expect(relinked.find((i) => i.id === effective.id)).toMatchObject({ familyLink: 'linked', familyId: 'training-recU9TIvuBwGmPSwF' });
    expect(relinked.find((i) => i.id === mats.id)).toMatchObject({ familyLink: 'none', familyId: null });
  });

  it('reports a new recurring program that has no rule yet', () => {
    const extra = { ...SNAPSHOT_FEEDS.training[0] as object, id: 'recNewFamily', name: 'Brand New Fellowship', recurring: true };
    const result = buildCatalog({ ...SNAPSHOT_FEEDS, training: [...SNAPSHOT_FEEDS.training, extra] });
    expect(result.familiesWithoutRules).toEqual(['training-recNewFamily']);
  });
});
