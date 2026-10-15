// Saves a trimmed snapshot of the AISafety.com Data API for tests and the offline preview.
// Usage: node scripts/snapshot-aisafety.mjs [YYYY-MM-DD]
// Data: AISafety.com, CC BY 4.0 (https://aisafety.com/developers).
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = 'https://aisafety.com/api/v1';
const COLLECTIONS = ['training', 'courses', 'jobs', 'communities'];
/** Jobs are the bulk of the feed; the snapshot keeps the newest ones. */
const MAX_JOBS = 120;
const MAX_TEXT = 600;

const day = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const dir = new URL(`../src/catalog/fixtures/aisafety-${day}/`, import.meta.url);
await mkdir(dir, { recursive: true });

const trim = (s) => (typeof s === 'string' && s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT).trimEnd()}…` : s);

for (const name of COLLECTIONS) {
  const res = await fetch(`${BASE}/${name}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const body = await res.json();
  let data = body.data.map((r) => ({ ...r, description: trim(r.description) }));
  if (name === 'jobs') {
    data = data.sort((a, b) => (b.datePublished ?? '').localeCompare(a.datePublished ?? '') || a.id.localeCompare(b.id)).slice(0, MAX_JOBS);
  }
  const out = { data, meta: { ...body.meta, count: data.length } };
  // One record per line keeps the file compact and its diffs readable.
  const lines = out.data.map((r) => JSON.stringify(r)).join(',\n');
  await writeFile(new URL(`${name}.json`, dir), `{"data":[\n${lines}\n],\n"meta":${JSON.stringify(out.meta)}}\n`);
  console.log(`${name}: ${data.length} of ${body.data.length} records`);
}
