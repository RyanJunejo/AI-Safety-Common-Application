import type { Program, Question, ReuseClass } from '../data/schema';
import { getProgram } from '../data/inventory';
import { AiBadge, ExternalLink, FitBadge, Meter, ReuseBadge, RoundBadge, VisibilityBadge } from '../components/Badges';
import { checklistMarkdown, downloadText } from '../domain/export';
import { locationFit, programPrep, readinessPercent, type PrepItem, type ProgramPrep } from '../domain/prep';
import { formatDeadline, formatVerified, lastVerified, roundStatus, sortedDeadlines, type RoundState } from '../domain/round';
import { useNow } from '../state/clock';
import { countWords, FORMAT_LABEL, lengthLabel, REUSE_META, REUSE_ORDER } from '../domain/taxonomy';
import { href } from '../router';
import { useWorkspace } from '../state/store';
import {
  ANSWER_STATUSES,
  ANSWER_STATUS_LABEL,
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABEL,
  progressFor,
  type AnswerProgress,
  type AnswerStatus,
  type ApplicationStatus,
} from '../state/workspace';

export function ProgramView({ id }: { id: string }) {
  const program = getProgram(id);
  if (!program) {
    return (
      <section>
        <h1>Program not found</h1>
        <p>
          <a href={href({ name: 'programs' })}>Back to all programs</a>
        </p>
      </section>
    );
  }
  return <ProgramPrepView program={program} />;
}

function ProgramPrepView({ program }: { program: Program }) {
  const { ws, dispatch } = useWorkspace();
  const prep = programPrep(program, ws);
  const progress = progressFor(ws, program.id);
  const fit = locationFit(program, ws.dossier);
  const now = useNow();
  const round = roundStatus(program, now);
  const roundState = round.state;
  const verified = lastVerified(program);

  const update = (questionId: string, patch: Partial<AnswerProgress>) =>
    dispatch({ type: 'answer/update', programId: program.id, questionId, patch });

  const exportOne = () =>
    downloadText(`${program.id}-checklist-${now.toISOString().slice(0, 10)}.md`, checklistMarkdown(ws, now, program.id));

  return (
    <article className="prep" aria-labelledby="prep-title">
      <p className="crumb">
        <a href={href({ name: 'programs' })}>← All programs</a>
      </p>

      <header className="prep-head">
        <div>
          <h1 id="prep-title">{program.name}</h1>
          <p className="pc-sub">
            {program.fullName} · {program.organization}
            {program.cohort ? ` · ${program.cohort}` : ''}
          </p>
          <div className="pc-badges">
            <RoundBadge program={program} withDetail />
            <FitBadge fit={fit} />
            <AiBadge program={program} />
          </div>
        </div>
        <div className="prep-status">
          <label className="mini-label" htmlFor="app-status">
            Your application status
          </label>
          <select
            id="app-status"
            value={progress.status}
            onChange={(e) =>
              dispatch({ type: 'program/status', programId: program.id, status: e.target.value as ApplicationStatus })
            }
          >
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {APPLICATION_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <Meter value={readinessPercent(prep)} label="Readiness" />
          <p className="pc-ready" data-testid="readiness">
            {prep.requiredDone} of {prep.requiredTotal} required items ready
          </p>
          <div className="pc-links">
            <button type="button" className="btn btn-small" onClick={exportOne}>
              Export this checklist
            </button>
            <ExternalLink href={program.applyUrl} className="btn btn-small btn-primary">
              {round.state === 'open' ? 'Apply on official form' : 'Official application page'}
            </ExternalLink>
          </div>
        </div>
      </header>

      {round.state === 'closed' && (
        <div className="callout callout-closed" role="note" data-testid="round-callout">
          <strong>This round is not accepting applications.</strong> {round.detail}.
          {program.nextRoundNote && <> {program.nextRoundNote}</>} You can still prepare: facts in your dossier carry over to the next
          round.
        </div>
      )}
      {round.state === 'unknown' && (
        <div className="callout callout-recheck" role="note" data-testid="round-callout">
          <strong>Check the official page before applying.</strong> {round.detail}. This workspace can’t confirm whether the round is
          still open.
        </div>
      )}

      <dl className="facts">
        <Fact term="Dates">
          {program.programDates ?? 'Not published'}
          <Deadlines program={program} now={now} />
        </Fact>
        <Fact term="Where">
          {program.locations.join(' / ') || 'Not published'}
          {program.locationNotes && <small>{program.locationNotes}</small>}
        </Fact>
        <Fact term="Support">{program.compensation ?? 'Not published'}</Fact>
        <Fact term="Commitment">{program.commitment ?? 'Not published'}</Fact>
        <Fact term="Published time estimate">
          {program.publishedTimeEstimate ? (
            <>
              {program.publishedTimeEstimate.text}{' '}
              <ExternalLink href={program.publishedTimeEstimate.sourceUrl}>source</ExternalLink>
            </>
          ) : (
            'Not published'
          )}
        </Fact>
        <Fact term="Verified">
          {formatVerified(verified)} · <a href={href({ name: 'sources' })}>sources</a>
        </Fact>
      </dl>

      <section className={`ai-policy ai-${program.aiPolicy.stance}`} aria-labelledby="ai-title">
        <h2 id="ai-title">AI use in this application</h2>
        <p>{program.aiPolicy.summary}</p>
        {program.aiPolicy.quote && <blockquote>{program.aiPolicy.quote}</blockquote>}
        {program.aiPolicy.sourceUrl && <ExternalLink href={program.aiPolicy.sourceUrl}>Program’s policy</ExternalLink>}
      </section>

      <AtAGlance prep={prep} />

      <Stages program={program} />

      <DossierSection items={prep.groups.dossier} update={update} roundState={roundState} />
      <WritingSection reuse="tailor" items={prep.groups.tailor} update={update} program={program} roundState={roundState} />
      <WritingSection reuse="original" items={prep.groups.original} update={update} program={program} roundState={roundState} />
      <AttestSection items={prep.groups.attest} update={update} roundState={roundState} />
      <UnseenSection
        title="Not yet published"
        lede="These questions exist but their exact wording is not public. Check the official form when the round opens."
        questions={prep.notYetVisible}
        testId="not-yet-visible"
        roundState={roundState}
      />
      <UnseenSection
        title="Later stages, if shortlisted"
        lede="Tasks, assessments, and interviews that come after the upfront application. Not counted in readiness."
        questions={prep.later}
        testId="later-stages"
        roundState={roundState}
      />
    </article>
  );
}

/** What is left, per way of preparing, with jump links to each section. */
function AtAGlance({ prep }: { prep: ProgramPrep }) {
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const cells = REUSE_ORDER.filter((r) => prep.groups[r].length > 0).map((r) => {
    const counted = prep.groups[r].filter((i) => i.counted);
    return { id: `sec-${r}`, reuse: r, left: counted.filter((i) => !i.done).length, total: counted.length };
  });
  return (
    <nav className="glance" aria-label="What this application still needs" data-testid="at-a-glance">
      {cells.map((c) => (
        <button key={c.id} type="button" className={`glance-cell reuse-${c.reuse}-soft`} onClick={() => jump(c.id)}>
          <span className="glance-n">{c.left}</span>
          <span className="glance-label">
            {REUSE_META[c.reuse].label}
            <small>
              left of {c.total} required
            </small>
          </span>
        </button>
      ))}
      {prep.notYetVisible.length > 0 && (
        <button type="button" className="glance-cell mix-unknown-soft" onClick={() => jump('sec-unseen')}>
          <span className="glance-n">{prep.notYetVisible.length}</span>
          <span className="glance-label">
            Not yet published
            <small>prompts to check when the round opens</small>
          </span>
        </button>
      )}
    </nav>
  );
}

/** Every stated deadline, marked when it has passed. */
function Deadlines({ program, now }: { program: Program; now: Date }) {
  const deadlines = sortedDeadlines(program);
  if (deadlines.length === 0) return <small>No application deadline stated</small>;
  return (
    <small data-testid="deadlines">
      {deadlines.map((d, i) => {
        const passed = now.getTime() > Date.parse(d.at);
        return (
          <span key={d.at} className={passed ? 'deadline passed' : 'deadline'}>
            {i > 0 && '; '}
            {deadlines.length > 1 && d.label ? `${d.label}: ` : 'Deadline: '}
            {formatDeadline(d.at)}
            {passed && ' (passed)'}
          </span>
        );
      })}
    </small>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Stages({ program }: { program: Program }) {
  return (
    <section aria-labelledby="stages-title" className="stages">
      <h2 id="stages-title">Stages</h2>
      <ol>
        {program.stages.map((s) => (
          <li key={s.id} className={s.phase === 'application' ? 'stage upfront' : 'stage'}>
            <span className="stage-name">{s.name}</span>
            <span className="stage-desc">{s.description}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SectionHead({ reuse, count, done }: { reuse: ReuseClass; count: number; done: number }) {
  return (
    <header className="section-head">
      <h2 id={`sec-${reuse}`}>
        <span className={`swatch reuse-${reuse}`} aria-hidden="true" /> {REUSE_META[reuse].label}
        <span className="section-count">
          {done}/{count}
        </span>
      </h2>
      <p>{REUSE_META[reuse].description}</p>
    </header>
  );
}

function requiredLabel(q: Question): string {
  if (q.condition) return `If applicable: ${q.condition}`;
  if (q.required === 'required') return 'Required';
  return q.required === 'optional' ? 'Optional' : 'Required status unknown';
}

function QuestionMeta({ q, roundState }: { q: Question; roundState: RoundState }) {
  return (
    <p className="q-meta">
      <VisibilityBadge q={q} roundState={roundState} />
      <span>{FORMAT_LABEL[q.format]}</span>
      <span>{lengthLabel(q)}</span>
      <span className={q.condition ? 'q-condition' : undefined}>{requiredLabel(q)}</span>
      {q.aiRule === 'prohibited' && <span className="ai-flag">No AI assistance</span>}
    </p>
  );
}

function ArtifactPicker({ item, update }: { item: PrepItem; update: Update }) {
  const { ws } = useWorkspace();
  const q = item.question;
  const toggle = (id: string, on: boolean) =>
    update(q.id, { artifactIds: on ? [...item.answer.artifactIds, id] : item.answer.artifactIds.filter((a) => a !== id) });
  if (ws.dossier.artifacts.length === 0) {
    return (
      <p className="check-gap">
        No artifacts yet · <a href={href({ name: 'dossier' })}>Add one to your dossier</a>
      </p>
    );
  }
  return (
    <fieldset className="artifact-picker">
      <legend>Attach from your dossier</legend>
      {ws.dossier.artifacts.map((a) => (
        <label key={a.id}>
          <input type="checkbox" checked={item.answer.artifactIds.includes(a.id)} onChange={(e) => toggle(a.id, e.target.checked)} />{' '}
          {a.title}
          {!a.shareable && <span className="muted"> (not shareable: describe it instead)</span>}
        </label>
      ))}
    </fieldset>
  );
}

type Update = (questionId: string, patch: Partial<AnswerProgress>) => void;

function sectionCounts(items: PrepItem[]) {
  const counted = items.filter((i) => i.counted);
  return { count: counted.length, done: counted.filter((i) => i.done).length };
}

function DossierSection({ items, update, roundState }: { items: PrepItem[]; update: Update; roundState: RoundState }) {
  if (!items.length) return null;
  return (
    <section className="prep-section" aria-labelledby="sec-dossier" data-testid="section-dossier">
      <SectionHead reuse="dossier" {...sectionCounts(items)} />
      <ul className="checklist">
        {items.map((item) => {
          const q = item.question;
          const isArtifacts = q.dossierField === 'artifacts';
          return (
            <li key={q.id} className={item.done ? 'check done' : 'check'} data-testid={`q-${q.id}`}>
              <span className="check-box" aria-hidden="true">
                {item.done ? '✓' : ''}
              </span>
              <div className="check-body">
                <p className="check-prompt">{q.prompt}</p>
                {item.fromDossier && !isArtifacts && <p className="check-value">From dossier: {item.fromDossier}</p>}
                {isArtifacts && <ArtifactPicker item={item} update={update} />}
                {item.gap && (
                  <p className="check-gap">
                    {item.gap} · <a href={href({ name: 'dossier' })}>Edit dossier</a>
                  </p>
                )}
                {!q.dossierField && (
                  <label className="check-manual">
                    <input
                      type="checkbox"
                      checked={item.answer.confirmed}
                      onChange={(e) => update(q.id, { confirmed: e.target.checked })}
                    />{' '}
                    Answer ready
                  </label>
                )}
              </div>
              <QuestionMeta q={q} roundState={roundState} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function WritingSection({
  reuse,
  items,
  update,
  program,
  roundState,
}: {
  reuse: 'tailor' | 'original';
  items: PrepItem[];
  update: Update;
  program: Program;
  roundState: RoundState;
}) {
  const { ws } = useWorkspace();
  if (!items.length) return null;
  const aiProhibited = program.aiPolicy.stance === 'prohibited';
  return (
    <section className="prep-section" aria-labelledby={`sec-${reuse}`} data-testid={`section-${reuse}`}>
      <SectionHead reuse={reuse} {...sectionCounts(items)} />
      <ul className="writing-list">
        {items.map((item) => {
          const q = item.question;
          const words = countWords(item.answer.draft);
          const max = q.statedLength?.unit === 'words' ? q.statedLength.max : null;
          const chars = item.answer.draft.length;
          const maxChars = q.statedLength?.unit === 'characters' ? q.statedLength.max : null;
          const over = (max !== null && words > max) || (maxChars !== null && chars > maxChars);
          const textual = q.format === 'long-text' || q.format === 'short-text';
          const timed = q.format === 'timed-task';
          return (
            <li key={q.id} className={`writing reuse-${reuse}-edge${item.done ? ' done' : ''}`} data-testid={`q-${q.id}`}>
              <div className="writing-head">
                <ReuseBadge reuse={reuse} />
                <p className="writing-prompt">{q.prompt}</p>
                {item.done && <span className="done-mark">✓ Ready</span>}
              </div>
              {q.helpText && <p className="writing-help">{q.helpText}</p>}
              <QuestionMeta q={q} roundState={roundState} />
              {q.options && (
                <p className="writing-options">
                  Options: {q.options.join(' · ')}
                </p>
              )}
              {(q.aiRule === 'prohibited' || aiProhibited) && (
                <p className="ai-reminder">Write this in your own words. {program.name} does not accept AI-written answers.</p>
              )}

              {q.dossierField === 'artifacts' && <ArtifactPicker item={item} update={update} />}
              {item.gap && <p className="check-gap">{item.gap}</p>}
              {q.dossierField === 'researchInterests' && ws.dossier.researchNotes.trim() && (
                <p className="writing-notes">
                  <span className="mini-label">Your notes to draw on</span>
                  {ws.dossier.researchNotes}
                </p>
              )}

              {timed ? (
                <label className="check-manual">
                  <input type="checkbox" checked={item.answer.confirmed} onChange={(e) => update(q.id, { confirmed: e.target.checked })} />{' '}
                  Can’t be drafted in advance. I have set aside uninterrupted time for it.
                </label>
              ) : (
              <div className="writing-controls">
                <label className="field field-inline">
                  <span>Progress</span>
                  <select value={item.answer.status} onChange={(e) => update(q.id, { status: e.target.value as AnswerStatus })}>
                    {ANSWER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {ANSWER_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
                {textual && (
                  <span className={over ? 'wordcount over' : 'wordcount'}>
                    {maxChars !== null ? `${chars} / ${maxChars} characters` : `${words}${max ? ` / ${max}` : ''} words`}
                  </span>
                )}
              </div>
              )}
              {textual && (
                <label className="field">
                  <span>Your working draft (kept in this browser)</span>
                  <textarea
                    rows={q.format === 'long-text' ? 5 : 2}
                    value={item.answer.draft}
                    onChange={(e) => update(q.id, { draft: e.target.value })}
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AttestSection({ items, update, roundState }: { items: PrepItem[]; update: Update; roundState: RoundState }) {
  if (!items.length) return null;
  return (
    <section className="prep-section" aria-labelledby="sec-attest" data-testid="section-attest">
      <SectionHead reuse="attest" {...sectionCounts(items)} />
      <ul className="checklist">
        {items.map((item) => {
          const q = item.question;
          return (
            <li key={q.id} className={item.done ? 'check done' : 'check'} data-testid={`q-${q.id}`}>
              <span className="check-box" aria-hidden="true">
                {item.done ? '✓' : ''}
              </span>
              <div className="check-body">
                <p className="check-prompt">{q.prompt}</p>
                {q.helpText && <p className="writing-help">{q.helpText}</p>}
                {q.options && <p className="writing-options">Options: {q.options.join(' · ')}</p>}
                <label className="check-manual">
                  <input type="checkbox" checked={item.answer.confirmed} onChange={(e) => update(q.id, { confirmed: e.target.checked })} />{' '}
                  {q.category === 'consent' ? 'I have read the official wording' : 'Answer ready'}
                </label>
              </div>
              <QuestionMeta q={q} roundState={roundState} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function UnseenSection({
  title,
  lede,
  questions,
  testId,
  roundState,
}: {
  title: string;
  lede: string;
  questions: Question[];
  testId: string;
  roundState: RoundState;
}) {
  if (!questions.length) return null;
  return (
    <section className="prep-section unseen" data-testid={testId}>
      <header className="section-head">
        <h2 id={testId === 'not-yet-visible' ? 'sec-unseen' : undefined}>{title}</h2>
        <p>{lede}</p>
      </header>
      <ul className="unseen-list">
        {questions.map((q) => (
          <li key={q.id} data-testid={`q-${q.id}`}>
            <p className="check-prompt">{q.prompt}</p>
            <p className="q-meta">
              <VisibilityBadge q={q} roundState={roundState} />
              <span>{FORMAT_LABEL[q.format]}</span>
              <span>{lengthLabel(q)}</span>
              {q.condition && <span className="q-condition">If applicable: {q.condition}</span>}
            </p>
            {q.notes && <p className="writing-help">{q.notes}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
