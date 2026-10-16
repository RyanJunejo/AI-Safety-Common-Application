import { z } from 'zod';
import type { Feeds } from '../src/catalog/catalog.js';
import { SOURCE_API } from '../src/catalog/normalize.js';
import { COLLECTIONS, type Collection } from '../src/catalog/types.js';

/** Fetches the AISafety.com Data API collections SafetyApps imports. */

const Envelope = z.object({
  data: z.array(z.unknown()),
  meta: z.looseObject({ count: z.number().int().nonnegative().optional(), generatedAt: z.string().optional() }),
});

export class SourceError extends Error {
  constructor(
    readonly collection: Collection,
    message: string,
    /** False for errors that another attempt won't fix, like a 404. */
    readonly retryable = true,
  ) {
    super(`${collection}: ${message}`);
    this.name = 'SourceError';
  }
}

export interface FetchOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  attempts?: number;
  /** Waits between attempts; tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fetchCollection(collection: Collection, o: Required<FetchOptions>): Promise<unknown[]> {
  let last: unknown;
  for (let attempt = 1; attempt <= o.attempts; attempt++) {
    try {
      const res = await o.fetch(`${o.baseUrl.replace(/\/$/, '')}/${collection}`, {
        headers: { accept: 'application/json', 'user-agent': 'SafetyApps catalog sync (+https://safetyapps.org)' },
        signal: AbortSignal.timeout(o.timeoutMs),
      });
      if (!res.ok) throw new SourceError(collection, `HTTP ${res.status}`, res.status >= 500 || res.status === 429);
      const parsed = Envelope.safeParse(await res.json());
      if (!parsed.success) throw new SourceError(collection, 'unexpected response shape');
      const { data, meta } = parsed.data;
      if (meta.count !== undefined && meta.count !== data.length) {
        throw new SourceError(collection, `incomplete response: ${data.length} of ${meta.count} records`);
      }
      return data;
    } catch (err) {
      last = err;
      if (err instanceof SourceError && !err.retryable) break;
      if (attempt < o.attempts) await o.sleep(1000 * 2 ** (attempt - 1));
    }
  }
  if (last instanceof SourceError) throw last;
  throw new SourceError(collection, last instanceof Error ? last.message : String(last));
}

/** All collections, or an error naming the first that failed. Partial feeds are never returned. */
export async function fetchFeeds(options: FetchOptions = {}): Promise<Feeds> {
  const o: Required<FetchOptions> = {
    baseUrl: options.baseUrl ?? SOURCE_API,
    fetch: options.fetch ?? fetch,
    timeoutMs: options.timeoutMs ?? 30_000,
    attempts: options.attempts ?? 3,
    sleep: options.sleep ?? wait,
  };
  const entries = await Promise.all(COLLECTIONS.map(async (c) => [c, await fetchCollection(c, o)] as const));
  return Object.fromEntries(entries) as unknown as Feeds;
}
