import { liveStatus } from '../catalog/status';
import type { Opportunity } from '../catalog/types';
import { Loading, Notice, OpportunityCard } from '../components/ui';
import { useTitle } from '../components/useTitle';
import { Link } from '../router';
import { useAccount } from '../state/account';
import { useListings } from '../state/catalog';
import { useToday } from '../state/clock';

const RANK = { open: 0, upcoming: 1, ongoing: 2, recurring: 3, unknown: 4, closed: 5 } as const;

export function SavedView() {
  useTitle('Saved');
  const account = useAccount();
  const today = useToday();
  const ids = Object.keys(account.saved);
  const { found, loading } = useListings(ids);

  const listed: Opportunity[] = [];
  const gone: { id: string; title: string | null }[] = [];
  for (const id of ids) {
    const f = found.get(id);
    if (f?.active) listed.push(f.item);
    else if (!loading) gone.push({ id, title: f?.item.title ?? null });
  }
  listed.sort((a, b) => {
    const sa = liveStatus(a, today);
    const sb = liveStatus(b, today);
    return RANK[sa.state] - RANK[sb.state] || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.title.localeCompare(b.title);
  });

  return (
    <section className="saved" aria-labelledby="saved-title">
      <div className="page-head">
        <div>
          <h1 id="saved-title">Saved</h1>
          <p className="lede">Your list, soonest deadline first.</p>
        </div>
      </div>

      {account.backend === 'ready' && !account.session && (
        <Notice>
          Saved in this browser only. <Link href="/account">Sign in with your email</Link> to keep your list on any device and get reminders
          before deadlines.
        </Notice>
      )}
      {account.session && (
        <Notice tone="ok">
          Synced to {account.session.email}.{' '}
          {account.account?.alertsEnabled ? 'You’ll get reminders 7 and 2 days before each deadline.' : <Link href="/account">Turn on deadline reminders</Link>}
        </Notice>
      )}
      {account.error && <Notice tone="error">{account.error}</Notice>}

      {ids.length === 0 ? (
        <p className="empty">
          Nothing saved yet. Use <strong>Save</strong> on any listing to keep it here. <Link href="/explore">Explore opportunities</Link>.
        </p>
      ) : (
        <>
          {loading && listed.length === 0 && <Loading />}
          <ul className="opp-list">
            {listed.map((o) => (
              <OpportunityCard key={o.id} o={o} />
            ))}
          </ul>
          {gone.length > 0 && (
            <div className="gone">
              <h2>No longer listed</h2>
              <ul>
                {gone.map((g) => (
                  <li key={g.id}>
                    {g.title ?? 'A listing that was removed'}{' '}
                    <button type="button" className="link-btn" onClick={() => void account.toggleSave(g.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
