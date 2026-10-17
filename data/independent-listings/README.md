# Independently researched listings

Add opportunities here that are **not** already on AISafety.com. Each JSON file becomes a catalog listing on the next daily sync.

Do **not** put listings in `src/data/inventory/` (preparation notes) or `src/catalog/fixtures/` (test snapshots). Do **not** insert rows into Supabase by hand — edit files here and let the sync import them.

## Add a listing

1. Copy the shape below into a new file: `{id}.json` (id is a stable slug, lowercase, hyphens only).
2. Fill every required field. Prefer the organization’s official page as `officialUrl` / `url`.
3. Run `npm test` (schema, dedupe, and sync checks) before opening a PR.

An empty directory is valid: the sync simply imports no independent listings.

## File format

```json
{
  "id": "example-fellowship-winter-2027",
  "kind": "program",
  "format": "Fellowship",
  "title": "Example Fellowship: Winter 2027",
  "organization": "Example Institute",
  "summary": "One or two sentences for cards and emails.",
  "description": "Optional longer description for the detail page.",
  "url": "https://example.org/fellowship",
  "focus": ["technical"],
  "location": {
    "text": "London, UK",
    "countries": ["UK"],
    "remote": false,
    "remoteCountries": []
  },
  "status": "open",
  "deadline": "2027-01-15",
  "deadlineTimezone": "Europe/London",
  "startDate": "2027-02-01",
  "startText": null,
  "round": "Winter 2027",
  "sourceType": "official",
  "officialUrl": "https://example.org/fellowship",
  "xPostUrl": null,
  "xAccount": null,
  "xPostDate": null,
  "lastVerified": "2026-10-15",
  "facts": [{ "label": "Stipend", "value": "£3,000 / month" }],
  "tags": ["Entry bar: Mid"]
}
```

### Required

| Field | Meaning |
| --- | --- |
| `id` | Stable slug; becomes catalog id `independent-{id}` |
| `kind` | `program`, `course`, `job`, or `community` |
| `format` | Display subtype, e.g. Fellowship, Bootcamp, Full-time |
| `title` | Listing title |
| `organization` | Host organization (string, or `null` if unknown) |
| `summary` | Short card text |
| `url` | Apply / join / official link |
| `focus` | `technical`, `governance`, and/or `general` (empty for jobs/communities is fine) |
| `location` | `text`, `countries`, `remote`, `remoteCountries` |
| `status` | `open`, `upcoming`, `closed`, `recurring`, `ongoing`, or `unknown` |
| `sourceType` | `official`, `x-post`, or `both` |
| `officialUrl` | Organization’s page (credited on the site — not AISafety.com) |
| `lastVerified` | Date you last checked (`YYYY-MM-DD`) |

### Optional evidence

| Field | Meaning |
| --- | --- |
| `description` | Longer detail-page text |
| `deadline` | Application deadline date (`YYYY-MM-DD`) |
| `deadlineTimezone` | IANA timezone for that deadline, e.g. `America/Los_Angeles` |
| `startDate` / `startText` | Start date or approximate text |
| `round` | Cohort / round label (used for dedupe) |
| `xPostUrl` / `xAccount` / `xPostDate` | X (Twitter) announcement, when relevant |
| `facts` / `tags` | Extra detail-page facts and card tags |

## Rules the sync enforces

- **Survives AISafety syncs.** Independent rows are not removed merely because they are absent from the AISafety.com feed. Removing a file here *does* deactivate that listing on the next sync.
- **No silent duplicates.** The same URL + organization + title + cohort as another independent file, or as an AISafety.com listing, fails the sync (and tests) instead of creating a double.
- **Attribution.** Cards and detail pages credit `officialUrl` (and an X post when `sourceType` is `x-post` or `both`), not AISafety.com.
- **Shrink guard.** Independent listings are ignored by the AISafety.com “feed shrank sharply” check.

## Example data

Do not commit fabricated live listings. Use test fixtures only (see `src/catalog/independent/*.test.ts`).
