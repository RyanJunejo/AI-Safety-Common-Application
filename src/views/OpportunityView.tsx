import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { cohortsOf, hasActionableCohort } from '../catalog/browse';
import { formatDay, isIsoDay } from '../catalog/dates';
import { describeLocation } from '../catalog/location';
import { closesIn, liveStatus } from '../catalog/status';
import { KIND_LABEL, type Opportunity } from '../catalog/types';
import { ExternalLink, FollowButton, Loading, Notice, SaveButton, StatusPill, Tags } from '../components/ui';
import { useTitle } from '../components/useTitle';
import { Link, opportunityPath, pathFor } from '../router';
import { PREP_NOTES_BY_FAMILY } from '../site';
import { useCatalog, useListings } from '../state/catalog';
import { useToday } from '../state/clock';

// Preparation notes read the researched program records; load them only when needed.
const PrepNotes = lazy(() => import('./PrepNotes'));

/** Paragraphs and bullet lists from plain source text. */
function Description({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="description">
      {blocks.map((block, i) => {
        const lines = block.split('\n').filter(Boolean);
        if (lines.length && lines.every((l) => /^[*\-•]\s+/.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^[*\-•]\s+/, '')}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{lines.join(' ')}</p>;
      })}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const ACTION: Record<Opportunity['kind'], string> = {
  program: 'Official page',
  course: 'Course page',
  job: 'Job posting',
  community: 'Join',
};

export function OpportunityView({ id }: { id: string }) {
  const catalog = useCatalog();
  const today = useToday();
  const { found, loading } = useListings([id]);
  const entry = found.get(id);
  const o = entry?.item;
  const [description, setDescription] = useState<string | null>(null);
  useTitle(o?.title ?? null);

  useEffect(() => {
    setDescription(null);
    if (catalog.status !== 'ready') return;
    let cancelled = false;
    catalog.source
      .description(id)
      .then((d) => !cancelled && setDescription(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [catalog, id]);

  if (catalog.status === 'error') {
    return (
      <Notice tone="error">
        Couldn’t load this listing. <button type="button" className="link-btn" onClick={catalog.retry}>Try again</button>
      </Notice>
    );
  }
  if (!o) {
    if (loading || catalog.status === 'loading') return <Loading />;
    return (
      <section className="narrow">
        <h1>Listing not found</h1>
        <p>
          It may have been removed from AISafety.com. <Link href="/explore">Explore current opportunities</Link>.
        </p>
      </section>
    );
  }

  const items = catalog.status === 'ready' ? catalog.items : [];
  const familyId = o.familyLink === 'family' ? o.id : o.familyLink === 'linked' ? o.familyId : null;
  const family = familyId ? (familyId === o.id ? o : (catalog.status === 'ready' ? catalog.byId.get(familyId) : undefined)) : undefined;
  const rounds = familyId ? cohortsOf(familyId, items).filter((c) => c.id !== o.id) : [];
  const prepId = familyId ? PREP_NOTES_BY_FAMILY[familyId] : undefined;
  const status = liveStatus(o, today);
  const shortName = family ? family.title.replace(/\s*\(.*\)$/, '') : 'this program';

  return (
    <article className="detail" aria-labelledby="detail-title">
      <p className="crumb">
        <Link href={pathFor({ name: 'explore', kind: o.kind })}>← {KIND_LABEL[o.kind].many}</Link>
      </p>

      <header className="detail-head">
        <div>
          <div className="opp-top">
            <Tags o={o} />
            <StatusPill o={o} long />
          </div>
          <h1 id="detail-title">{o.title}</h1>
          {o.organization && <p className="detail-org">{o.organization}</p>}
          {o.summary && <p className="lede">{o.summary}</p>}
          <div className="detail-actions">
            <ExternalLink href={o.url} className="btn btn-primary">
              {ACTION[o.kind]}
            </ExternalLink>
            <SaveButton o={o} />
            {familyId && family && <FollowButton familyId={familyId} name={shortName} />}
          </div>
          {!entry.active && (
            <Notice tone="warn">This listing is no longer on AISafety.com. The round may have ended, or the listing was removed.</Notice>
          )}
        </div>

        <dl className="facts">
          {o.deadline ? (
            <Fact label="Deadline">
              {formatDay(o.deadline)}, as published
              {status.daysLeft !== null && status.daysLeft <= 14 && <span className="muted"> · {closesIn(status.daysLeft).toLowerCase()}</span>}
            </Fact>
          ) : (
            <Fact label="Status">{status.detail}</Fact>
          )}
          {(o.startDate || o.startText) && <Fact label="Starts">{o.startDate ? formatDay(o.startDate) : o.startText}</Fact>}
          <Fact label="Location">{describeLocation(o.location)}</Fact>
          {o.location.known && <Fact label="Remote or online">{o.location.remote ? (o.location.remoteCountries.length ? `Yes, from ${o.location.remoteCountries.join(', ')}` : 'Yes') : 'No'}</Fact>}
          {o.facts.map((f) => (
            <Fact key={f.label} label={f.label}>
              {isIsoDay(f.value) ? formatDay(f.value) : f.value}
            </Fact>
          ))}
        </dl>
      </header>

      {o.deadline && (status.state === 'open' || status.state === 'upcoming') && (
        <p className="note">
          The deadline is the date as published. Check the <ExternalLink href={o.url}>official page</ExternalLink> for the exact closing time and timezone.
        </p>
      )}

      {description && (
        <section className="detail-section" aria-labelledby="about">
          <h2 id="about">About</h2>
          <Description text={description} />
        </section>
      )}

      {familyId && family && (
        <section className="detail-section" aria-labelledby="rounds">
          <h2 id="rounds">{o.familyLink === 'family' ? 'Rounds' : `Other rounds of ${shortName}`}</h2>
          {o.familyLink === 'linked' && (
            <p>
              Part of <Link href={opportunityPath(family.id)}>{family.title}</Link>, which runs regularly. Follow it to get an email when a new
              round opens.
            </p>
          )}
          {o.familyLink === 'family' && !hasActionableCohort(o.id, items, today) && (
            <p>No round is open right now. Follow {shortName} to get an email when the next one opens.</p>
          )}
          {rounds.length > 0 && (
            <ul className="round-list">
              {rounds.map((c) => (
                <li key={c.id}>
                  <Link href={opportunityPath(c.id)}>{c.title}</Link> <StatusPill o={c} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {prepId && (
        <Suspense fallback={null}>
          <PrepNotes inventoryId={prepId} />
        </Suspense>
      )}

      <footer className="provenance">
        <p>
          Listed on <ExternalLink href={o.provenance.listingUrl}>AISafety.com</ExternalLink>
          {o.provenance.updatedOn ? `, last updated there ${formatDay(o.provenance.updatedOn)}` : ''}. Used under{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Spotted a mistake? Suggest a correction on AISafety.com.
        </p>
      </footer>
    </article>
  );
}
