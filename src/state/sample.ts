import type { Dossier } from '../domain/dossier';

/**
 * A fictional researcher used to seed the workspace. Every link points at
 * example.org so nothing resolves to a real person's profile.
 */
export const SAMPLE_DOSSIER: Dossier = {
  fullName: 'Talia Nwosu-Berg (sample)',
  email: 'talia.sample@example.org',
  currentLocation: 'Toronto, Canada',
  citizenship: 'Canadian passport',
  workAuthorization: 'Canada. No current US or UK work authorization; would need visa sponsorship.',
  cv: { fileName: 'Nwosu-Berg_CV_2026-09.pdf', updated: '2026-09-10' },
  education: {
    level: "Master's",
    field: 'Computer Science (machine learning)',
    institution: 'Lakeshore University (fictional)',
    year: '2021',
  },
  experience: {
    currentRole: 'Employed full-time (ML engineer)',
    yearsWork: '5',
    yearsSoftware: '4',
    yearsResearch: '1.5',
    publications: '2',
    peerReviewed: '1',
    papersReadClosely: '40',
    longestSelfDirectedMonths: '9',
    priorPrograms: 'BlueDot AIS fundamentals course',
  },
  links: {
    github: 'https://example.org/github/talia-nb',
    linkedin: 'https://example.org/linkedin/talia-nb',
    website: 'https://example.org/talia',
    scholar: '',
    other: 'https://example.org/alignment-forum/talia-nb',
  },
  artifacts: [
    {
      id: 'artifact-probe-drift',
      title: 'probe-drift: tracking linear probe accuracy across fine-tuning checkpoints',
      kind: 'repository',
      url: 'https://example.org/github/talia-nb/probe-drift',
      summary:
        'Self-directed 9-month project. Trains linear probes on 14 open-weight checkpoints and measures how quickly deception-related directions degrade under benign fine-tuning.',
      shareable: true,
    },
    {
      id: 'artifact-workshop-paper',
      title: 'Workshop paper: Probe fragility under distribution shift',
      kind: 'paper',
      url: 'https://example.org/papers/probe-fragility.pdf',
      summary: 'Peer-reviewed workshop paper written with two collaborators from the probe-drift results.',
      shareable: true,
    },
    {
      id: 'artifact-eval-harness',
      title: 'Internal evaluation harness (employer, not shareable)',
      kind: 'tool',
      url: '',
      summary: 'Built a regression-eval harness for a production ranking model. Code is proprietary; describe it rather than link it.',
      shareable: false,
    },
  ],
  references: [
    {
      id: 'ref-1',
      name: 'Dr. Priya Raman (fictional)',
      email: 'p.raman@example.org',
      role: 'Associate Professor',
      organization: 'Lakeshore University (fictional)',
      relationship: 'Supervised my master’s thesis on representation probing (2020–2021).',
    },
    {
      id: 'ref-2',
      name: 'Marcus Ellery (fictional)',
      email: 'm.ellery@example.org',
      role: 'Engineering manager',
      organization: 'Northwind Analytics (fictional)',
      relationship: 'My manager for three years; saw the evaluation harness from design to launch.',
    },
    {
      id: 'ref-3',
      name: '',
      email: '',
      role: '',
      organization: '',
      relationship: '',
    },
  ],
  availability: {
    earliestStart: '2027-01-04',
    fullTime: 'yes',
    notes: 'Can leave current role with four weeks’ notice.',
  },
  locationPreferences: {
    remote: true,
    places: ['London, UK'],
    notes: 'Can relocate to London with visa sponsorship. Not able to relocate to the US in 2027.',
  },
  researchNotes:
    'Interested in whether interpretability tools stay reliable after fine-tuning, and in evaluations that catch that failure early. ' +
    'Want to move from part-time independent work to full-time safety research within a year.',
};
