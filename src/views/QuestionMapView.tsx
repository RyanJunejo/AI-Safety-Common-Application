import { Fragment, useState } from 'react';
import { CATEGORY_IDS, type Category, type Program, type Question } from '../data/schema';
import { PROGRAMS, questionsFor } from '../data/inventory';
import { ReuseBadge, RoundBadge, VisibilityBadge } from '../components/Badges';
import { applicationStageIds } from '../domain/prep';
import { CATEGORY_META, FORMAT_LABEL, lengthLabel, REUSE_META, REUSE_ORDER, reuseClassOf } from '../domain/taxonomy';
import { roundStatus } from '../domain/round';
import { href } from '../router';
import { useNow } from '../state/clock';
import { useWorkspace } from '../state/store';
import { progressFor } from '../state/workspace';

export function QuestionMapView() {
  const { ws } = useWorkspace();
  const now = useNow();
  const [hideRuledOut, setHideRuledOut] = useState(true);
  const [includeLater, setIncludeLater] = useState(false);
  const [expanded, setExpanded] = useState<Category | null>('research-judgment');

  const programs = PROGRAMS.filter((p) => !hideRuledOut || progressFor(ws, p.id).status !== 'ruled-out');

  const inScope = (program: Program): Question[] => {
    const upfront = applicationStageIds(program);
    return questionsFor(program.id).filter((q) => includeLater || upfront.has(q.stage));
  };
  const scoped = new Map(programs.map((p) => [p.id, inScope(p)]));
  const cell = (programId: string, category: Category) => (scoped.get(programId) ?? []).filter((q) => q.category === category);
  const all = programs.flatMap((p) => scoped.get(p.id) ?? []);

  const totals = REUSE_ORDER.map((reuse) => ({
    reuse,
    questions: all.filter((q) => q.promptVisibility !== 'unknown' && reuseClassOf(q) === reuse).length,
  }));
  const unknownCount = all.filter((q) => q.promptVisibility === 'unknown').length;

  return (
    <section aria-labelledby="map-title">
      <div className="page-head">
        <div>
          <h1 id="map-title">Question map</h1>
          <p className="lede">
            Every question across {programs.length} programs, grouped by what it asks for. Prepare facts and work samples once; write
            motivation and fit answers for each program; reason from scratch where a program tests your judgment.
          </p>
        </div>
      </div>

      <div className="reuse-summary">
        {totals.map(({ reuse, questions }) => (
          <div key={reuse} className={`reuse-card reuse-${reuse}-soft`}>
            <span className="reuse-card-n">{questions}</span>
            <span className="reuse-card-label">{REUSE_META[reuse].label}</span>
            <p>{REUSE_META[reuse].description}</p>
          </div>
        ))}
        <div className="reuse-card mix-unknown-soft">
          <span className="reuse-card-n">{unknownCount}</span>
          <span className="reuse-card-label">Not published</span>
          <p>Closed forms. The prompt will only be known when the program reopens or shares it.</p>
        </div>
      </div>

      <fieldset className="filters">
        <legend className="sr-only">Map options</legend>
        <label>
          <input type="checkbox" checked={hideRuledOut} onChange={(e) => setHideRuledOut(e.target.checked)} /> Hide ruled-out programs
        </label>
        <label>
          <input type="checkbox" checked={includeLater} onChange={(e) => setIncludeLater(e.target.checked)} /> Include later stages
          (tasks and assessments after shortlisting)
        </label>
      </fieldset>

      <div className="map-scroll">
        <table className="map">
          <caption className="sr-only">Questions per category and program. Select a category to see the prompts.</caption>
          <thead>
            <tr>
              <th scope="col" className="map-corner">
                Question group
              </th>
              {programs.map((p) => (
                <th key={p.id} scope="col">
                  <a href={href({ name: 'program', id: p.id })}>{p.name}</a>
                  <RoundBadge program={p} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORY_IDS.map((category) => {
              const meta = CATEGORY_META[category];
              const isOpen = expanded === category;
              return (
                <Fragment key={category}>
                  <tr className={isOpen ? 'map-row open' : 'map-row'}>
                    <th scope="row">
                      <button
                        type="button"
                        className="map-cat"
                        aria-expanded={isOpen}
                        onClick={() => setExpanded(isOpen ? null : category)}
                      >
                        <span className={`swatch reuse-${meta.defaultReuse}`} aria-hidden="true" />
                        <span>
                          {meta.label}
                          <small>{REUSE_META[meta.defaultReuse].label}</small>
                        </span>
                      </button>
                    </th>
                    {programs.map((p) => {
                      const qs = cell(p.id, category);
                      const unknown = qs.filter((q) => q.promptVisibility === 'unknown').length;
                      const known = qs.length - unknown;
                      return (
                        <td key={p.id} className={qs.length ? `map-cell reuse-${meta.defaultReuse}-soft` : 'map-cell empty'}>
                          {known > 0 && <span className="map-n">{known}</span>}
                          {unknown > 0 && (
                            <span className="map-unknown" title="Prompt not published">
                              +{unknown} ?
                            </span>
                          )}
                          {qs.length === 0 && <span className="map-dash" aria-label="none">·</span>}
                        </td>
                      );
                    })}
                  </tr>
                  {isOpen && (
                    <tr className="map-detail">
                      <td colSpan={programs.length + 1}>
                        <p className="map-detail-lede">{meta.description}</p>
                        <div className="map-detail-grid">
                          {programs.map((p) => {
                            const qs = cell(p.id, category);
                            if (!qs.length) return null;
                            return (
                              <div key={p.id} className="map-program">
                                <h3>
                                  <a href={href({ name: 'program', id: p.id })}>{p.name}</a>
                                </h3>
                                <ul>
                                  {qs.map((q) => (
                                    <li key={q.id} className={`map-q vis-${q.promptVisibility}-row`}>
                                      <p className="map-q-prompt">{q.prompt}</p>
                                      <p className="map-q-meta">
                                        <ReuseBadge reuse={reuseClassOf(q)} />
                                        <VisibilityBadge q={q} roundState={roundStatus(p, now).state} />
                                        <span>{FORMAT_LABEL[q.format]}</span>
                                        <span>{lengthLabel(q)}</span>
                                        {q.condition ? <span>If applicable</span> : q.required === 'optional' && <span>Optional</span>}
                                        {q.aiRule === 'prohibited' && <span className="ai-flag">No AI</span>}
                                      </p>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
