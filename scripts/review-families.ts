/**
 * Review cohorts that might belong to a recurring program. Until a cohort is reviewed,
 * people who follow the program aren't emailed about it.
 *
 *   npm run catalog:review                              List cohorts waiting for review
 *   npm run catalog:review -- link <cohort> <family>    It's a round of that program
 *   npm run catalog:review -- standalone <cohort>       It's a separate opportunity
 *
 * Needs DATABASE_URL. A decision applies at the next catalog sync.
 */
import { connect } from '../server/db.js';
import { decideReview, pendingReviews } from '../server/reviews.js';

const [command = 'list', cohort, family] = process.argv.slice(2);
if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL first (see .env.example).');
  process.exit(1);
}
const db = connect(process.env.DATABASE_URL);
const reviewer = process.env.USER ?? 'reviewer';

try {
  if (command === 'list') {
    const pending = await pendingReviews(db);
    if (pending.length === 0) console.log('Nothing to review.');
    for (const r of pending) {
      console.log(`\n${r.title}\n  ${r.url}`);
      for (const c of r.candidates) console.log(`  a round of ${c.title ?? c.id}?  npm run catalog:review -- link ${r.opportunityId} ${c.id}`);
      console.log(`  separate?  npm run catalog:review -- standalone ${r.opportunityId}`);
    }
  } else if (command === 'link' && cohort && family) {
    await decideReview(db, cohort, family, reviewer);
    console.log(`Recorded: ${cohort} is a round of ${family}. It applies at the next sync.`);
  } else if (command === 'standalone' && cohort) {
    await decideReview(db, cohort, null, reviewer);
    console.log(`Recorded: ${cohort} is a separate opportunity. It applies at the next sync.`);
  } else {
    console.error('Usage: npm run catalog:review [-- list | link <cohort> <family> | standalone <cohort>]');
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.close();
}
