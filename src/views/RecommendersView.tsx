import { CATALOG_PROGRAMS } from '../data/catalog';
import { TextField } from '../components/ui';
import { href } from '../router';
import { newId } from '../state/app';
import { useStore } from '../state/store';

const MAX_RECOMMENDERS = 3;
const requestedFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

export function RecommendersView() {
  const { state, dispatch } = useStore();
  const asking = CATALOG_PROGRAMS.filter((c) => c.references > 0);
  const onList = asking.filter((c) => state.programs[c.program.id]);

  return (
    <section className="narrow" aria-labelledby="rec-title">
      <h1 id="rec-title">Recommenders</h1>
      <p className="lede">
        Add each person once. They get one request and write one recommendation, which goes to every program you apply to that asks
        for references.
      </p>
      <p className="muted">
        {asking.map((c) => `${c.program.name} asks for ${c.references}`).join(' · ')}.
        {onList.length === 0 && ' None of the programs on your list ask for references yet.'}
      </p>

      <ul className="rec-list">
        {state.recommenders.map((r, i) => {
          const complete = r.name.trim() && r.email.trim() && r.relationship.trim();
          const update = (field: string) => (value: string) => dispatch({ type: 'recommender/update', id: r.id, patch: { [field]: value } });
          return (
            <li key={r.id} className="panel rec" data-testid={`rec-${i + 1}`}>
              <div className="panel-head">
                <h2>Recommender {i + 1}</h2>
                {r.requestedAt ? (
                  <span className="status status-submitted">Requested {requestedFmt.format(new Date(r.requestedAt))}</span>
                ) : (
                  <span className="status status-not-started">Not requested yet</span>
                )}
              </div>
              <div className="grid">
                <TextField label="Name" required value={r.name} onChange={update('name')} />
                <TextField label="Email" type="email" required value={r.email} onChange={update('email')} />
                <TextField label="Role or job title" value={r.role} onChange={update('role')} />
                <TextField label="Organization" value={r.organization} onChange={update('organization')} />
                <TextField label="How they know your work" required wide value={r.relationship} onChange={update('relationship')} />
              </div>
              <div className="form-foot">
                <button type="button" className="link-btn small" onClick={() => dispatch({ type: 'recommender/remove', id: r.id })}>
                  Remove
                </button>
                {!r.requestedAt && (
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    disabled={!complete}
                    onClick={() => dispatch({ type: 'recommender/request', id: r.id, at: new Date().toISOString() })}
                  >
                    Send request
                  </button>
                )}
              </div>
              {!r.requestedAt && (
                <p className="muted small">In the full version this emails them one link. This prototype only marks the request as sent.</p>
              )}
            </li>
          );
        })}
      </ul>

      {state.recommenders.length < MAX_RECOMMENDERS && (
        <button type="button" className="btn" onClick={() => dispatch({ type: 'recommender/add', id: newId('rec') })}>
          Add a recommender
        </button>
      )}
      <p className="muted small">
        Tips on who to ask and how to brief them are in <a href={href({ name: 'resources' })}>Resources</a>.
      </p>
    </section>
  );
}
