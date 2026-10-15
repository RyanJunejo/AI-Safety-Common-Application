import { useMemo, useState } from 'react';
import { browse, countriesIn, NO_FILTERS, type Filters } from '../catalog/browse';
import { FOCUSED_KINDS, FOCUSES, FOCUS_LABEL, KINDS, KIND_LABEL, type Focus, type Kind } from '../catalog/types';
import { Loading, Notice, OpportunityCard } from '../components/ui';
import { useTitle } from '../components/useTitle';
import { Link, navigate, pathFor, useLocation } from '../router';
import { useCatalog } from '../state/catalog';
import { useToday } from '../state/clock';

const PAGE = 30;

export function readFilters(kind: Kind | null, search: URLSearchParams): Filters {
  const focus = (search.get('focus') ?? '').split(',').filter((f): f is Focus => (FOCUSES as readonly string[]).includes(f));
  return {
    kind,
    q: search.get('q') ?? '',
    focus,
    country: search.get('country') || null,
    remote: search.get('remote') === '1',
    includeClosed: search.get('closed') === '1',
  };
}

export function filtersUrl(f: Filters): string {
  const params = new URLSearchParams();
  if (f.q) params.set('q', f.q);
  if (f.focus.length) params.set('focus', f.focus.join(','));
  if (f.country) params.set('country', f.country);
  if (f.remote) params.set('remote', '1');
  if (f.includeClosed) params.set('closed', '1');
  const query = params.toString();
  return `${pathFor({ name: 'explore', kind: f.kind })}${query ? `?${query}` : ''}`;
}

const INTRO: Record<Kind | 'all', string> = {
  all: 'Every program, course, job, and community in the catalog.',
  program: 'Fellowships, bootcamps, and other training programs. Recurring programs without a round open right now are listed so you can follow them.',
  course: 'Cohort courses with application rounds, and self-paced curricula you can start anytime.',
  job: 'Open roles in AI safety. Jobs have no published deadline, so apply early.',
  community: 'Local groups and online communities to join.',
};

export function ExploreView({ kind }: { kind: Kind | null }) {
  const { search } = useLocation();
  const catalog = useCatalog();
  const today = useToday();
  const filters = readFilters(kind, search);
  const [shown, setShown] = useState(PAGE);
  // Filters start open beside the results, and folded above them on narrow screens.
  const [wide] = useState(() => typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 901px)').matches);
  useTitle(kind ? KIND_LABEL[kind].many : 'Explore');

  const set = (patch: Partial<Filters>) => {
    setShown(PAGE);
    navigate(filtersUrl({ ...filters, ...patch }), { replace: true });
  };

  const items = catalog.status === 'ready' ? catalog.items : [];
  const filterKey = filtersUrl(filters);
  const results = useMemo(() => browse(items, filters, today), [items, filterKey, today]);
  const countries = useMemo(() => countriesIn(items), [items]);
  const focusApplies = !kind || FOCUSED_KINDS.includes(kind);
  const hasRounds = !kind || kind === 'program' || kind === 'course';
  const filtered = filters.q || filters.focus.length || filters.country || filters.remote || filters.includeClosed;

  return (
    <div className="explore">
      <div className="page-head">
        <div>
          <h1>{kind ? KIND_LABEL[kind].many : 'Explore'}</h1>
          <p className="lede">{INTRO[kind ?? 'all']}</p>
        </div>
      </div>

      <div className="explore-layout">
        <details className="filters" aria-label="Filters" open={wide}>
          <summary>Filters{filtered ? ' (on)' : ''}</summary>
          <div className="filter-body">
            <label className="field">
              <span className="field-label">Search</span>
              <input type="search" value={filters.q} placeholder="Keywords, organization, place" onChange={(e) => set({ q: e.target.value })} />
            </label>

            <nav className="filter-group" aria-label="Type">
              <span className="field-label">Type</span>
              <ul className="type-list">
                {[null, ...KINDS].map((k) => {
                  const active = k === kind;
                  return (
                    <li key={k ?? 'all'}>
                      <Link href={filtersUrl({ ...filters, kind: k })} className={active ? 'type-link active' : 'type-link'} aria-current={active ? 'page' : undefined}>
                        {k ? KIND_LABEL[k].many : 'All'}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <fieldset className="filter-group">
              <legend className="field-label">Focus</legend>
              {FOCUSES.map((f) => (
                <label key={f} className="check-row">
                  <input
                    type="checkbox"
                    disabled={!focusApplies}
                    checked={filters.focus.includes(f)}
                    onChange={(e) => set({ focus: e.target.checked ? [...filters.focus, f] : filters.focus.filter((x) => x !== f) })}
                  />
                  {FOCUS_LABEL[f]}
                </label>
              ))}
              <p className="field-hint">{focusApplies ? 'Applies to programs and courses.' : 'Jobs and communities aren’t tagged by focus.'}</p>
            </fieldset>

            <fieldset className="filter-group">
              <legend className="field-label">Location</legend>
              <label className="field">
                <span className="visually-hidden">Country</span>
                <select value={filters.country ?? ''} onChange={(e) => set({ country: e.target.value || null })}>
                  <option value="">Any country</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check-row">
                <input type="checkbox" checked={filters.remote} onChange={(e) => set({ remote: e.target.checked })} />
                Remote or online
              </label>
              {(filters.country || filters.remote) && <p className="field-hint">Listings without a known location show only when no location is chosen.</p>}
            </fieldset>

            {hasRounds && (
              <label className="check-row">
                <input type="checkbox" checked={filters.includeClosed} onChange={(e) => set({ includeClosed: e.target.checked })} />
                Include closed rounds
              </label>
            )}

            {filtered ? (
              <button type="button" className="link-btn" onClick={() => set({ ...NO_FILTERS, kind })}>
                Clear filters
              </button>
            ) : null}
          </div>
        </details>

        <section className="results" aria-label="Results">
          {catalog.status === 'loading' && <Loading label="Loading opportunities…" />}
          {catalog.status === 'error' && (
            <Notice tone="error">
              Couldn’t load opportunities. <button type="button" className="link-btn" onClick={catalog.retry}>Try again</button>
            </Notice>
          )}
          {catalog.status === 'ready' && (
            <>
              <p className="result-count" role="status" data-testid="result-count">
                {results.length === 1 ? '1 result' : `${results.length} results`}
              </p>
              {results.length === 0 ? (
                <p className="empty">Nothing matches these filters. Try fewer filters, or include closed rounds.</p>
              ) : (
                <ul className="opp-list">
                  {results.slice(0, shown).map((o) => (
                    <OpportunityCard key={o.id} o={o} />
                  ))}
                </ul>
              )}
              {results.length > shown && (
                <button type="button" className="btn show-more" onClick={() => setShown((n) => n + PAGE)}>
                  Show more ({results.length - shown} left)
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
