import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Opportunity } from '../catalog/types';
import { defaultCatalogSource, type CatalogSource } from '../lib/catalogSource';

export type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; error: string; retry: () => void }
  | {
      status: 'ready';
      items: Opportunity[];
      byId: ReadonlyMap<string, Opportunity>;
      syncedAt: string | null;
      preview: boolean;
      source: CatalogSource;
    };

const CatalogContext = createContext<CatalogState>({ status: 'loading' });

/** Loads the catalog once per visit. Tests pass their own source. */
export function CatalogProvider({ source, children }: { source?: CatalogSource | Promise<CatalogSource>; children: ReactNode }) {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const src = await (source ?? defaultCatalogSource());
        const { items, syncedAt } = await src.list();
        if (cancelled) return;
        setState({ status: 'ready', items, byId: new Map(items.map((i) => [i.id, i])), syncedAt, preview: src.preview, source: src });
      } catch (err) {
        if (cancelled) return;
        setState({ status: 'error', error: err instanceof Error ? err.message : String(err), retry: () => setAttempt((n) => n + 1) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, attempt]);

  return <CatalogContext.Provider value={state}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogState {
  return useContext(CatalogContext);
}

/** Listings by ID that may have left the catalog, such as old saves. */
export function useListings(ids: string[]): { found: Map<string, { item: Opportunity; active: boolean }>; loading: boolean } {
  const catalog = useCatalog();
  const [extra, setExtra] = useState<Map<string, { item: Opportunity; active: boolean }>>(new Map());
  const [loading, setLoading] = useState(false);
  const key = ids.join(',');
  const missing = useMemo(() => (catalog.status === 'ready' ? ids.filter((id) => !catalog.byId.has(id)) : []), [catalog, key]);

  useEffect(() => {
    if (catalog.status !== 'ready' || missing.length === 0) return;
    let cancelled = false;
    setLoading(true);
    catalog.source
      .byIds(missing)
      .then((rows) => {
        if (!cancelled) setExtra(new Map(rows.map((r) => [r.item.id, r])));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalog, missing]);

  const found = new Map<string, { item: Opportunity; active: boolean }>();
  if (catalog.status === 'ready') {
    for (const id of ids) {
      const item = catalog.byId.get(id);
      if (item) found.set(id, { item, active: true });
      else if (extra.has(id)) found.set(id, extra.get(id)!);
    }
  }
  return { found, loading: catalog.status === 'loading' || loading };
}
