import type { AppState } from './app';

/**
 * A fictional applicant for demos. Every link points at example.org, and the
 * written answers are placeholders, not advice on what to write.
 */
export function sampleState(): AppState {
  return {
    version: 1,
    application: {
      profile: {
        firstName: 'Talia',
        lastName: 'Nwosu-Berg (sample)',
        email: 'talia.sample@example.org',
        country: 'Canada',
        city: 'Toronto',
        citizenship: 'Canadian',
        workAuthorization: 'Canada. Would need a visa to work in the US or UK.',
      },
      background: {
        education: "Master's",
        field: 'Computer science (machine learning)',
        institution: 'Lakeshore University (fictional)',
        currentRole: 'Machine learning engineer',
        yearsExperience: '5',
        yearsResearch: '1.5',
        publications: '2',
      },
      work: {
        cvFileName: 'Nwosu-Berg_CV.pdf',
        github: 'https://example.org/github/talia-nb',
        linkedin: 'https://example.org/linkedin/talia-nb',
        website: 'https://example.org/talia',
        sampleUrl: 'https://example.org/github/talia-nb/probe-drift',
        sampleSummary:
          'probe-drift: a 9-month self-directed project measuring how quickly linear probes for deception-related features degrade under benign fine-tuning.',
      },
      availability: {
        startDate: '2027-01-04',
        commitment: 'full-time',
        locations: ['Remote', 'London'],
        needsVisa: 'yes',
        notes: 'Four weeks’ notice at my current job.',
      },
      statement:
        'I build machine learning systems for a living, and over the last year I have spent my evenings on interpretability. ' +
        'My side project, probe-drift, started as a question I could not find answered: if a probe finds a deception-related direction in a model, ' +
        'does that direction survive ordinary fine-tuning? Across 14 open-weight checkpoints it often did not, which worries me, because many ' +
        'proposed safety checks assume these tools stay reliable after deployment changes. I want to spend the next year working full time on ' +
        'evaluations that catch this kind of silent failure early, and on understanding when interpretability results transfer between model versions. ' +
        'I am applying to fellowships because I have gone as far as I can alone: I need mentorship from people who have thought about threat models ' +
        'for longer than I have, and collaborators who will tell me when my experiments are measuring the wrong thing.',
    },
    recommenders: [
      {
        id: 'rec-raman',
        name: 'Dr. Priya Raman (fictional)',
        email: 'p.raman@example.org',
        role: 'Associate Professor',
        organization: 'Lakeshore University (fictional)',
        relationship: 'Supervised my master’s thesis on representation probing.',
        requestedAt: '2026-09-20T15:00:00Z',
      },
      {
        id: 'rec-ellery',
        name: 'Marcus Ellery (fictional)',
        email: 'm.ellery@example.org',
        role: 'Engineering manager',
        organization: 'Northwind Analytics (fictional)',
        relationship: 'My manager for three years.',
        requestedAt: '2026-09-20T15:05:00Z',
      },
      {
        id: 'rec-okoye',
        name: 'Sam Okoye (fictional)',
        email: 's.okoye@example.org',
        role: 'Research scientist',
        organization: 'Example Lab (fictional)',
        relationship: 'Co-author on a workshop paper built on probe-drift.',
        requestedAt: null,
      },
    ],
    programs: {
      'anthropic-fellows': {
        answers: {
          'anthropic-fellows-top-stream': 'AI Safety: Mechanistic Interpretability & Model Internals',
          'anthropic-fellows-motivation':
            'I want to work on interpretability with people who test it against real frontier models, and to learn how to turn a side project into research others can build on.',
          'anthropic-fellows-research-areas':
            'Whether interpretability findings survive fine-tuning and model updates, and how to build evaluations that notice when they stop holding.',
          'anthropic-fellows-full-time-offer-likelihood': 'Very likely (around 85%). This is the kind of work I want to do full time.',
          'anthropic-fellows-continue-in-streams-likelihood': 'Likely (around 75%), assuming the questions stay as open as they look today.',
        },
        confirmations: {},
        submittedAt: null,
      },
      iliad: {
        answers: { 'iliad-program-choice': ['December 2026 Iliad Fellowship [London or SF]'] },
        confirmations: {},
        submittedAt: null,
      },
    },
  };
}
