import { z } from 'zod';
import { KINDS, FOCUSES, type SourceStatus } from '../types.js';

/**
 * Schema for independently researched listings in `data/independent-listings/*.json`.
 * Validated at test/build time and again when the daily sync loads them.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const httpUrl = z.url();
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'expected lowercase slug with hyphens')
  .min(2)
  .max(120);

const SOURCE_STATUSES = ['open', 'upcoming', 'closed', 'recurring', 'ongoing', 'unknown'] as const satisfies readonly SourceStatus[];

export const SOURCE_TYPES = ['official', 'x-post', 'both'] as const;
export type IndependentSourceType = (typeof SOURCE_TYPES)[number];

export const IndependentLocation = z.object({
  text: z.string().nullable(),
  countries: z.array(z.string()),
  remote: z.boolean(),
  remoteCountries: z.array(z.string()),
});

export const IndependentFact = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

export const IndependentListing = z
  .object({
    id: slug,
    kind: z.enum(KINDS),
    format: z.string().min(1),
    title: z.string().min(1),
    organization: z.string().min(1).nullable(),
    summary: z.string().min(1),
    description: z.string().nullable().optional().default(null),
    url: httpUrl,
    focus: z.array(z.enum(FOCUSES)),
    location: IndependentLocation,
    status: z.enum(SOURCE_STATUSES),
    deadline: isoDate.nullable().optional().default(null),
    deadlineTimezone: z.string().min(1).nullable().optional().default(null),
    startDate: isoDate.nullable().optional().default(null),
    startText: z.string().min(1).nullable().optional().default(null),
    round: z.string().min(1).nullable().optional().default(null),
    sourceType: z.enum(SOURCE_TYPES),
    officialUrl: httpUrl,
    xPostUrl: httpUrl.nullable().optional().default(null),
    xAccount: z.string().min(1).nullable().optional().default(null),
    xPostDate: isoDate.nullable().optional().default(null),
    lastVerified: isoDate,
    facts: z.array(IndependentFact).optional().default([]),
    tags: z.array(z.string().min(1)).optional().default([]),
  })
  .superRefine((r, ctx) => {
    if (r.sourceType === 'x-post' || r.sourceType === 'both') {
      if (!r.xPostUrl) {
        ctx.addIssue({ code: 'custom', path: ['xPostUrl'], message: 'required when sourceType includes an X post' });
      }
    }
    if (r.deadlineTimezone && !r.deadline) {
      ctx.addIssue({ code: 'custom', path: ['deadlineTimezone'], message: 'deadlineTimezone requires a deadline' });
    }
  });

export type IndependentListing = z.infer<typeof IndependentListing>;

/** Parse one record; throws with the file path in the message on failure. */
export function parseIndependentListing(data: unknown, path = 'listing'): IndependentListing {
  const result = IndependentListing.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid independent listing ${path}:\n${result.error.message}`);
  }
  return result.data;
}
