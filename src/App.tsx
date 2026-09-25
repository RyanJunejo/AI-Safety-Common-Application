import { useEffect } from 'react';
import { href, useRoute, type Route } from './router';
import { EMPTY_STATE } from './state/app';
import { sampleState } from './state/sample';
import { useStore } from './state/store';
import { Dashboard } from './views/Dashboard';
import { ProgramsView } from './views/ProgramsView';
import { ProgramView } from './views/ProgramView';
import { ApplicationView } from './views/ApplicationView';
import { RecommendersView } from './views/RecommendersView';
import { ResourcesView } from './views/ResourcesView';
import { InboxView } from './views/InboxView';

const NAV: { route: Route; label: string; match: Route['name'][] }[] = [
  { route: { name: 'dashboard' }, label: 'Dashboard', match: ['dashboard'] },
  { route: { name: 'programs' }, label: 'Programs', match: ['programs', 'program'] },
  { route: { name: 'application' }, label: 'My application', match: ['application'] },
  { route: { name: 'recommenders' }, label: 'Recommenders', match: ['recommenders'] },
  { route: { name: 'resources' }, label: 'Resources', match: ['resources'] },
];

export function App() {
  const route = useRoute();
  const { dispatch } = useStore();
  const page = JSON.stringify(route);

  // Each page opens at the top, like a normal page load.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  const loadSample = () => {
    dispatch({ type: 'load', state: sampleState() });
    window.location.hash = href({ name: 'dashboard' });
  };
  const startOver = () => {
    if (window.confirm('Clear everything in this browser and start over?')) dispatch({ type: 'load', state: EMPTY_STATE });
  };

  return (
    <>
      <div className="demo-bar" role="note">
        <span>
          <strong>Prototype.</strong> Nothing is sent to any program; your answers stay in this browser.
        </span>
        <span className="demo-actions">
          <button type="button" className="link-btn" onClick={loadSample}>
            Load sample applicant
          </button>
          <button type="button" className="link-btn" onClick={startOver}>
            Start over
          </button>
        </span>
      </div>

      <header className="header">
        <div className="header-inner">
          <a href={href({ name: 'dashboard' })} className="brand">
            <span className="brand-mark" aria-hidden="true">
              AI
            </span>
            AI Safety Common App
          </a>
          <nav aria-label="Main">
            {NAV.map((n) => {
              const active = n.match.includes(route.name);
              return (
                <a key={n.label} href={href(n.route)} className={active ? 'nav-link active' : 'nav-link'} aria-current={active ? 'page' : undefined}>
                  {n.label}
                </a>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="main">
        {route.name === 'dashboard' && <Dashboard />}
        {route.name === 'programs' && <ProgramsView />}
        {route.name === 'program' && <ProgramView id={route.id} />}
        {route.name === 'application' && <ApplicationView section={route.section} />}
        {route.name === 'recommenders' && <RecommendersView />}
        {route.name === 'resources' && <ResourcesView />}
        {route.name === 'inbox' && <InboxView programId={route.programId} />}
      </main>

      <footer className="footer">
        <span>One application for AI safety fellowships. Program details checked Sep 25, 2026 against each program’s official pages.</span>
        <a href={href({ name: 'inbox' })}>For programs: see what you’d receive →</a>
      </footer>
    </>
  );
}
