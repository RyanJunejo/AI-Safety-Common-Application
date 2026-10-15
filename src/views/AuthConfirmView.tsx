import { useEffect, useState } from 'react';
import { Loading, Notice } from '../components/ui';
import { useTitle } from '../components/useTitle';
import { Link, navigate, useLocation } from '../router';
import { useAccount } from '../state/account';

/** Where the email sign-in link lands. Signs in, syncs the saved list, then opens the account page. */
export function AuthConfirmView() {
  useTitle('Signing in');
  const { search } = useLocation();
  const account = useAccount();
  const [error, setError] = useState<string | null>(null);
  const query = search.toString();

  useEffect(() => {
    if (account.backend === 'loading') return;
    if (account.backend === 'unavailable') {
      setError('Sign-in isn’t available on this site.');
      return;
    }
    account
      .completeSignIn(new URLSearchParams(query))
      .then(() => navigate('/account?welcome=1', { replace: true }))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    // Runs once the backend is ready. completeSignIn is idempotent per link, so a repeat run is harmless.
  }, [account.backend, query]);

  if (error) {
    return (
      <section className="narrow">
        <h1>That sign-in link didn’t work</h1>
        <Notice tone="error">{error}</Notice>
        <p>
          Links work once and expire after an hour. Open the newest link, in the browser where you asked for it, or{' '}
          <Link href="/account">get a new link</Link>.
        </p>
      </section>
    );
  }
  return <Loading label="Signing you in…" />;
}
