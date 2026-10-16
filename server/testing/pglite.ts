import { readdir, readFile } from 'node:fs/promises';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import type { Db } from '../db.js';

/**
 * An in-memory Postgres for tests, with just enough of Supabase to run the real
 * migrations: the auth schema, auth.uid(), the anon and authenticated roles, and
 * Supabase's default grants on new public tables (which the migrations must undo).
 */

export const SUPABASE_SHIM = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  email_confirmed_at timestamptz default now(),
  created_at timestamptz not null default now()
);
create function auth.jwt() returns jsonb language sql stable
  as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

function wrap(pg: PGlite | Transaction, inTransaction: boolean): Db {
  const db: Db = {
    async query<T>(text: string, params: unknown[] = []) {
      return (await pg.query<T>(text, params)).rows;
    },
    async transaction<R>(fn: (tx: Db) => Promise<R>) {
      if (inTransaction) return fn(db);
      return (pg as PGlite).transaction((tx) => fn(wrap(tx, true)));
    },
    async close() {},
  };
  return db;
}

export interface TestDb extends Db {
  pg: PGlite;
  /** Adds a confirmed auth user and returns its ID. */
  createUser(email: string): Promise<string>;
  /** Runs queries as a signed-in user (or anonymously, with null), under row level security. */
  as<R>(userId: string | null, fn: (db: Db) => Promise<R>): Promise<R>;
}

async function migrated(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_SHIM);
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await pg.exec(await readFile(new URL(f, MIGRATIONS), 'utf8'));
  return pg;
}

let template: Promise<PGlite> | null = null;

/** A fresh, migrated database. Migrations run once per test file; each test gets a copy. */
export async function createTestDb(): Promise<TestDb> {
  template ??= migrated();
  const pg = (await (await template).clone()) as PGlite;

  const db = wrap(pg, false);
  return {
    ...db,
    pg,
    async createUser(email) {
      const rows = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email]);
      return rows[0]!.id;
    },
    async as(userId, fn) {
      return pg.transaction(async (tx) => {
        await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`);
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' })]);
        return fn(wrap(tx, true));
      });
    },
  };
}
