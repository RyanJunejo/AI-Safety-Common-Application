import type { AiStance } from '../data/schema';

export const AI_STANCE_META: Record<AiStance, { label: string; tone: 'strict' | 'limited' | 'mixed' | 'none' }> = {
  prohibited: { label: 'AI-written answers prohibited', tone: 'strict' },
  'own-draft-refinement': { label: 'AI may refine your own draft', tone: 'limited' },
  'section-specific': { label: 'AI disallowed in flagged sections', tone: 'mixed' },
  'not-stated': { label: 'No AI policy published', tone: 'none' },
};
