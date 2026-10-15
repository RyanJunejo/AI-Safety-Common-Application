import { useEffect, useState, type FormEvent } from 'react';
import { preferenceProblems, type AlertPreferences } from '../alerts/preferences';
import { COUNTRIES } from '../catalog/location';
import { FOCUSES, FOCUS_LABEL, KINDS, KIND_LABEL, type Focus, type Kind } from '../catalog/types';
import { Loading, Notice } from '../components/ui';
import { useTitle } from '../components/useTitle';
import { Link, navigate, opportunityPath, useLocation } from '../router';
import { useAccount } from '../state/account';
import { useCatalog } from '../state/catalog';

function SignIn({ followName }: { followName: string | null }) {
  const account = useAccount();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const savedCount = Object.keys(account.saved).length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState('sending');
    setError(null);
    try {
      await account.sendSignInLink(email);
      setState('sent');
    } catch (err) {
      setState('idle');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="narrow" aria-labelledby="signin-title">
      <h1 id="signin-title">Sign in</h1>
      {followName && <Notice>Sign in to follow {followName}. Once you turn on alerts, we’ll email you when a new round opens.</Notice>}
      {state === 'sent' ? (
        <Notice tone="ok">
          <strong>Check your inbox.</strong> We sent a sign-in link to {email}. It works once, for an hour. Open it in this browser to bring
          your saved list with you.
        </Notice>
      ) : (
        <>
          <p>We’ll email you a link to sign in. There’s no password.</p>
          <ul className="plain-list">
            <li>
              {savedCount
                ? `The ${savedCount === 1 ? 'listing' : `${savedCount} listings`} saved in this browser move to your account, so your list is on every device.`
                : 'Your saved list is kept in your account, so it’s on every device.'}
            </li>
            <li>Email alerts are separate. You choose whether to turn them on after you sign in.</li>
          </ul>
          <form className="signin-form" onSubmit={submit}>
            <label className="field">
              <span className="field-label">Email</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary" disabled={state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>
          {error && <Notice tone="error">{error}</Notice>}
        </>
      )}
      <p className="small muted">
        We store your email, your alert choices, and the IDs of listings you save or follow. Nothing else. <Link href="/privacy">Privacy</Link>
      </p>
    </section>
  );
}

function Alerts() {
  const account = useAccount();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = account.account?.alertsEnabled ?? false;
  const email = account.session?.email ?? '';

  const set = async (value: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await account.setAlerts(value);
      setConsent(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="alerts-title" data-testid="alerts">
      <h2 id="alerts-title">Email alerts</h2>
      {on ? (
        <>
          <p>
            <strong>Alerts are on</strong> for {email}. Every email has a one-click unsubscribe link.
          </p>
          <button type="button" className="btn" disabled={busy} onClick={() => void set(false)}>
            Turn off alerts
          </button>
        </>
      ) : (
        <>
          <p>Alerts are off. If you turn them on, you’ll get:</p>
          <ul className="plain-list">
            <li>A Monday digest of new listings that match your choices below</li>
            <li>An email the same day when a new match closes before the next digest</li>
            <li>Reminders 7 and 2 days before deadlines on your saved list</li>
            <li>An email when a program you follow opens a new round</li>
          </ul>
          <label className="check-row consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            Email these alerts to {email}. I can unsubscribe anytime.
          </label>
          <button type="button" className="btn btn-primary" disabled={!consent || busy} onClick={() => void set(true)}>
            Turn on alerts
          </button>
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}

function Preferences({ initial }: { initial: AlertPreferences }) {
  const account = useAccount();
  const [prefs, setPrefs] = useState(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const problems = preferenceProblems(prefs);
  const loc = prefs.location;
  useEffect(() => setPrefs(initial), [initial]);

  const toggle = <T,>(list: T[], value: T, on: boolean) => (on ? [...new Set([...list, value])] : list.filter((x) => x !== value));
  const change = (next: AlertPreferences) => {
    setPrefs(next);
    setStatus('idle');
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (problems.length) return;
    setStatus('saving');
    setError(null);
    try {
      await account.savePreferences(prefs);
      setStatus('saved');
    } catch (err) {
      setStatus('idle');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="panel" aria-labelledby="prefs-title">
      <h2 id="prefs-title">What to alert you about</h2>
      <form onSubmit={save} className="prefs">
        <fieldset className="filter-group">
          <legend className="field-label">Types</legend>
          {KINDS.map((k: Kind) => (
            <label key={k} className="check-row">
              <input type="checkbox" checked={prefs.kinds.includes(k)} onChange={(e) => change({ ...prefs, kinds: toggle(prefs.kinds, k, e.target.checked) })} />
              {KIND_LABEL[k].many}
            </label>
          ))}
        </fieldset>

        <fieldset className="filter-group">
          <legend className="field-label">Focus</legend>
          {FOCUSES.map((f: Focus) => (
            <label key={f} className="check-row">
              <input type="checkbox" checked={prefs.focus.includes(f)} onChange={(e) => change({ ...prefs, focus: toggle(prefs.focus, f, e.target.checked) })} />
              {FOCUS_LABEL[f]}
            </label>
          ))}
          <p className="field-hint">
            Focus applies to programs and courses. Jobs and communities aren’t tagged by focus in the source data, so this filter doesn’t
            apply to them: you’ll hear about every new one that matches your types and location.
          </p>
        </fieldset>

        <fieldset className="filter-group">
          <legend className="field-label">Location</legend>
          <label className="check-row">
            <input type="radio" name="where" checked={loc.anyLocation} onChange={() => change({ ...prefs, location: { ...loc, anyLocation: true } })} />
            Any location
          </label>
          <label className="check-row">
            <input type="radio" name="where" checked={!loc.anyLocation} onChange={() => change({ ...prefs, location: { ...loc, anyLocation: false } })} />
            Only places that suit me
          </label>
          {!loc.anyLocation && (
            <div className="where">
              <label className="field">
                <span className="field-label">Countries I can be in</span>
                <select
                  value=""
                  onChange={(e) => e.target.value && change({ ...prefs, location: { ...loc, countries: toggle(loc.countries, e.target.value, true) } })}
                >
                  <option value="">Add a country…</option>
                  {COUNTRIES.filter((c) => !loc.countries.includes(c)).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              {loc.countries.length > 0 && (
                <ul className="chips" aria-label="Chosen countries">
                  {loc.countries.map((c) => (
                    <li key={c}>
                      {c}{' '}
                      <button
                        type="button"
                        className="chip-remove"
                        aria-label={`Remove ${c}`}
                        onClick={() => change({ ...prefs, location: { ...loc, countries: toggle(loc.countries, c, false) } })}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="check-row">
                <input type="checkbox" checked={loc.remote} onChange={(e) => change({ ...prefs, location: { ...loc, remote: e.target.checked } })} />
                Remote or online
              </label>
            </div>
          )}
          <p className="field-hint">Some listings don’t say where they are. Those are included only with “Any location”.</p>
        </fieldset>

        {problems.length > 0 && (
          <ul className="problems" role="alert">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <div className="form-foot">
          <button type="submit" className="btn btn-primary" disabled={problems.length > 0 || status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save preferences'}
          </button>
          {status === 'saved' && <span className="saved-note" role="status">Preferences saved</span>}
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </section>
  );
}

function Follows() {
  const account = useAccount();
  const catalog = useCatalog();
  return (
    <section className="panel" aria-labelledby="follows-title">
      <h2 id="follows-title">Programs you follow</h2>
      {account.follows.length === 0 ? (
        <p className="muted">
          None yet. On a recurring program’s page, choose <strong>Follow</strong> to hear when each new round opens.
        </p>
      ) : (
        <ul className="follow-list">
          {account.follows.map((id) => {
            const title = catalog.status === 'ready' ? (catalog.byId.get(id)?.title ?? 'A program no longer listed') : '…';
            return (
              <li key={id}>
                <Link href={opportunityPath(id)}>{title}</Link>
                <button type="button" className="link-btn" onClick={() => void account.unfollow(id)}>
                  Unfollow
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function DeleteAccount() {
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    if (!window.confirm('Delete your account? This removes your email, alert choices, saved list, and followed programs, and can’t be undone.')) return;
    setBusy(true);
    setError(null);
    try {
      await account.deleteAccount();
      navigate('/?deleted=1', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  return (
    <section className="panel danger" aria-labelledby="delete-title">
      <h2 id="delete-title">Delete your account</h2>
      <p>This deletes your email address, alert choices, saved list, and followed programs. It can’t be undone.</p>
      <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void remove()}>
        Delete my account
      </button>
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}

export function AccountView() {
  useTitle('Account');
  const account = useAccount();
  const catalog = useCatalog();
  const { search } = useLocation();
  const followId = search.get('follow');
  const followName = followId && catalog.status === 'ready' ? (catalog.byId.get(followId)?.title ?? null) : null;

  if (account.backend === 'loading') return <Loading />;
  if (account.backend === 'unavailable') {
    return (
      <section className="narrow">
        <h1>Account</h1>
        <p>Sign-in and email alerts aren’t available in this preview. Your saved list is kept in this browser.</p>
      </section>
    );
  }
  if (!account.session) return <SignIn followName={followName} />;

  const savedCount = Object.keys(account.saved).length;
  return (
    <div className="account" aria-labelledby="account-title">
      <div className="page-head">
        <div>
          <h1 id="account-title">Your account</h1>
          <p className="lede">
            Signed in as {account.session.email}.{' '}
            <button type="button" className="link-btn" onClick={() => void account.signOut().then(() => navigate('/'))}>
              Sign out
            </button>
          </p>
        </div>
      </div>
      {search.get('welcome') && !account.syncing && (
        <Notice tone="ok">
          You’re signed in. {savedCount ? `Your saved list (${savedCount}) is synced.` : 'Anything you save now is kept in your account.'}
        </Notice>
      )}
      {account.error && <Notice tone="error">{account.error}</Notice>}
      {account.syncing || !account.account ? (
        <Loading label="Loading your account…" />
      ) : (
        <div className="account-grid">
          <Alerts />
          <Preferences initial={account.account.preferences} />
          <Follows />
          <DeleteAccount />
        </div>
      )}
    </div>
  );
}
