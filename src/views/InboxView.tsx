import type { ReactNode } from 'react';
import { CATALOG_PROGRAMS, catalogProgram, type CatalogProgram } from '../data/catalog';
import { answerText, csvCell, requestedRecommenders } from '../logic';
import { href } from '../router';
import type { AppState } from '../state/app';
import { useStore } from '../state/store';

/** One row per applicant: the Common Application, then the program's own questions. */
export function packetRows(state: AppState, c: CatalogProgram): [string, string][] {
  const a = state.application;
  const entry = state.programs[c.program.id];
  const recs = requestedRecommenders(state.recommenders);
  return [
    ['Name', `${a.profile.firstName} ${a.profile.lastName}`.trim()],
    ['Email', a.profile.email],
    ['Location', [a.profile.city, a.profile.country].filter(Boolean).join(', ')],
    ['Citizenship', a.profile.citizenship],
    ['Can work without a visa in', a.profile.workAuthorization],
    ['Highest education', [a.background.education, a.background.field, a.background.institution].filter(Boolean).join(', ')],
    ['Current role', a.background.currentRole],
    ['Years of work / research experience', `${a.background.yearsExperience || '–'} / ${a.background.yearsResearch || '–'}`],
    ['Publications', a.background.publications],
    ['CV', a.work.cvFileName],
    ['Links', [a.work.github, a.work.linkedin, a.work.website].filter(Boolean).join(' · ')],
    ['Best work', [a.work.sampleUrl, a.work.sampleSummary].filter(Boolean).join(' — ')],
    ['Earliest start', a.availability.startDate],
    ['Commitment', a.availability.commitment],
    ['Could be based in', a.availability.locations.join(', ')],
    ['Needs a visa', a.availability.needsVisa],
    ['Personal statement', a.statement],
    ...[...c.choices, ...c.questions].map((q): [string, string] => [q.prompt, answerText(entry?.answers[q.id])]),
    ['Recommenders', recs.map((r) => `${r.name} (${[r.role, r.organization].filter(Boolean).join(', ')}): ${r.relationship}`).join(' | ')],
  ];
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function InboxView({ programId }: { programId?: string }) {
  const { state } = useStore();
  const c = (programId && catalogProgram(programId)) || CATALOG_PROGRAMS[0]!;
  const entry = state.programs[c.program.id];
  const rows = packetRows(state, c);
  const name = rows[0]![1];

  const exportCsv = () => {
    const csv = [rows.map(([k]) => csvCell(k)).join(','), rows.map(([, v]) => csvCell(v)).join(',')].join('\n');
    download(`${c.program.id}-applications.csv`, csv);
  };

  let body: ReactNode;
  if (!entry || !name) {
    body = (
      <p className="empty">
        No application to {c.program.name} in this browser yet. <a href={href({ name: 'program', id: c.program.id })}>Apply as an applicant</a>{' '}
        or load the sample applicant from the bar at the top.
      </p>
    );
  } else {
    body = (
      <article className="packet" data-testid="packet">
        <header className="panel-head">
          <div>
            <h2>{name}</h2>
            <p className="muted small">{entry.submittedAt ? `Submitted ${new Date(entry.submittedAt).toLocaleString()}` : 'Preview: not submitted yet'}</p>
          </div>
          <button type="button" className="btn btn-small" onClick={exportCsv}>
            Download as spreadsheet (CSV)
          </button>
        </header>
        <dl className="packet-rows">
          {rows.slice(1).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v || <span className="muted">Not answered</span>}</dd>
            </div>
          ))}
        </dl>
      </article>
    );
  }

  return (
    <section aria-labelledby="inbox-title">
      <div className="page-head">
        <div>
          <h1 id="inbox-title">What programs receive</h1>
          <p className="lede">
            Every applicant arrives in the same format: their Common Application, the program’s own questions, and their recommenders.
            Programs can review it here or download it into the spreadsheet or Airtable they already use.
          </p>
        </div>
      </div>
      <nav className="tabs" aria-label="Programs">
        {CATALOG_PROGRAMS.map((x) => (
          <a
            key={x.program.id}
            href={href({ name: 'inbox', programId: x.program.id })}
            className={x.program.id === c.program.id ? 'tab active' : 'tab'}
            aria-current={x.program.id === c.program.id ? 'page' : undefined}
          >
            {x.program.name}
            {state.programs[x.program.id]?.submittedAt && <span className="tab-dot" aria-label="has a submission" />}
          </a>
        ))}
      </nav>
      {body}
    </section>
  );
}
