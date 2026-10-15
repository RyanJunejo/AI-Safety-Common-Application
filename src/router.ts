import { createElement, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import type { Kind } from './catalog/types';
import { PREP_NOTES_BY_FAMILY } from './site';

export type Route =
  | { name: 'home' }
  | { name: 'explore'; kind: Kind | null }
  | { name: 'opportunity'; id: string }
  | { name: 'saved' }
  | { name: 'account' }
  | { name: 'auth-confirm' }
  | { name: 'guides' }
  | { name: 'privacy' }
  | { name: 'not-found' };

export const KIND_PATH: Record<Kind, string> = { program: 'programs', course: 'courses', job: 'jobs', community: 'communities' };
const KIND_BY_PATH = Object.fromEntries(Object.entries(KIND_PATH).map(([k, p]) => [p, k as Kind]));

export function parsePath(pathname: string): Route {
  const [first, second, ...rest] = pathname.split('/').filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  if (rest.length) return { name: 'not-found' };
  if (!first) return { name: 'home' };
  if (first === 'explore' && !second) return { name: 'explore', kind: null };
  if (KIND_BY_PATH[first] && !second) return { name: 'explore', kind: KIND_BY_PATH[first]! };
  if (first === 'opportunities' && second) return { name: 'opportunity', id: second };
  if (first === 'auth' && second === 'confirm') return { name: 'auth-confirm' };
  if (second) return { name: 'not-found' };
  switch (first) {
    case 'saved':
    case 'account':
    case 'guides':
    case 'privacy':
      return { name: first };
    default:
      return { name: 'not-found' };
  }
}

export function pathFor(route: Route): string {
  switch (route.name) {
    case 'home':
      return '/';
    case 'explore':
      return route.kind ? `/${KIND_PATH[route.kind]}` : '/explore';
    case 'opportunity':
      return `/opportunities/${encodeURIComponent(route.id)}`;
    case 'auth-confirm':
      return '/auth/confirm';
    case 'not-found':
      return '/';
    default:
      return `/${route.name}`;
  }
}

export const opportunityPath = (id: string) => pathFor({ name: 'opportunity', id });

/** Inventory ID → family. Where two families share notes, the first listed wins. */
const FAMILY_BY_INVENTORY = Object.fromEntries(Object.entries(PREP_NOTES_BY_FAMILY).reverse().map(([family, inv]) => [inv, family]));

/**
 * Where an old Common App link (`#/programs/mats`, `#/resources`, …) should go now.
 * Returns null for URLs without an old-style hash.
 */
export function legacyRedirect(hash: string): string | null {
  if (!hash.startsWith('#/')) return null;
  const [page, param] = hash.slice(2).split('/').filter(Boolean);
  if (page === 'programs') {
    const family = param ? FAMILY_BY_INVENTORY[decodeURIComponent(param)] : undefined;
    return family ? opportunityPath(family) : '/programs';
  }
  if (page === 'resources') return '/guides';
  return '/';
}

const NAVIGATE = 'safetyapps:navigate';

export function navigate(to: string, { replace = false }: { replace?: boolean } = {}): void {
  if (replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  window.dispatchEvent(new Event(NAVIGATE));
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATE, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATE, onChange);
  };
}

const snapshot = () => window.location.pathname + window.location.search;

export interface Location {
  pathname: string;
  search: URLSearchParams;
  route: Route;
}

export function useLocation(): Location {
  const url = useSyncExternalStore(subscribe, snapshot);
  const [pathname = '/', query = ''] = url.split('?');
  return { pathname, search: new URLSearchParams(query), route: parsePath(pathname) };
}

/** An in-app link: navigates without a page load, unless opened in a new tab or window. */
export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target) return;
    e.preventDefault();
    navigate(href);
  };
  return createElement('a', { href, onClick: handle, ...rest });
}
