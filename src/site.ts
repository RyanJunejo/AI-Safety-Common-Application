/** Site-wide names and addresses. */
export const SITE = {
  name: 'SafetyApps',
  url: 'https://safetyapps.org',
  contactEmail: 'hello@safetyapps.org',
} as const;

/**
 * Recurring programs that have applicant preparation notes from the Common App
 * research (src/data/inventory), by catalog family ID. Iliad's one form covers both
 * its Fellowship and its Intensive.
 */
export const PREP_NOTES_BY_FAMILY: Record<string, string> = {
  'training-recLdJIkptiztPH6P': 'anthropic-fellows',
  'training-recraUtUpAHxmv1FL': 'iliad',
  'training-recydfEpm2p9tW6oF': 'iliad',
  'training-rechE62zg7HFr2wv7': 'iaps',
  'training-recBZC37c1HgT9gzJ': 'lasr',
  'training-receOAca5S5nHnSpU': 'mats',
  'training-rectGZPQWFrvyhd3Z': 'spar',
  'training-recYA6ZCK741kp5FQ': 'pibbss',
  'training-recDvRawU9wlVpuG6': 'pivotal',
};
