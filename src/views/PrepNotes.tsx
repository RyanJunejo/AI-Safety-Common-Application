import { catalogProgram } from '../data/catalog';
import type { AiStance } from '../data/schema';
import { formatVerified, lastVerified } from '../domain/round';
import { ExternalLink } from '../components/ui';

const AI_RULE: Record<AiStance, string> = {
  prohibited: 'Not allowed on written answers.',
  'own-draft-refinement': 'Only to refine a draft you wrote yourself.',
  'section-specific': 'Not allowed on the questions it marks.',
  'not-stated': 'No published policy.',
};

/**
 * What a program's application asked, from the research behind the Common App
 * prototype. Shown with its verification date; its old deadlines are never shown,
 * since the live catalog has the current round.
 */
export default function PrepNotes({ inventoryId }: { inventoryId: string }) {
  const c = catalogProgram(inventoryId);
  if (!c) return null;
  const p = c.program;
  const later = p.stages.filter((s) => s.phase === 'later' && s.known);

  return (
    <section className="panel prep" aria-labelledby="prep-title" data-testid="prep-notes">
      <h2 id="prep-title">How to prepare</h2>
      <p className="muted">
        Notes from our review of the {p.cohort ? `${p.cohort} ` : ''}application, checked {formatVerified(lastVerified(p))}. The next round may
        differ, so check the official page before you apply.
      </p>
      <dl className="prep-facts">
        {p.publishedTimeEstimate && (
          <div>
            <dt>Time to apply</dt>
            <dd>{p.publishedTimeEstimate.text}</dd>
          </div>
        )}
        <div>
          <dt>AI help</dt>
          <dd>
            {AI_RULE[p.aiPolicy.stance]}
            {p.aiPolicy.sourceUrl && p.aiPolicy.stance !== 'not-stated' && (
              <>
                {' '}
                <ExternalLink href={p.aiPolicy.sourceUrl}>Policy</ExternalLink>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>References</dt>
          <dd>{c.references ? `${c.references} asked for upfront` : 'None upfront'}</dd>
        </div>
        {p.compensation && (
          <div>
            <dt>Pay</dt>
            <dd>{c.stipend}</dd>
          </div>
        )}
      </dl>

      {c.questions.length > 0 && (
        <>
          <h3>What the application asked</h3>
          <ul>
            {c.questions.map((q) => (
              <li key={q.id}>{q.prompt}</li>
            ))}
          </ul>
        </>
      )}
      {c.extraSteps.length > 0 && (
        <>
          <h3>Other steps</h3>
          <ul>
            {c.extraSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </>
      )}
      {later.length > 0 && (
        <>
          <h3>How selection worked in that round</h3>
          <ol>
            {later.map((s) => (
              <li key={s.id}>
                <strong>{s.name}.</strong> {s.description}
              </li>
            ))}
          </ol>
        </>
      )}
      {p.eligibilityNotes.length > 0 && (
        <>
          <h3>Eligibility</h3>
          <ul>
            {p.eligibilityNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
