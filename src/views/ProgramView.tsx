import { catalogProgram, type CatalogProgram } from '../data/catalog';
import { aiRuleText, Check, ExternalLink, QuestionInput, RoundPill } from '../components/ui';
import { requirements } from '../logic';
import { href } from '../router';
import { EMPTY_ENTRY } from '../state/app';
import { useNow } from '../state/clock';
import { useStore } from '../state/store';
import { extraWork } from './ProgramsView';

/** Confirmation that applies to every program: sharing the Common Application with it. */
export const SHARE_CONSENT = 'common-app-share';

const submittedFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export function ProgramView({ id }: { id: string }) {
  const c = catalogProgram(id);
  if (!c) {
    return (
      <section>
        <h1>Program not found</h1>
        <a href={href({ name: 'programs' })}>Back to programs</a>
      </section>
    );
  }
  return <ProgramPage c={c} />;
}

function ProgramPage({ c }: { c: CatalogProgram }) {
  const { state, dispatch } = useStore();
  const now = useNow();
  const p = c.program;
  const entry = state.programs[p.id];
  const req = requirements(state, c, now);
  const e = entry ?? EMPTY_ENTRY;
  const closed = req.round.state === 'closed';
  const pastRound = closed && p.formVisibility !== 'closed';
  const described = [...c.choices, ...c.questions].some((q) => q.promptVisibility !== 'verbatim');
  const aiRule = aiRuleText(p);
  const later = p.stages.filter((s) => s.phase === 'later');
  const confirmsDone = c.confirmations.every((q) => e.confirmations[q.id]) && e.confirmations[SHARE_CONSENT];
  const canSubmit = req.status === 'ready' && confirmsDone;

  return (
    <article className="program" aria-labelledby="program-title">
      <p className="crumb">
        <a href={href({ name: 'programs' })}>← All programs</a>
      </p>

      <header className="program-head">
        <div>
          <div className="card-top">
            <span className="focus">{c.focus}</span>
            <RoundPill program={p} />
          </div>
          <h1 id="program-title">{p.name}</h1>
          <p className="lede">{c.blurb}</p>
        </div>
        <dl className="facts">
          <div>
            <dt>Dates</dt>
            <dd>{p.programDates ?? 'Not published'}</dd>
          </div>
          <div>
            <dt>Where</dt>
            <dd>{p.locations.join(' / ')}</dd>
          </div>
          <div>
            <dt>Stipend</dt>
            <dd>{c.stipend}</dd>
          </div>
          <div>
            <dt>Official links</dt>
            <dd>
              <ExternalLink href={p.applyUrl}>Application form</ExternalLink>
              {p.infoUrl !== p.applyUrl && (
                <>
                  {' · '}
                  <ExternalLink href={p.infoUrl}>Program page</ExternalLink>
                </>
              )}
            </dd>
          </div>
        </dl>
      </header>

      {c.goodToKnow && <p className="note">{c.goodToKnow}</p>}
      {closed && (
        <p className="note note-closed" role="note">
          <strong>Applications are closed for this round.</strong> {req.round.detail}.{p.nextRoundNote ? ` ${p.nextRoundNote}` : ''} You can
          still save the program and prepare your answers.
        </p>
      )}

      {!entry ? (
        <section className="panel add-panel" aria-labelledby="asks">
          <h2 id="asks">What {p.name} asks beyond the Common App</h2>
          <p className="muted">{extraWork(c)}</p>
          <ul className="ask-list">
            {[...c.choices, ...c.questions].map((q) => (
              <li key={q.id}>{q.prompt}</li>
            ))}
            {c.extraSteps.map((s) => (
              <li key={s} className="muted">
                {s}
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'program/add', programId: p.id })}>
            {closed ? 'Save for next round' : 'Add to my programs'}
          </button>
        </section>
      ) : (
        <div className="program-body">
          <aside className="panel requirements" aria-labelledby="req-title">
            <h2 id="req-title">Requirements</h2>
            <ul className="req-list">
              <li>
                <Check done={req.commonApp} />
                <a href={href({ name: 'application' })}>Common Application</a>
              </li>
              <li>
                <Check done={req.questions.answered === req.questions.total} />
                Program questions · {req.questions.answered} of {req.questions.total}
              </li>
              {req.recommenders.need > 0 && (
                <li>
                  <Check done={req.recommenders.have >= req.recommenders.need} />
                  <a href={href({ name: 'recommenders' })}>Recommenders</a> · {req.recommenders.have} of {req.recommenders.need}
                </li>
              )}
            </ul>
            {c.extraSteps.length > 0 && (
              <>
                <h3>Also part of this application</h3>
                <ul className="plain small">
                  {c.extraSteps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            <button type="button" className="link-btn small" onClick={() => dispatch({ type: 'program/remove', programId: p.id })}>
              Remove from my programs
            </button>
          </aside>

          <div className="program-main">
            <section className="panel" aria-labelledby="pq-title">
              <h2 id="pq-title">{p.name} questions</h2>
              {pastRound && <p className="muted small">These are the questions from the last round. The next round may change them.</p>}
              {described && (
                <p className="muted small">The exact wording isn’t public, so these follow how {p.name} describes its application.</p>
              )}
              {aiRule && <p className="ai-rule">{aiRule}</p>}
              {[...c.choices, ...c.questions].map((q) => (
                <QuestionInput
                  key={q.id}
                  q={q}
                  value={e.answers[q.id]}
                  onChange={(value) => dispatch({ type: 'answer', programId: p.id, questionId: q.id, value })}
                />
              ))}
            </section>

            <section className="panel submit-panel" aria-labelledby="submit-title">
              <h2 id="submit-title">Review and submit</h2>
              {entry.submittedAt ? (
                <div className="submitted" data-testid="submitted">
                  <p>
                    <strong>Submitted {submittedFmt.format(new Date(entry.submittedAt))}.</strong> {p.name} receives your Common Application,
                    your answers above, and your recommenders’ details.
                  </p>
                  {later.length > 0 && <p className="muted">What happens next: {later.map((s) => s.name).join(' → ')}.</p>}
                  <a href={href({ name: 'inbox', programId: p.id })}>See what {p.name} receives →</a>
                </div>
              ) : (
                <>
                  <div className="confirmations">
                    {c.confirmations.map((q) => (
                      <label key={q.id} className="choice">
                        <input
                          type="checkbox"
                          checked={Boolean(e.confirmations[q.id])}
                          onChange={(ev) => dispatch({ type: 'confirm', programId: p.id, questionId: q.id, value: ev.target.checked })}
                        />{' '}
                        {q.prompt}
                      </label>
                    ))}
                    <label className="choice">
                      <input
                        type="checkbox"
                        checked={Boolean(e.confirmations[SHARE_CONSENT])}
                        onChange={(ev) => dispatch({ type: 'confirm', programId: p.id, questionId: SHARE_CONSENT, value: ev.target.checked })}
                      />{' '}
                      Send my Common Application, these answers, and my recommenders’ details to {p.name}.
                    </label>
                  </div>
                  {req.blockers.length > 0 && (
                    <ul className="blockers" data-testid="blockers">
                      {req.blockers.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!canSubmit}
                    onClick={() => dispatch({ type: 'submit', programId: p.id, at: new Date().toISOString() })}
                  >
                    Submit to {p.name}
                  </button>
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </article>
  );
}
