import { Check, Progress, RoundPill, StatusBadge } from '../components/ui';
import { applicationProgress, myPrograms, requestedRecommenders, SECTIONS } from '../logic';
import { href } from '../router';
import { sampleState } from '../state/sample';
import { useNow } from '../state/clock';
import { useStore } from '../state/store';

export function Dashboard() {
  const { state, dispatch } = useStore();
  const now = useNow();
  const progress = applicationProgress(state.application);
  const programs = myPrograms(state, now);
  const started = progress.done > 0 || programs.length > 0 || state.recommenders.length > 0;

  if (!started) {
    return (
      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title">Apply to AI safety fellowships with one application.</h1>
        <p className="lede">
          Most of every fellowship application asks the same things: who you are, your background, your work, and when you’re available.
          Fill that in once here, then answer only the few questions each program asks for itself.
        </p>
        <ol className="steps">
          <li>
            <strong>Fill in your application once.</strong> Profile, background, work, availability, and one personal statement.
          </li>
          <li>
            <strong>Choose your programs.</strong> Each adds a few questions of its own, shown with its deadline and rules.
          </li>
          <li>
            <strong>Ask recommenders once.</strong> One recommendation goes to every program that asks for one.
          </li>
        </ol>
        <div className="hero-actions">
          <a className="btn btn-primary" href={href({ name: 'application', section: 'profile' })}>
            Start my application
          </a>
          <a className="btn" href={href({ name: 'programs' })}>
            Browse programs
          </a>
          <button type="button" className="link-btn" onClick={() => dispatch({ type: 'load', state: sampleState() })}>
            Or look around with a sample applicant
          </button>
        </div>
      </section>
    );
  }

  const firstName = state.application.profile.firstName.trim();
  const requested = requestedRecommenders(state.recommenders).length;

  return (
    <div className="dashboard">
      <h1>{firstName ? `Welcome back, ${firstName}` : 'Your dashboard'}</h1>

      <div className="dash-grid">
        <section className="panel" aria-labelledby="my-programs">
          <div className="panel-head">
            <h2 id="my-programs">My programs</h2>
            <a className="btn btn-small" href={href({ name: 'programs' })}>
              Add programs
            </a>
          </div>
          {programs.length === 0 ? (
            <p className="empty">
              You haven’t chosen any programs yet. <a href={href({ name: 'programs' })}>Browse programs</a> to see what each one asks.
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Program</th>
                  <th scope="col">Deadline</th>
                  <th scope="col">Program questions</th>
                  <th scope="col">Recommenders</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {programs.map((r) => (
                  <tr key={r.program.program.id} data-testid={`row-${r.program.program.id}`}>
                    <th scope="row">
                      <a href={href({ name: 'program', id: r.program.program.id })}>{r.program.program.name}</a>
                    </th>
                    <td>
                      <RoundPill program={r.program.program} compact />
                    </td>
                    <td>
                      {r.questions.answered} of {r.questions.total}
                    </td>
                    <td>{r.recommenders.need ? `${r.recommenders.have} of ${r.recommenders.need}` : 'None needed'}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <aside className="side">
          <section className="panel" aria-labelledby="my-app">
            <h2 id="my-app">Common Application</h2>
            <p className="muted">
              {progress.complete ? 'Complete. It goes to every program you apply to.' : `${progress.done} of ${progress.total} sections complete`}
            </p>
            <Progress done={progress.done} total={progress.total} label="Common Application progress" />
            <ul className="section-list">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <Check done={s.complete(state.application)} />
                  <a href={href({ name: 'application', section: s.id })}>{s.title}</a>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel" aria-labelledby="my-recs">
            <h2 id="my-recs">Recommenders</h2>
            <p className="muted">
              {requested} requested · {state.recommenders.length} added
            </p>
            <a href={href({ name: 'recommenders' })}>Manage recommenders</a>
          </section>

          <section className="panel tip" aria-labelledby="tip">
            <h2 id="tip">Preparing for interviews?</h2>
            <p className="muted">Guides on writing answers, references, and technical, research, and behavioral interviews.</p>
            <a href={href({ name: 'resources' })}>Open resources</a>
          </section>
        </aside>
      </div>
    </div>
  );
}
