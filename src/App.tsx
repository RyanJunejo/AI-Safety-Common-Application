import { href, useRoute, type Route } from './router';
import { useNow } from './state/clock';
import { useWorkspace } from './state/store';
import { checklistMarkdown, downloadText } from './domain/export';
import { ProgramsView } from './views/ProgramsView';
import { QuestionMapView } from './views/QuestionMapView';
import { DossierView } from './views/DossierView';
import { ProgramView } from './views/ProgramView';
import { SourcesView } from './views/SourcesView';

const NAV: { route: Route; label: string }[] = [
  { route: { name: 'programs' }, label: 'Compare programs' },
  { route: { name: 'map' }, label: 'Question map' },
  { route: { name: 'dossier' }, label: 'Dossier' },
  { route: { name: 'sources' }, label: 'Sources' },
];

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

export function App() {
  const route = useRoute();
  const { ws, dispatch, savedAt } = useWorkspace();
  const now = useNow();

  const exportAll = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`application-checklist-${stamp}.md`, checklistMarkdown(ws, now));
  };

  const reset = () => {
    if (window.confirm('Replace everything in this browser with the sample researcher? Your edits will be lost.')) {
      dispatch({ type: 'workspace/reset' });
    }
  };

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-inner">
          <a className="wordmark" href={href({ name: 'programs' })}>
            <span className="wordmark-mark" aria-hidden="true" />
            <span>
              Fellowship Application Workspace
              <small>AI safety research programs</small>
            </span>
          </a>
          <div className="masthead-actions">
            <span className="save-state" data-testid="save-state" aria-live="polite">
              {savedAt ? `Saved in this browser · ${timeFmt.format(new Date(savedAt))}` : 'Sample data · edits save in this browser'}
            </span>
            <button type="button" className="btn btn-quiet" onClick={reset}>
              Reset sample
            </button>
            <button type="button" className="btn btn-primary" onClick={exportAll}>
              Export checklist
            </button>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {NAV.map(({ route: r, label }) => {
            const active = r.name === route.name || (r.name === 'programs' && route.name === 'program');
            return (
              <a key={r.name} href={href(r)} className={active ? 'tab active' : 'tab'} aria-current={active ? 'page' : undefined}>
                {label}
              </a>
            );
          })}
        </nav>
      </header>

      <main className="page">
        {route.name === 'programs' && <ProgramsView />}
        {route.name === 'map' && <QuestionMapView />}
        {route.name === 'dossier' && <DossierView />}
        {route.name === 'sources' && <SourcesView />}
        {route.name === 'program' && <ProgramView id={route.id} />}
      </main>

      <footer className="footer">
        <p>
          A preparation tool. It never submits to fellowship forms and has no server: everything you type stays in this browser’s
          local storage. The researcher shown is fictional.
        </p>
      </footer>
    </div>
  );
}
