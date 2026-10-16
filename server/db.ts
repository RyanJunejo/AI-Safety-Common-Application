import postgres from 'postgres';

/**
 * The little the server needs from Postgres. Production connects with postgres.js
 * through Supabase's pooler; tests run the same SQL on PGlite.
 *
 * Conventions that keep both drivers alike: pass arrays and objects as JSON text and
 * cast through text in SQL (`$1::text::jsonb`; cast straight to jsonb, postgres.js
 * encodes the text a second time), and select `date` columns as `::text`.
 */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R>;
  close(): Promise<void>;
}

/** A timestamp from either driver, as an ISO string. */
export function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

export function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}

type Sql = postgres.Sql | postgres.TransactionSql;

function wrap(sql: Sql, root: postgres.Sql, inTransaction: boolean): Db {
  const db: Db = {
    async query<T>(text: string, params: unknown[] = []) {
      const rows = await sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
      return [...rows] as T[];
    },
    async transaction<R>(fn: (tx: Db) => Promise<R>) {
      // Already inside one: join it rather than wait for a second connection.
      if (inTransaction) return fn(db);
      return (await root.begin((tx) => fn(wrap(tx, root, true)))) as R;
    },
    async close() {
      await root.end({ timeout: 5 });
    },
  };
  return db;
}

/**
 * Connects with a DATABASE_URL. Use Supabase's transaction pooler (port 6543), which
 * doesn't support prepared statements, from serverless functions.
 */
export function connect(url: string): Db {
  const root = postgres(url, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 15 });
  return wrap(root, root, false);
}
