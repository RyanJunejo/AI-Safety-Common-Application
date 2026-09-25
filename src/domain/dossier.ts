import { REFERENCE_PARTS, type DossierField, type ReferencePart } from '../data/schema';

export interface Artifact {
  id: string;
  title: string;
  kind: 'repository' | 'paper' | 'blog post' | 'tool' | 'talk' | 'other';
  url: string;
  summary: string;
  shareable: boolean;
}

export interface Reference {
  id: string;
  name: string;
  email: string;
  /** Job title or role. */
  role: string;
  organization: string;
  relationship: string;
}

export const EMPTY_REFERENCE: Omit<Reference, 'id'> = { name: '', email: '', role: '', organization: '', relationship: '' };

export const REFERENCE_PART_LABEL: Record<ReferencePart, string> = {
  name: 'name',
  email: 'email',
  role: 'role or job title',
  organization: 'organization',
  relationship: 'how they know your work',
};

export interface Dossier {
  fullName: string;
  email: string;
  currentLocation: string;
  citizenship: string;
  workAuthorization: string;
  cv: { fileName: string; updated: string };
  education: { level: string; field: string; institution: string; year: string };
  experience: {
    currentRole: string;
    yearsWork: string;
    yearsSoftware: string;
    yearsResearch: string;
    publications: string;
    peerReviewed: string;
    papersReadClosely: string;
    longestSelfDirectedMonths: string;
    priorPrograms: string;
  };
  links: { github: string; linkedin: string; website: string; scholar: string; other: string };
  artifacts: Artifact[];
  references: Reference[];
  availability: { earliestStart: string; fullTime: 'yes' | 'no' | 'partly' | ''; notes: string };
  locationPreferences: { remote: boolean; places: string[]; notes: string };
  /** The applicant's own notes: raw material for tailored answers, never pasted as a final answer. */
  researchNotes: string;
}

export interface DossierFieldMeta {
  label: string;
  /** Returns a short summary when the field is filled, or null when it is missing. */
  summarize: (d: Dossier) => string | null;
}

const text = (s: string) => (s.trim() ? s.trim() : null);
const FULL_TIME_LABEL = { yes: 'Yes', partly: 'Partly', no: 'No' } as const;

/**
 * One entry per dossier fact. Each summary checks only the fact its questions ask
 * for, so clearing a single value un-readies exactly the questions that need it.
 */
export const DOSSIER_FIELD_META: Record<DossierField, DossierFieldMeta> = {
  fullName: { label: 'Full name', summarize: (d) => text(d.fullName) },
  email: { label: 'Email', summarize: (d) => text(d.email) },
  cv: {
    label: 'CV',
    summarize: (d) => (d.cv.fileName.trim() ? `${d.cv.fileName.trim()}${d.cv.updated ? ` (updated ${d.cv.updated})` : ''}` : null),
  },
  educationLevel: { label: 'Education level', summarize: (d) => text(d.education.level) },
  educationField: { label: 'Field of study', summarize: (d) => text(d.education.field) },
  educationInstitution: { label: 'Institution', summarize: (d) => text(d.education.institution) },
  currentRole: { label: 'Current role', summarize: (d) => text(d.experience.currentRole) },
  yearsWork: { label: 'Years of work', summarize: (d) => text(d.experience.yearsWork) },
  yearsSoftware: { label: 'Years of software engineering', summarize: (d) => text(d.experience.yearsSoftware) },
  yearsResearch: { label: 'Years of research', summarize: (d) => text(d.experience.yearsResearch) },
  publications: { label: 'Publications', summarize: (d) => text(d.experience.publications) },
  peerReviewed: { label: 'Peer-reviewed papers', summarize: (d) => text(d.experience.peerReviewed) },
  papersReadClosely: { label: 'AI safety papers read closely', summarize: (d) => text(d.experience.papersReadClosely) },
  longestSelfDirected: {
    label: 'Longest self-directed project',
    summarize: (d) => (text(d.experience.longestSelfDirectedMonths) ? `${d.experience.longestSelfDirectedMonths.trim()} months` : null),
  },
  priorPrograms: { label: 'Programs and courses completed', summarize: (d) => text(d.experience.priorPrograms) },
  github: { label: 'GitHub', summarize: (d) => text(d.links.github) },
  linkedin: { label: 'LinkedIn', summarize: (d) => text(d.links.linkedin) },
  website: { label: 'Personal website', summarize: (d) => text(d.links.website) },
  scholar: { label: 'Google Scholar', summarize: (d) => text(d.links.scholar) },
  otherLinks: {
    label: 'Other links',
    summarize: (d) => text([d.links.website, d.links.scholar, d.links.other].filter((s) => s.trim()).join(' · ')),
  },
  artifacts: {
    label: 'Work artifacts',
    summarize: (d) => (d.artifacts.length ? `${d.artifacts.length} artifact${d.artifacts.length === 1 ? '' : 's'}` : null),
  },
  references: {
    label: 'References',
    summarize: (d) => {
      const n = completeReferences(d).length;
      return n ? `${n} reference${n === 1 ? '' : 's'} with context` : null;
    },
  },
  currentLocation: { label: 'Current location', summarize: (d) => text(d.currentLocation) },
  workAuthorization: { label: 'Work authorization', summarize: (d) => text(d.workAuthorization) },
  citizenship: { label: 'Citizenship / passport', summarize: (d) => text(d.citizenship) },
  earliestStart: { label: 'Earliest start', summarize: (d) => text(d.availability.earliestStart) },
  fullTime: {
    label: 'Full-time availability',
    summarize: (d) => (d.availability.fullTime ? FULL_TIME_LABEL[d.availability.fullTime] : null),
  },
  commitments: { label: 'Other commitments', summarize: (d) => text(d.availability.notes) },
  locationPreferences: {
    label: 'Where you can work',
    summarize: (d) => {
      const places = [...(d.locationPreferences.remote ? ['Remote'] : []), ...d.locationPreferences.places];
      return places.length ? places.join(', ') : null;
    },
  },
  researchInterests: { label: 'Research notes', summarize: (d) => text(d.researchNotes) },
};

/** A dossier with nothing filled in: the shape saved dossiers are merged over. */
export const EMPTY_DOSSIER: Dossier = {
  fullName: '',
  email: '',
  currentLocation: '',
  citizenship: '',
  workAuthorization: '',
  cv: { fileName: '', updated: '' },
  education: { level: '', field: '', institution: '', year: '' },
  experience: {
    currentRole: '',
    yearsWork: '',
    yearsSoftware: '',
    yearsResearch: '',
    publications: '',
    peerReviewed: '',
    papersReadClosely: '',
    longestSelfDirectedMonths: '',
    priorPrograms: '',
  },
  links: { github: '', linkedin: '', website: '', scholar: '', other: '' },
  artifacts: [],
  references: [],
  availability: { earliestStart: '', fullTime: '', notes: '' },
  locationPreferences: { remote: false, places: [], notes: '' },
  researchNotes: '',
};

/**
 * Fills gaps in a saved dossier with empty values, one level deep, so dossiers
 * saved before a field existed still load. Never fills from the sample researcher.
 */
export function withDossierDefaults(saved: Partial<Dossier>): Dossier {
  const merged: Record<string, unknown> = { ...EMPTY_DOSSIER };
  for (const [key, empty] of Object.entries(EMPTY_DOSSIER)) {
    const value = (saved as Record<string, unknown>)[key];
    if (value === undefined || value === null) continue;
    const nested = typeof empty === 'object' && !Array.isArray(empty);
    merged[key] = nested && typeof value === 'object' ? { ...(empty as object), ...(value as object) } : value;
  }
  const dossier = merged as unknown as Dossier;
  // References saved before a field existed get that field blank.
  return { ...dossier, references: dossier.references.map((r) => ({ ...EMPTY_REFERENCE, ...r })) };
}

/**
 * For each requested reference slot (1-based), the requested fields that are blank.
 * A slot with no reference at all is missing every requested field.
 */
export function missingReferenceParts(
  d: Dossier,
  slots: readonly number[],
  parts: readonly ReferencePart[],
): { slot: number; parts: ReferencePart[] }[] {
  return slots
    .map((slot) => {
      const ref = d.references[slot - 1];
      return { slot, parts: parts.filter((p) => !ref?.[p].trim()) };
    })
    .filter((m) => m.parts.length > 0);
}

/** References with every field filled, so any program's referee questions can use them. */
export function completeReferences(d: Dossier): Reference[] {
  return d.references.filter((r) => REFERENCE_PARTS.every((p) => r[p].trim()));
}

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}
