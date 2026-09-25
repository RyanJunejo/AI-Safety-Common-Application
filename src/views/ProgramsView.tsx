import { useState } from 'react';
import type { Program } from '../data/schema';
import { PROGRAMS } from '../data/inventory';
import { AiBadge, ExternalLink, FitBadge, Meter, RoundBadge } from '../components/Badges';
import { QuestionMix } from '../components/QuestionMix';
import { locationFit, programPrep, readinessPercent } from '../domain/prep';
import { roundStatus, type RoundStatus } from '../domain/round';
import { useNow } from '../state/clock';
import { href } from '../router';
import { useWorkspace } from '../state/store';
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABEL, progressFor, type ApplicationStatus } from '../state/workspace';

const FORMAT_LABEL: Record<Program['format'], string> = {
  'in-person': 'In person',
  remote: 'Remote',
  hybrid: 'Hybrid',
  mixed: 'In person or remote',
  unknown: 'Format unknown',
};

function whereLabel(program: Program): string {
  const places = program.locations.filter((l) => !(program.format === 'remote' && l === 'Remote'));
  return places.length ? `${FORMAT_LABEL[program.format]} · ${places.join(' / ')}` : FORMAT_LABEL[program.format];
}

/** The most concrete reason a program cannot work for this applicant right now, if any. */
function suggestedRuleOut(round: RoundStatus, fitReason: string, fitConflict: boolean): string | null {
  if (round.state === 'closed') return `Round closed: ${round.detail.toLowerCase()}`;
  if (fitConflict) return `Location: ${fitReason}`;
  return null;
}

export function ProgramsView() {
  const { ws, dispatch } = useWorkspace();
  const now = useNow();
  const [openOnly, setOpenOnly] = useState(false);
  const [hideConflicts, setHideConflicts] = useState(false);
  const [hideRuledOut, setHideRuledOut] = useState(false);

  const rows = PROGRAMS.map((program) => {
    const fit = locationFit(program, ws.dossier);
    const prep = programPrep(program, ws);
    const progress = progressFor(ws, program.id);
    return { program, fit, prep, progress, round: roundStatus(program, now) };
  });

  const visible = rows.filter(
    (r) =>
      (!openOnly || r.round.state === 'open') &&
      (!hideConflicts || r.fit.state !== 'conflict') &&
      (!hideRuledOut || r.progress.status !== 'ruled-out'),
  );
  // Ruled-out programs sink to the bottom so active work stays on top.
  visible.sort((a, b) => Number(a.progress.status === 'ruled-out') - Number(b.progress.status === 'ruled-out'));

  const openCount = rows.filter((r) => r.round.state === 'open').length;
  const activeCount = rows.filter((r) => r.progress.status !== 'ruled-out').length;

  const setStatus = (programId: string, status: ApplicationStatus, reason?: string) =>
    dispatch({ type: 'program/status', programId, status, reason });

  return (
    <section aria-labelledby="programs-title">
      <div className="page-head">
        <div>
          <h1 id="programs-title">Compare programs</h1>
          <p className="lede">
            Eight AI safety programs, checked against their official application pages. Rule out what cannot work, then prepare the
            rest from one dossier.
          </p>
        </div>
        <dl className="stat-row">
          <div>
            <dt>Programs</dt>
            <dd>{rows.length}</dd>
          </div>
          <div>
            <dt>Open now</dt>
            <dd>{openCount}</dd>
          </div>
          <div>
            <dt>Still in play for you</dt>
            <dd>{activeCount}</dd>
          </div>
        </dl>
      </div>

      <fieldset className="filters">
        <legend className="sr-only">Filter programs</legend>
        <label>
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Open rounds only
        </label>
        <label>
          <input type="checkbox" checked={hideConflicts} onChange={(e) => setHideConflicts(e.target.checked)} /> Hide location
          conflicts
        </label>
        <label>
          <input type="checkbox" checked={hideRuledOut} onChange={(e) => setHideRuledOut(e.target.checked)} /> Hide ruled out
        </label>
        <span className="filters-count">
          Showing {visible.length} of {rows.length}
        </span>
      </fieldset>

      <ol className="program-list">
        {visible.map(({ program, fit, prep, progress, round }) => {
          const ruledOut = progress.status === 'ruled-out';
          const suggestion = suggestedRuleOut(round, fit.reason, fit.state === 'conflict');
          return (
            <li key={program.id} className={`program-card${ruledOut ? ' is-ruled-out' : ''}`} data-testid={`program-${program.id}`}>
              <div className="pc-main">
                <div className="pc-title">
                  <h2>
                    <a href={href({ name: 'program', id: program.id })}>{program.name}</a>
                  </h2>
                  <RoundBadge program={program} withDetail />
                </div>
                <p className="pc-sub">
                  {program.fullName}
                  {program.cohort ? ` · ${program.cohort}` : ''}
                  {program.programDates ? ` · ${program.programDates}` : ''}
                </p>
                {round.state === 'closed' && program.nextRoundNote && <p className="pc-note">Next round: {program.nextRoundNote}</p>}
                <div className="pc-badges">
                  <span className="badge badge-plain">{whereLabel(program)}</span>
                  <FitBadge fit={fit} />
                  <AiBadge program={program} />
                </div>
              </div>

              <div className="pc-mix">
                <h3 className="mini-head">Upfront application</h3>
                <QuestionMix prep={prep} />
                <p className="pc-estimate">
                  <span className="mini-label">Published time estimate</span>
                  {program.publishedTimeEstimate ? program.publishedTimeEstimate.text : 'Not published'}
                </p>
              </div>

              <div className="pc-status">
                <label className="mini-label" htmlFor={`status-${program.id}`}>
                  Your status
                </label>
                <select
                  id={`status-${program.id}`}
                  value={progress.status}
                  onChange={(e) => setStatus(program.id, e.target.value as ApplicationStatus, suggestion ?? 'Not a fit right now')}
                >
                  {APPLICATION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {APPLICATION_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                {ruledOut ? (
                  <p className="pc-ruled-reason">
                    {progress.ruledOutReason || 'Ruled out'}{' '}
                    <button type="button" className="link-btn" onClick={() => setStatus(program.id, 'considering')}>
                      Restore
                    </button>
                  </p>
                ) : (
                  <>
                    <Meter value={readinessPercent(prep)} label={`${program.name} readiness`} />
                    <p className="pc-ready">
                      {prep.requiredDone} of {prep.requiredTotal} required items ready
                    </p>
                    {suggestion && (
                      <button
                        type="button"
                        className="btn btn-small btn-warn"
                        onClick={() => setStatus(program.id, 'ruled-out', suggestion)}
                      >
                        Rule out: {round.state === 'closed' ? 'closed round' : 'location'}
                      </button>
                    )}
                  </>
                )}
                <div className="pc-links">
                  <a className="btn btn-small" href={href({ name: 'program', id: program.id })}>
                    Prepare
                  </a>
                  <ExternalLink href={program.applyUrl} className="btn btn-small btn-quiet">
                    Official application
                  </ExternalLink>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {visible.length === 0 && <p className="empty">No programs match these filters.</p>}
    </section>
  );
}
