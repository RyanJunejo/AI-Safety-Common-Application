import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'dashboard' }
  | { name: 'programs' }
  | { name: 'program'; id: string }
  | { name: 'application'; section?: string }
  | { name: 'recommenders' }
  | { name: 'resources' }
  | { name: 'inbox'; programId?: string };

export function parseHash(hash: string): Route {
  const [page, param] = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  switch (page) {
    case 'programs':
      return param ? { name: 'program', id: param } : { name: 'programs' };
    case 'application':
      return { name: 'application', section: param };
    case 'recommenders':
      return { name: 'recommenders' };
    case 'resources':
      return { name: 'resources' };
    case 'for-programs':
      return { name: 'inbox', programId: param };
    default:
      return { name: 'dashboard' };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'dashboard':
      return '#/';
    case 'program':
      return `#/programs/${encodeURIComponent(route.id)}`;
    case 'application':
      return route.section ? `#/application/${route.section}` : '#/application';
    case 'inbox':
      return route.programId ? `#/for-programs/${encodeURIComponent(route.programId)}` : '#/for-programs';
    default:
      return `#/${route.name}`;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  return parseHash(useSyncExternalStore(subscribe, () => window.location.hash));
}
