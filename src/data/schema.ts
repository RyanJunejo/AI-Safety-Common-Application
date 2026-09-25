import { z } from 'zod';

/**
 * Schema for the sourced question inventory in `src/data/inventory/*.json`.
 *
 * Every record distinguishes what was observed on an official source from
 * what could not be seen. Closed forms are recorded as `unknown` rather than
 * reconstructed from memory.
 */

export const CATEGORY_IDS = [
  'identity-cv',
  'links-evidence',
  'interests-motivation',
  'research-judgment',
  'program-fit',
  'references',
  'availability-eligibility',
  'consent',
] as const;
export const Category = z.enum(CATEGORY_IDS);
export type Category = z.infer<typeof Category>;

export const INPUT_FORMATS = [
  'short-text',
  'long-text',
  'email',
  'url',
  'file-upload',
  'number',
  'single-select',
  'multi-select',
  'ranking',
  'checkbox',
  'date',
  'timed-task',
] as const;
export const InputFormat = z.enum(INPUT_FORMATS);
export type InputFormat = z.infer<typeof InputFormat>;

/** How an applicant prepares an answer. Derived from category unless a record overrides it. */
export const REUSE_CLASSES = ['dossier', 'tailor', 'original', 'attest'] as const;
export const ReuseClass = z.enum(REUSE_CLASSES);
export type ReuseClass = z.infer<typeof ReuseClass>;

/**
 * Dossier entries a question can be answered from. Each is one fact, so a
 * question is only ready when the exact fact it asks for is filled in.
 */
export const DOSSIER_FIELDS = [
  'fullName',
  'email',
  'cv',
  'educationLevel',
  'educationField',
  'educationInstitution',
  'currentRole',
  'yearsWork',
  'yearsSoftware',
  'yearsResearch',
  'publications',
  'peerReviewed',
  'papersReadClosely',
  'longestSelfDirected',
  'priorPrograms',
  'github',
  'linkedin',
  'website',
  'scholar',
  'otherLinks',
  'artifacts',
  'references',
  'currentLocation',
  'workAuthorization',
  'citizenship',
  'earliestStart',
  'fullTime',
  'commitments',
  'locationPreferences',
  'researchInterests',
] as const;
export const DossierField = z.enum(DOSSIER_FIELDS);
export type DossierField = z.infer<typeof DossierField>;

/** Fields of a dossier reference that forms ask for. */
export const REFERENCE_PARTS = ['name', 'email', 'role', 'organization', 'relationship'] as const;
export const ReferencePart = z.enum(REFERENCE_PARTS);
export type ReferencePart = z.infer<typeof ReferencePart>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const url = z.url();

export const StatedLength = z.object({
  unit: z.enum(['words', 'characters', 'minutes', 'items']),
  min: z.number().nullable(),
  max: z.number().nullable(),
  text: z.string().min(1),
});
export type StatedLength = z.infer<typeof StatedLength>;

export const Question = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  promptVisibility: z.enum(['verbatim', 'paraphrased', 'unknown']),
  helpText: z.string().nullable(),
  category: Category,
  stage: z.string().min(1),
  format: InputFormat,
  options: z.array(z.string()).nullable(),
  statedLength: StatedLength.nullable(),
  lengthStatus: z.enum(['stated', 'not-stated', 'unknown']),
  required: z.enum(['required', 'optional', 'unknown']),
  aiRule: z.enum(['prohibited', 'allowed']).nullable(),
  sourceUrl: url,
  verifiedOn: isoDate,
  notes: z.string().nullable(),
  /** Workspace annotation: overrides the category's default reuse class. */
  reuse: ReuseClass.optional(),
  /** Workspace annotation: the dossier entry that supplies or supports this answer. */
  dossierField: DossierField.optional(),
  /**
   * Workspace annotation for reference questions: which dossier references (1-based) the
   * question needs, e.g. [3] for "Reference 3: Name" or [1, 2] for a field asked of two referees.
   */
  dossierSlots: z.array(z.number().int().positive()).min(1).optional(),
  /** Workspace annotation for reference questions: the reference fields the question asks for. */
  referenceParts: z.array(ReferencePart).min(1).optional(),
  /** Shown only when an earlier answer triggers it; excluded from required counts. */
  condition: z.string().min(1).optional(),
});
export type Question = z.infer<typeof Question>;

export const Stage = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  /** `application`: submitted upfront. `later`: only after shortlisting (tasks, interviews). */
  phase: z.enum(['application', 'later']),
  known: z.boolean(),
});
export type Stage = z.infer<typeof Stage>;

export const Source = z.object({
  label: z.string().min(1),
  url,
  accessed: isoDate,
  note: z.string().nullable(),
});
export type Source = z.infer<typeof Source>;

export const AiStance = z.enum(['prohibited', 'own-draft-refinement', 'section-specific', 'not-stated']);
export type AiStance = z.infer<typeof AiStance>;

export const Program = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fullName: z.string().min(1),
  organization: z.string().min(1),
  cohort: z.string().nullable(),
  applyUrl: url,
  infoUrl: url,
  roundStatus: z.enum(['open', 'closed', 'unknown']),
  roundStatusEvidence: z.string().min(1),
  roundStatusSourceUrl: url,
  /**
   * Stated deadlines, one per cohort the form accepts applications for, as ISO 8601
   * timestamps in the program's own timezone. Empty when none is stated (rolling or unannounced).
   */
  deadlines: z.array(z.object({ label: z.string().nullable(), at: z.iso.datetime({ offset: true }) })),
  nextRoundNote: z.string().nullable(),
  formVisibility: z.enum(['visible', 'closed', 'partial']),
  programDates: z.string().nullable(),
  format: z.enum(['in-person', 'remote', 'hybrid', 'mixed', 'unknown']),
  locations: z.array(z.string()),
  locationNotes: z.string().nullable(),
  compensation: z.string().nullable(),
  commitment: z.string().nullable(),
  eligibilityNotes: z.array(z.string()),
  publishedTimeEstimate: z.object({ text: z.string().min(1), sourceUrl: url }).nullable(),
  aiPolicy: z.object({
    stance: AiStance,
    summary: z.string().min(1),
    quote: z.string().nullable(),
    sourceUrl: url.nullable(),
  }),
  stages: z.array(Stage).min(1),
  sources: z.array(Source).min(1),
  notes: z.string().nullable(),
});
export type Program = z.infer<typeof Program>;

export const InventoryRecord = z.object({
  program: Program,
  questions: z.array(Question),
});
export type InventoryRecord = z.infer<typeof InventoryRecord>;
