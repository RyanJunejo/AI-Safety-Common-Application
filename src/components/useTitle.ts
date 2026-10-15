import { useEffect } from 'react';
import { SITE } from '../site';

/** Sets the browser tab title for a page. */
export function useTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE.name}` : `${SITE.name}: find your next step in AI safety`;
  }, [title]);
}
