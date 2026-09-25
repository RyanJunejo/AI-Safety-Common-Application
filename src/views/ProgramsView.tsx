import { useState } from 'react';
import { CATALOG_PROGRAMS, type CatalogProgram } from '../data/catalog';
import { RoundPill } from '../components/ui';
import { roundStatus } from '../domain/round';
import { href } from '../router';
import { useNow } from '../state/clock';
import { useStore } from '../state/store';

/** "4 questions · 3 references", the work a program adds beyond the Common Application. */
export function extraWork(c: CatalogProgram): string {
  const n = c.choices.length + c.questions.length;
  const parts = [`${n} question${n === 1 ? '' : 's'}`];
  if (c.references) parts.push(`${c.references} reference${c.references === 1 ? '' : 's'}`);
  if (c.extraSteps.length) parts.push(`${c.extraSteps.length} extra step${c.extraSteps.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

export function ProgramsView() {
  const { state, dispatch } = useStore();
  const now = useNow();
  const [openOnly, setOpenOnly] = useState(false);
  const shown = CATALOG_PROGRAMS.filter((c) => !openOnly || roundStatus(c.program, now).state === 'open');

  return (
    <section aria-labelledby="programs-title">
      <div className="page-head">
        <div>
          <h1 id="programs-title">Programs</h1>
          <p className="lede">
            Your Common Application covers the shared questions. Each program adds only the few questions shown on its card.
          </p>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Open now only
        </label>
      </div>

      <ul className="cards">
        {shown.map((c) => {
          const p = c.program;
          const added = Boolean(state.programs[p.id]);
          const closed = roundStatus(p, now).state === 'closed';
          return (
            <li key={p.id} className="card" data-testid={`card-${p.id}`}>
              <div className="card-top">
                <span className="focus">{c.focus}</span>
                <RoundPill program={p} compact />
              </div>
              <h2>
                <a href={href({ name: 'program', id: p.id })}>{p.name}</a>
              </h2>
              <p>{c.blurb}</p>
              <dl className="card-facts">
                <div>
                  <dt>Where</dt>
                  <dd>{p.locations.join(' / ')}</dd>
                </div>
                <div>
                  <dt>Stipend</dt>
                  <dd>{c.stipend}</dd>
                </div>
                <div>
                  <dt>Also asks</dt>
                  <dd>{extraWork(c)}</dd>
                </div>
              </dl>
              {closed && p.nextRoundNote && <p className="muted small">Next round: {p.nextRoundNote}</p>}
              <div className="card-actions">
                <a className="btn btn-small" href={href({ name: 'program', id: p.id })}>
                  View details
                </a>
                {added ? (
                  <span className="added">✓ On your list</span>
                ) : (
                  <button type="button" className="btn btn-small btn-primary" onClick={() => dispatch({ type: 'program/add', programId: p.id })}>
                    {closed ? 'Save for next round' : 'Add to my programs'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
