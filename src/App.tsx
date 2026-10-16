import { lazy, Suspense, useEffect } from 'react';
import { formatDay } from './catalog/dates';
import { KINDS, KIND_LABEL } from './catalog/types';
import { Loading, NotFound } from './components/ui';
import { legacyRedirect, Link, navigate, pathFor, useLocation } from './router';
import { SITE } from './site';
import { useAccount } from './state/account';
import { useCatalog } from './state/catalog';
import { AccountView } from './views/AccountView';
import { AuthConfirmView } from './views/AuthConfirmView';
import { ExploreView } from './views/ExploreView';
import { HomeView } from './views/HomeView';
import { OpportunityView } from './views/OpportunityView';
import { PrivacyView } from './views/PrivacyView';
import { SavedView } from './views/SavedView';

// Guides read the researched program records, which are large; load them on demand.
const GuidesView = lazy(() => import('./views/GuidesView'));

function Header() {
  const { route } = useLocation();
  const account = useAccount();
  const savedCount = Object.keys(account.saved).length;
  const current = (active: boolean) => (active ? { className: 'nav-link active', 'aria-current': 'page' as const } : { className: 'nav-link' });
  return (
    <header className="header">
      <div className="header-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            SA
          </span>
          {SITE.name}
          <span className="beta">Beta</span>
        </Link>
        <nav aria-label="Main" className="main-nav">
          {KINDS.map((kind) => (
            <Link key={kind} href={pathFor({ name: 'explore', kind })} {...current(route.name === 'explore' && route.kind === kind)}>
              {KIND_LABEL[kind].many}
            </Link>
          ))}
          <Link href="/guides" {...current(route.name === 'guides')}>
            Guides
          </Link>
        </nav>
        <div className="header-actions">
          <Link href="/saved" {...current(route.name === 'saved')}>
            Saved{savedCount ? ` (${savedCount})` : ''}
          </Link>
          {account.backend !== 'unavailable' && (
            <Link href="/account" {...current(route.name === 'account')}>
              {account.session ? 'Account' : 'Sign in'}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const catalog = useCatalog();
  const synced = catalog.status === 'ready' && catalog.syncedAt ? formatDay(catalog.syncedAt.slice(0, 10)) : null;
  return (
    <footer className="footer">
      <p>
        Listings come from <a href="https://aisafety.com">AISafety.com</a> and are used under{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Updated daily{synced ? `; last updated ${synced}` : ''}.
      </p>
      <nav aria-label="Footer">
        <Link href="/guides">Guides</Link>
        <Link href="/privacy">Privacy</Link>
        <a href={`mailto:${SITE.contactEmail}`}>Contact</a>
      </nav>
    </footer>
  );
}

function PreviewBanner() {
  const catalog = useCatalog();
  if (catalog.status !== 'ready' || !catalog.preview) return null;
  return (
    <div className="preview-bar" role="note">
      <strong>Preview.</strong> Showing a saved copy of the AISafety.com listings
      {catalog.syncedAt ? ` from ${formatDay(catalog.syncedAt.slice(0, 10))}` : ''}. Sign-in and email alerts are off.
    </div>
  );
}

export function App() {
  const { route, pathname, search } = useLocation();
  const query = search.toString();

  useEffect(() => {
    // Old Common App links used the URL hash; send them to the new pages.
    const legacy = legacyRedirect(window.location.hash);
    if (legacy) navigate(legacy, { replace: true });
    // A sign-in link that landed on the wrong page (for example, the site root).
    else if (route.name !== 'auth-confirm' && /(^|&)(token_hash|error_description)=/.test(query)) {
      navigate(`/auth/confirm?${query}`, { replace: true });
    }
  }, [route.name, query]);

  // An old link opened in a tab that already has the site loaded only changes the hash.
  useEffect(() => {
    const onHash = () => {
      const legacy = legacyRedirect(window.location.hash);
      if (legacy) navigate(legacy, { replace: true });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Each page opens at the top, like a normal page load. Filter changes keep their place.
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [pathname]);

  let view;
  switch (route.name) {
    case 'home':
      view = <HomeView />;
      break;
    case 'explore':
      view = <ExploreView kind={route.kind} />;
      break;
    case 'opportunity':
      view = <OpportunityView id={route.id} />;
      break;
    case 'saved':
      view = <SavedView />;
      break;
    case 'account':
      view = <AccountView />;
      break;
    case 'auth-confirm':
      view = <AuthConfirmView />;
      break;
    case 'guides':
      view = (
        <Suspense fallback={<Loading />}>
          <GuidesView />
        </Suspense>
      );
      break;
    case 'privacy':
      view = <PrivacyView />;
      break;
    default:
      view = <NotFound />;
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <PreviewBanner />
      <Header />
      <main id="main" className="main" tabIndex={-1}>
        {view}
      </main>
      <Footer />
    </>
  );
}
