// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { connectionOptions } from './db.js';

describe('database connection options', () => {
  it('uses TLS for hosted databases and drops parameters postgres.js would forward', () => {
    expect(connectionOptions('postgres://postgres.abc:pw@aws-1-us-west-2.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x')).toEqual({
      url: 'postgres://postgres.abc:pw@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
      ssl: 'require',
    });
    // Even when the URL doesn't ask for it, or asks to turn it off.
    expect(connectionOptions('postgresql://u:p@db.example.com/postgres?sslmode=disable').ssl).toBe('require');
  });

  it('allows plain connections to a local database', () => {
    expect(connectionOptions('postgres://postgres:pw@localhost:55432/postgres')).toEqual({ url: 'postgres://postgres:pw@localhost:55432/postgres', ssl: false });
    expect(connectionOptions('postgres://postgres:pw@127.0.0.1:5432/postgres?sslmode=require').ssl).toBe('require');
  });
});
