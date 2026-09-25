import { useState } from 'react';
import type { Program } from '../data/schema';
import { INVENTORY } from '../data/inventory';
import { ExternalLink, RoundBadge, VisibilityBadge } from '../components/Badges';
import { downloadText } from '../domain/export';
import { formatVerified, lastVerified, roundStatus } from '../domain/round';
import { CATEGORY_META, FORMAT_LABEL, lengthLabel } from '../domain/taxonomy';
import { useNow } from '../state/clock';

const FORM_VISIBILITY_LABEL: Record<Program['formVisibility'], string> = {
  visible: 'Application form visible',
  partial: 'Form closed; some wording published elsewhere',
  closed: 'Form closed; prompts not visible',
};

export function SourcesView() {
  const [openId, setOpenId] = useState<string | null>(null);
  const now = useNow();
  const totals = INVENTORY.flatMap((r) => r.questions).reduce(
    (acc, q) => ({ ...acc, [q.promptVisibility]: acc[q.promptVisibility] + 1 }),
    { verbatim: 0, paraphrased: 0, unknown: 0 },
  );

  return (
    <section aria-labelledby="sources-title">
      <div className="page-head">
        <div>
          <h1 id="sources-title">Sources</h1>
          <p className="lede">
            Each program’s record comes from its official pages and forms, read without entering or submitting anything. Prompts are
            labelled exact only when their wording was visible on an official page on the verification date.
          </p>
        </div>
        <dl className="stat-row">
          <div>
            <dt>Exact prompts</dt>
            <dd>{totals.verbatim}</dd>
          </div>
          <div>
            <dt>Wording not verified</dt>
            <dd>{totals.paraphrased}</dd>
          </div>
          <div>
            <dt>Not published</dt>
            <dd>{totals.unknown}</dd>
          </div>
        </dl>
      </div>
      <p>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => downloadText('fellowship-question-inventory.json', JSON.stringify(INVENTORY, null, 2), 'application/json')}
        >
          Download the question inventory (JSON)
        </button>
      </p>

      <ul className="source-list">
        {INVENTORY.map(({ program, questions }) => {
          const round = roundStatus(program, now);
          const counts = { verbatim: 0, paraphrased: 0, unknown: 0 };
          for (const q of questions) counts[q.promptVisibility] += 1;
          const open = openId === program.id;
          return (
            <li key={program.id} className="source-card" data-testid={`source-${program.id}`}>
              <header>
                <h2>{program.name}</h2>
                <RoundBadge program={program} withDetail />
                <span className="badge badge-plain">{FORM_VISIBILITY_LABEL[program.formVisibility]}</span>
                <span className="verified">Verified {formatVerified(lastVerified(program))}</span>
              </header>
              <blockquote className="evidence">
                {program.roundStatusEvidence}{' '}
                <ExternalLink href={program.roundStatusSourceUrl}>source</ExternalLink>
              </blockquote>
              <p className="source-counts">
                {questions.length} questions: {counts.verbatim} exact, {counts.paraphrased} wording not verified, {counts.unknown} not
                published
              </p>
              <ul className="source-links">
                {program.sources.map((s) => (
                  <li key={s.url}>
                    <ExternalLink href={s.url}>{s.label}</ExternalLink> <span className="muted">· accessed {formatVerified(s.accessed)}</span>
                    {s.note && <p>{s.note}</p>}
                  </li>
                ))}
              </ul>
              {program.notes && <p className="source-notes">{program.notes}</p>}
              <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpenId(open ? null : program.id)}>
                {open ? 'Hide' : 'Show'} all {questions.length} questions
              </button>
              {open && (
                <div className="map-scroll">
                  <table className="inventory">
                    <thead>
                      <tr>
                        <th scope="col">Prompt</th>
                        <th scope="col">Category</th>
                        <th scope="col">Stage</th>
                        <th scope="col">Format</th>
                        <th scope="col">Length</th>
                        <th scope="col">Required</th>
                        <th scope="col">Wording</th>
                        <th scope="col">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {questions.map((q) => (
                        <tr key={q.id}>
                          <td>{q.prompt}</td>
                          <td>{CATEGORY_META[q.category].label}</td>
                          <td>{program.stages.find((s) => s.id === q.stage)?.name ?? q.stage}</td>
                          <td>{FORMAT_LABEL[q.format]}</td>
                          <td>{lengthLabel(q)}</td>
                          <td>{q.condition ? 'If applicable' : q.required}</td>
                          <td>
                            <VisibilityBadge q={q} roundState={round.state} />
                          </td>
                          <td>
                            <ExternalLink href={q.sourceUrl}>{formatVerified(q.verifiedOn)}</ExternalLink>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
