import type { Opportunity } from '../catalog/types';

/** Where the browser reads the catalog from. */
export interface CatalogSource {
  /** True when showing the bundled snapshot instead of the live catalog. */
  preview: boolean;
  /** Every listing currently in the catalog, and when it was last synced. */
  list(): Promise<{ items: Opportunity[]; syncedAt: string | null }>;
  /** Listings by ID, including ones no longer in the feed (for saved lists). */
  byIds(ids: string[]): Promise<{ item: Opportunity; active: boolean }[]>;
  /** A listing's long description. */
  description(id: string): Promise<string | null>;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** Reads the public Supabase settings. Prefers a publishable key; a legacy anon key also works. */
export function supabaseConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
  return url && anonKey ? { url: url.replace(/\/$/, ''), anonKey } : null;
}

/**
 * Headers for a Supabase API key. Publishable keys aren't JWTs and go only in `apikey`;
 * legacy anon keys are JWTs and also go in `Authorization`.
 */
export function keyHeaders(key: string): Record<string, string> {
  return key.startsWith('eyJ') ? { apikey: key, authorization: `Bearer ${key}` } : { apikey: key };
}

/** PostgREST returns at most 1,000 rows per request by default. */
const PAGE = 1000;

/** Reads the public catalog table through Supabase's REST API, without loading the client library. */
export function supabaseCatalog(config: SupabaseConfig, doFetch: typeof fetch = fetch.bind(globalThis)): CatalogSource {
  const headers = keyHeaders(config.anonKey);
  async function get<T>(path: string): Promise<T> {
    const res = await doFetch(`${config.url}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(`Catalog request failed (${res.status})`);
    return (await res.json()) as T;
  }
  return {
    preview: false,
    async list() {
      const items: Opportunity[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const rows = await get<{ data: Opportunity }[]>(`catalog_items?select=data&active=is.true&order=id&limit=${PAGE}&offset=${offset}`);
        items.push(...rows.map((r) => r.data));
        if (rows.length < PAGE) break;
      }
      const res = await doFetch(`${config.url}/rest/v1/rpc/catalog_synced_at`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}' });
      const syncedAt = res.ok ? ((await res.json()) as string | null) : null;
      return { items, syncedAt };
    },
    async byIds(ids) {
      if (ids.length === 0) return [];
      const list = ids.map((id) => `"${id.replace(/"/g, '')}"`).join(',');
      const rows = await get<{ data: Opportunity; active: boolean }[]>(`catalog_items?select=data,active&id=in.(${encodeURIComponent(list)})`);
      return rows.map((r) => ({ item: r.data, active: r.active }));
    },
    async description(id) {
      const rows = await get<{ description: string | null }[]>(`catalog_items?select=description&id=eq.${encodeURIComponent(id)}`);
      return rows[0]?.description ?? null;
    },
  };
}

/** The bundled AISafety.com snapshot, for local development and previews without Supabase. */
export async function snapshotCatalog(): Promise<CatalogSource> {
  const [{ SNAPSHOT_DAY, SNAPSHOT_FEEDS }, { buildCatalog }] = await Promise.all([import('../catalog/fixtures'), import('../catalog/catalog')]);
  const { items } = buildCatalog(SNAPSHOT_FEEDS);
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    preview: true,
    async list() {
      return { items: items.map(({ description: _d, ...rest }) => rest), syncedAt: `${SNAPSHOT_DAY}T08:00:00.000Z` };
    },
    async byIds(ids) {
      return ids.flatMap((id) => {
        const item = byId.get(id);
        return item ? [{ item, active: true }] : [];
      });
    },
    async description(id) {
      return byId.get(id)?.description ?? null;
    },
  };
}

export async function defaultCatalogSource(): Promise<CatalogSource> {
  const config = supabaseConfig();
  return config ? supabaseCatalog(config) : snapshotCatalog();
}
