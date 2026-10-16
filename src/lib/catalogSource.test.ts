import { describe, expect, it } from 'vitest';
import { keyHeaders, supabaseCatalog } from './catalogSource';

describe('reading the catalog from Supabase', () => {
  it('pages past PostgREST’s 1,000-row limit and reads the sync time', async () => {
    const urls: string[] = [];
    const rows = (n: number, from: number) => Array.from({ length: n }, (_, i) => ({ data: { id: `jobs-${from + i}` } }));
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      urls.push(String(url));
      expect(new Headers(init?.headers).get('apikey')).toBe('sb_publishable_abc');
      if (String(url).includes('/rpc/catalog_synced_at')) return Response.json('2026-10-09T08:00:05Z');
      return Response.json(String(url).includes('offset=0') ? rows(1000, 0) : rows(3, 1000));
    }) as typeof fetch;

    const source = supabaseCatalog({ url: 'https://p.supabase.co', anonKey: 'sb_publishable_abc' }, fakeFetch);
    const { items, syncedAt } = await source.list();
    expect(items).toHaveLength(1003);
    expect(syncedAt).toBe('2026-10-09T08:00:05Z');
    expect(urls[0]).toBe('https://p.supabase.co/rest/v1/catalog_items?select=data&active=is.true&order=id&limit=1000&offset=0');
  });

  it('sends publishable keys only as apikey, and legacy JWT keys as a bearer token too', () => {
    expect(keyHeaders('sb_publishable_abc')).toEqual({ apikey: 'sb_publishable_abc' });
    expect(keyHeaders('eyJhbGciOi.x.y')).toEqual({ apikey: 'eyJhbGciOi.x.y', authorization: 'Bearer eyJhbGciOi.x.y' });
  });
});
