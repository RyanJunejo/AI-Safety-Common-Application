import type { ReactNode } from 'react';
import { attributionCardLabel, listingAttribution } from '../catalog/attribution';
import { formatShortDay } from '../catalog/dates';
import { describeLocation } from '../catalog/location';
import { closesIn, liveStatus } from '../catalog/status';
import { FOCUS_LABEL, KIND_LABEL, type Opportunity } from '../catalog/types';
import { Link, navigate, opportunityPath } from '../router';
import { useAccount } from '../state/account';
import { useToday } from '../state/clock';

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

/** Open, opening soon, closed, and so on, with the deadline when there is one. */
export function StatusPill({ o, long = false }: { o: Opportunity; long?: boolean }) {
  const today = useToday();
  const s = liveStatus(o, today);
  let text = s.label;
  if (long) text = s.detail === s.label ? s.label : `${s.label} · ${s.detail}`;
  else if (s.state === 'open' && o.deadline) {
    text = s.daysLeft !== null && s.daysLeft <= 7 ? closesIn(s.daysLeft) : `Open · closes ${formatShortDay(o.deadline)}`;
  }
  return (
    <span className={`pill state-${s.state}`} data-testid={`status-${o.id}`} data-state={s.state} title={s.detail}>
      {text}
    </span>
  );
}

export function Tags({ o }: { o: Opportunity }) {
  return (
    <span className="tags">
      <span className="tag tag-kind">{o.kind === 'program' || o.kind === 'course' ? o.format : KIND_LABEL[o.kind].one}</span>
      {o.focus.map((f) => (
        <span key={f} className={`tag tag-${f}`}>
          {FOCUS_LABEL[f]}
        </span>
      ))}
    </span>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" className="icon">
      <path d="M6 3h12v18l-6-4.5L6 21z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

export function SaveButton({ o, small = false }: { o: Pick<Opportunity, 'id' | 'title'>; small?: boolean }) {
  const account = useAccount();
  const saved = account.isSaved(o.id);
  return (
    <button
      type="button"
      className={`btn save-btn${small ? ' btn-small' : ''}${saved ? ' is-saved' : ''}`}
      aria-pressed={saved}
      aria-label={`${saved ? 'Saved' : 'Save'}: ${o.title}`}
      onClick={() => void account.toggleSave(o.id)}
    >
      <BookmarkIcon filled={saved} /> {saved ? 'Saved' : 'Save'}
    </button>
  );
}

/** Follow a recurring program to hear when each new round opens. Needs an account. */
export function FollowButton({ familyId, name }: { familyId: string; name: string }) {
  const account = useAccount();
  if (account.backend === 'unavailable') return null;
  const following = account.isFollowing(familyId);
  if (!account.session) {
    return (
      <button
        type="button"
        className="btn"
        onClick={() => {
          account.followAfterSignIn(familyId);
          navigate(`/account?follow=${encodeURIComponent(familyId)}`);
        }}
      >
        Follow {name}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`btn${following ? ' is-saved' : ''}`}
      aria-pressed={following}
      onClick={() => void (following ? account.unfollow(familyId) : account.follow(familyId))}
    >
      {following ? `Following ${name}` : `Follow ${name}`}
    </button>
  );
}

export function OpportunityCard({ o, headingLevel = 3 }: { o: Opportunity; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const attribution = listingAttribution(o);
  return (
    <li className="opp-card" data-testid={`card-${o.id}`}>
      <div className="opp-top">
        <Tags o={o} />
        <StatusPill o={o} />
      </div>
      <H className="opp-title">
        <Link href={opportunityPath(o.id)}>{o.title}</Link>
      </H>
      {o.organization && <p className="opp-org">{o.organization}</p>}
      {o.summary && <p className="opp-summary">{o.summary}</p>}
      <p className="opp-source">
        <ExternalLink href={attribution.href}>{attributionCardLabel(attribution)}</ExternalLink>
      </p>
      <div className="opp-foot">
        <span className="opp-where">{describeLocation(o.location)}</span>
        <SaveButton o={o} small />
      </div>
    </li>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'error' | 'ok' }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="loading" role="status">
      {label}
    </p>
  );
}

export function NotFound() {
  return (
    <section className="narrow">
      <h1>Page not found</h1>
      <p>
        That page doesn’t exist. Try <Link href="/explore">exploring opportunities</Link> or going <Link href="/">home</Link>.
      </p>
    </section>
  );
}
