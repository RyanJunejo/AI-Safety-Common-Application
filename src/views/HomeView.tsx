import { useState, type FormEvent } from 'react';
import { browse, NO_FILTERS } from '../catalog/browse';
import { addDays } from '../catalog/dates';
import { liveStatus } from '../catalog/status';
import { KINDS, KIND_LABEL, type Kind, type Opportunity } from '../catalog/types';
import { Loading, Notice, OpportunityCard } from '../components/ui';
import { useTitle } from '../components/useTitle';
import { Link, navigate, pathFor, useLocation } from '../router';
import { useAccount } from '../state/account';
import { useCatalog } from '../state/catalog';
import { useToday } from '../state/clock';

const KIND_BLURB: Record<Kind, string> = {
  program: 'Fellowships, bootcamps, and research programs',
  course: 'Cohort courses and self-paced curricula',
  job: 'Open roles at AI safety organizations',
  community: 'Groups to join, online and near you',
};

function countLine(kind: Kind, items: Opportunity[], today: string): string {
  const ofKind = browse(items, { ...NO_FILTERS, kind }, today);
  if (kind === 'program') {
    const open = ofKind.filter((o) => liveStatus(o, today).state === 'open').length;
    return `${open} open now`;
  }
  return `${ofKind.length} listed`;
}

export function HomeView() {
  useTitle(null);
  const catalog = useCatalog();
  const account = useAccount();
  const today = useToday();
  const [q, setQ] = useState('');
  const deleted = useLocation().search.get('deleted') === '1';

  const search = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/explore?q=${encodeURIComponent(q.trim())}` : '/explore');
  };

  const items = catalog.status === 'ready' ? catalog.items : [];
  const closingSoon = browse(items, NO_FILTERS, today)
    .filter((o) => liveStatus(o, today).state === 'open' && o.deadline)
    .slice(0, 6);
  const weekAgo = addDays(today, -7);
  const shown = new Set(closingSoon.map((o) => o.id));
  const recent = items
    .filter((o) => (o.kind === 'program' || o.kind === 'course') && !shown.has(o.id) && (o.provenance.addedOn ?? '') >= weekAgo && liveStatus(o, today).state !== 'closed')
    .sort((a, b) => (b.provenance.addedOn ?? '').localeCompare(a.provenance.addedOn ?? ''))
    .slice(0, 6);

  return (
    <div className="home">
      {deleted && <Notice tone="ok">Your account and everything stored with it have been deleted.</Notice>}
      <section className="home-hero" aria-labelledby="home-title">
        <p className="eyebrow">AI safety opportunities, in one place</p>
        <h1 id="home-title">Find your next step.</h1>
        <p className="lede">
          Fellowships and other programs, courses, jobs, and communities in AI safety, updated daily. Save what interests you, and get an
          email when a round opens or a deadline is close.
        </p>
        <form className="search" role="search" onSubmit={search}>
          <label htmlFor="home-search" className="visually-hidden">
            Search opportunities
          </label>
          <input id="home-search" type="search" placeholder="Search, e.g. interpretability, policy, London" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>
      </section>

      <ul className="categories" aria-label="Categories">
        {KINDS.map((kind) => (
          <li key={kind}>
            <Link href={pathFor({ name: 'explore', kind })} className="category">
              <span className="category-name">{KIND_LABEL[kind].many}</span>
              <span className="category-blurb">{KIND_BLURB[kind]}</span>
              {catalog.status === 'ready' && <span className="category-count">{countLine(kind, items, today)}</span>}
            </Link>
          </li>
        ))}
      </ul>

      {catalog.status === 'loading' && <Loading label="Loading opportunities…" />}
      {catalog.status === 'error' && (
        <Notice tone="error">
          Couldn’t load opportunities. <button type="button" className="link-btn" onClick={catalog.retry}>Try again</button>
        </Notice>
      )}

      {closingSoon.length > 0 && (
        <section className="home-section" aria-labelledby="closing-soon">
          <div className="section-head">
            <h2 id="closing-soon">Closing soon</h2>
            <Link href="/explore">See everything</Link>
          </div>
          <ul className="opp-list">
            {closingSoon.map((o) => (
              <OpportunityCard key={o.id} o={o} />
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section className="home-section" aria-labelledby="recent">
          <div className="section-head">
            <h2 id="recent">New this week</h2>
          </div>
          <ul className="opp-list">
            {recent.map((o) => (
              <OpportunityCard key={o.id} o={o} />
            ))}
          </ul>
        </section>
      )}

      <div className="home-columns">
        {account.backend !== 'unavailable' && !account.account?.alertsEnabled && (
          <section className="panel cta" aria-labelledby="alerts-cta">
            <h2 id="alerts-cta">Hear about it in time</h2>
            <p>
              Sign in with your email to keep your saved list on any device. Then, if you like, turn on alerts: a Monday digest of new
              matches, reminders before saved deadlines, and a note when a program you follow opens.
            </p>
            <Link href="/account" className="btn btn-primary">
              {account.session ? 'Set up alerts' : 'Sign in with email'}
            </Link>
          </section>
        )}
        <section className="panel" aria-labelledby="guides-cta">
          <h2 id="guides-cta">Applying soon?</h2>
          <p>Guides on choosing programs, writing answers, work samples, references, and interviews.</p>
          <Link href="/guides">Read the guides</Link>
        </section>
      </div>
    </div>
  );
}
