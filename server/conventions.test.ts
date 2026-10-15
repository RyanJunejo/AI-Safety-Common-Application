// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Production talks to Postgres through postgres.js, tests through PGlite. They differ
 * in one way that tests can't see: postgres.js JSON-encodes text sent to a `$1::jsonb`
 * parameter a second time. Casting through text (`$1::text::jsonb`) avoids it.
 */
describe('server SQL', () => {
  it('casts JSON parameters through text', () => {
    const dir = new URL('./', import.meta.url);
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .flatMap((f) => (readFileSync(new URL(f, dir), 'utf8').match(/\$\d+::jsonb?\b/g) ?? []).map((m) => `${f}: ${m}`));
    expect(offenders).toEqual([]);
  });
});
