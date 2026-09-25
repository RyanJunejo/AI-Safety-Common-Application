import type { Program, Question, ReuseClass } from '../data/schema';
import { AI_STANCE_META } from '../domain/ai';
import type { Fit } from '../domain/prep';
import { formatVerified, roundStatus, type RoundState } from '../domain/round';
import { useNow } from '../state/clock';
import { REUSE_META, VISIBILITY_META } from '../domain/taxonomy';

export function RoundBadge({ program, withDetail = false }: { program: Program; withDetail?: boolean }) {
  const s = roundStatus(program, useNow());
  return (
    <span className={`badge round-${s.state}`} data-testid={`round-${program.id}`} data-state={s.state} title={s.detail}>
      <span className="dot" aria-hidden="true" />
      {s.label}
      {withDetail && <span className="badge-detail"> · {s.detail}</span>}
    </span>
  );
}

export function ReuseBadge({ reuse }: { reuse: ReuseClass }) {
  return (
    <span className={`badge reuse-${reuse}`} title={REUSE_META[reuse].description}>
      {REUSE_META[reuse].short}
    </span>
  );
}

/**
 * Exact prompts are tied to the round they were read from. Once that round is
 * closed the next one may change them; when the round's status is unknown, the
 * badge says when the wording was verified rather than implying a closure.
 */
export function VisibilityBadge({ q, roundState = 'open' }: { q: Question; roundState?: RoundState }) {
  const meta = VISIBILITY_META[q.promptVisibility];
  const exact = q.promptVisibility === 'verbatim';
  const suffix = !exact || roundState === 'open' ? '' : roundState === 'closed' ? ' · closed round' : ` · as of ${formatVerified(q.verifiedOn)}`;
  const note =
    !exact || roundState === 'open'
      ? ''
      : roundState === 'closed'
        ? ' This round is closed; the next round may change it.'
        : ' The round’s current status needs rechecking.';
  return (
    <span className={`badge vis-${q.promptVisibility}`} title={meta.description + note} data-visibility={q.promptVisibility}>
      {meta.label}
      {suffix}
    </span>
  );
}

export function AiBadge({ program }: { program: Program }) {
  const meta = AI_STANCE_META[program.aiPolicy.stance];
  return (
    <span className={`badge ai-${meta.tone}`} title={program.aiPolicy.summary}>
      {meta.label}
    </span>
  );
}

export function FitBadge({ fit }: { fit: Fit }) {
  const label = fit.state === 'compatible' ? 'Location works' : fit.state === 'conflict' ? 'Location conflict' : 'Location unknown';
  return (
    <span className={`badge fit-${fit.state}`} title={fit.reason}>
      {label}
    </span>
  );
}

export function ExternalLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (opens official site in a new tab)</span>
    </a>
  );
}

export function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div className="meter" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="meter-fill" style={{ width: `${value}%` }} />
    </div>
  );
}
