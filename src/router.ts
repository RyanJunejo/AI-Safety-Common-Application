import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'programs' }
  | { name: 'map' }
  | { name: 'dossier' }
  | { name: 'sources' }
  | { name: 'program'; id: string };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'map':
      return { name: 'map' };
    case 'dossier':
      return { name: 'dossier' };
    case 'sources':
      return { name: 'sources' };
    case 'program':
      return parts[1] ? { name: 'program', id: decodeURIComponent(parts[1]) } : { name: 'programs' };
    default:
      return { name: 'programs' };
  }
}

export function href(route: Route): string {
  return route.name === 'program' ? `#/program/${encodeURIComponent(route.id)}` : `#/${route.name}`;
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseHash(hash);
}
