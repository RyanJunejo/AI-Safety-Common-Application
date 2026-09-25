import { useId, type ReactNode } from 'react';
import type { Program, Question } from '../data/schema';
import { roundStatus, sortedDeadlines } from '../domain/round';
import { countWords, type ProgramStatus } from '../logic';
import type { Answer } from '../state/app';
import { useNow } from '../state/clock';

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}

const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Whether a program's round is open, with its deadline. `compact` fits tables and cards. */
export function RoundPill({ program, compact = false }: { program: Program; compact?: boolean }) {
  const now = useNow();
  const round = roundStatus(program, now);
  let text = `${round.label} · ${round.detail}`;
  if (compact) {
    const next = sortedDeadlines(program).find((d) => now.getTime() <= Date.parse(d.at));
    if (round.state === 'open') {
      text = next ? `Open · closes ${shortDate.format(new Date(`${next.at.slice(0, 10)}T12:00:00Z`))}` : 'Open · rolling';
    } else {
      text = round.label;
    }
  }
  return (
    <span className={`pill round-${round.state}`} data-testid={`round-${program.id}`} data-state={round.state} title={round.detail}>
      {text}
    </span>
  );
}

const STATUS_LABEL: Record<ProgramStatus, string> = {
  'not-added': 'Not on your list',
  'not-started': 'Not started',
  'in-progress': 'In progress',
  ready: 'Ready to submit',
  submitted: 'Submitted',
  closed: 'Round closed',
};

export function StatusBadge({ status }: { status: ProgramStatus }) {
  return <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Check({ done, label }: { done: boolean; label?: string }) {
  return (
    <span className={done ? 'check done' : 'check'} role="img" aria-label={label ?? (done ? 'Done' : 'Not done')}>
      {done ? '✓' : ''}
    </span>
  );
}

export function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  hint,
  required,
  wide,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  required?: boolean;
  wide?: boolean;
  placeholder?: string;
}) {
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span className="field-label">
        {label}
        {required && <span className="req"> *</span>}
      </span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <span className="req"> *</span>}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A word or character counter, when the program states a limit. */
function Counter({ q, text }: { q: Question; text: string }) {
  const len = q.statedLength;
  if (len?.unit === 'characters' && len.max) {
    const n = text.length;
    return <span className={n > len.max ? 'counter over' : 'counter'}>{n.toLocaleString()} / {len.max.toLocaleString()} characters</span>;
  }
  const n = countWords(text);
  const max = len?.unit === 'words' ? len.max : null;
  return <span className={max && n > max ? 'counter over' : 'counter'}>{max ? `${n} / ${max} words` : `${n} words`}</span>;
}

function Ranking({ q, value, onChange }: { q: Question; value: string[] | undefined; onChange: (v: string[]) => void }) {
  const order = value ?? q.options ?? [];
  const move = (i: number, by: number) => {
    const next = [...order];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item!);
    onChange(next);
  };
  return (
    <div className="ranking">
      <ol>
        {order.map((item, i) => (
          <li key={item}>
            <span className="rank-n">{i + 1}</span>
            <span className="rank-item">{item}</span>
            <button type="button" className="icon-btn" aria-label={`Move “${item}” up`} disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Move “${item}” down`}
              disabled={i === order.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      {!value && (
        <button type="button" className="btn btn-small" onClick={() => onChange(order)}>
          Keep this order
        </button>
      )}
    </div>
  );
}

/** Renders one program question from the inventory, using the format the program uses. */
export function QuestionInput({ q, value, onChange }: { q: Question; value: Answer | undefined; onChange: (v: Answer) => void }) {
  const id = useId();
  const options = q.options ?? [];
  const lengthNote = q.statedLength && q.format !== 'multi-select' ? q.statedLength.text : null;

  let input: ReactNode;
  if (q.format === 'single-select') {
    input = (
      <div className="choices" role="radiogroup" aria-labelledby={id}>
        {options.map((o) => (
          <label key={o} className="choice">
            <input type="radio" name={id} checked={value === o} onChange={() => onChange(o)} /> {o}
          </label>
        ))}
      </div>
    );
  } else if (q.format === 'multi-select') {
    const picked = Array.isArray(value) ? value : [];
    const max = q.statedLength?.unit === 'items' ? q.statedLength.max : null;
    input = (
      <div className="choices" role="group" aria-labelledby={id}>
        {max && <span className="field-hint">Choose {max}.</span>}
        {options.map((o) => (
          <label key={o} className="choice">
            <input
              type="checkbox"
              checked={picked.includes(o)}
              disabled={!picked.includes(o) && max !== null && picked.length >= max}
              onChange={(e) => onChange(e.target.checked ? [...picked, o] : picked.filter((p) => p !== o))}
            />{' '}
            {o}
          </label>
        ))}
      </div>
    );
  } else if (q.format === 'ranking') {
    input = <Ranking q={q} value={Array.isArray(value) ? value : undefined} onChange={onChange} />;
  } else {
    const text = typeof value === 'string' ? value : '';
    input = (
      <>
        <textarea aria-labelledby={id} rows={q.format === 'short-text' ? 2 : 5} value={text} onChange={(e) => onChange(e.target.value)} />
        <Counter q={q} text={text} />
      </>
    );
  }

  return (
    <div className="question" data-testid={`q-${q.id}`}>
      <p className="question-prompt" id={id}>
        {q.prompt}
        {q.aiRule === 'prohibited' && <span className="tag-no-ai">No AI</span>}
      </p>
      {q.helpText && q.helpText !== lengthNote && <p className="field-hint">{q.helpText}</p>}
      {lengthNote && <p className="field-hint">Length: {lengthNote}</p>}
      {input}
    </div>
  );
}

/** The program's rule on AI help for its own questions, in one sentence. */
export function aiRuleText(program: Program): string | null {
  switch (program.aiPolicy.stance) {
    case 'prohibited':
      return `Write these answers yourself. ${program.name} does not accept AI-written answers.`;
    case 'own-draft-refinement':
      return `Write your own first draft. ${program.name} allows using AI to refine it.`;
    case 'section-specific':
      return `${program.name} doesn’t allow AI help, search, or outside help on the questions marked “No AI”.`;
    default:
      return null;
  }
}
