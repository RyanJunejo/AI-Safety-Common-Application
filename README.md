# SafetyApps

Find your next step in AI safety: fellowships and other programs, courses, jobs, and communities, in one place and updated daily.

Anyone can browse and save listings right away. Signing in by email keeps the saved list on every device, and, only if the person turns them on, sends alerts: a Monday digest of new matches, reminders before saved deadlines, and an email when a followed program opens a new round.

Listings come from [AISafety.com](https://aisafety.com)'s public [Data API](https://aisafety.com/developers), used under CC BY 4.0, and from independently researched official sources in `data/independent-listings/`. Each listing credits its actual source (AISafety.com or the organization's page).

## How it works

```
AISafety.com API ──┐
                   ├──08:00 UTC──▶ /api/cron/sync ──▶ Supabase: public catalog + change events
data/independent-listings/*.json ──┘                         │
                         the site reads the catalog ◀────────┤
                                                             ▼
                                09:00 UTC  /api/cron/alerts ──▶ outbox ──▶ Resend ──▶ inbox
                         11:00, 15:00 UTC  /api/cron/deliver ──┘ (retries only)
```

- **Catalog.** A daily sync fetches the training, courses, jobs, and communities collections, merges independently researched listings from `data/independent-listings/`, normalizes them (`src/catalog/normalize.ts` and `src/catalog/independent/`), and records what changed: new listings, rounds that opened, deadline changes, and removals. The first import is a baseline and sends no alerts. If any AISafety.com collection fails, looks truncated, or can't be read, or if an independent listing duplicates another row (same URL, organization, title, and cohort), the run fails and the catalog is left as it was. Independent listings are not removed merely because they are absent from the AISafety.com feed.
- **Recurring programs.** Recurring training records are program *families*; dated records are *cohorts*. Reviewed rules in `src/catalog/familyRules.ts` link each cohort to its family. A cohort that only looks related (same website, or more than one possible family) is queued for a person to review, and followers aren't emailed about it until then.
- **Saving and accounts.** Saves live in the browser until sign-in. Sign-in is a Supabase email link; at sign-in, the browser's saves merge into the account. Accounts hold an email address, alert choices, and saved or followed listing IDs, nothing else. Row level security limits each account's rows to its owner.
- **Alerts.** Alerts need their own opt-in after sign-in. The alerts job plans each person's emails (`src/alerts/plan.ts`), writes them to an outbox under a unique delivery key, and sends them through Resend with that key as the idempotency key, so a duplicate cron run or a retry can't send twice. Resend only remembers a key for 24 hours, so an email whose send may have succeeded (a timeout, a 5xx, or a function that died mid-send) is retried only within 23 hours, by the 11:00 and 15:00 retry passes; after that it's marked failed rather than risk a duplicate. Each run stops starting sends before the function's time limit and hands unsent emails to the next run. When the day's sync failed, alerts about new listings are held back. Deadline reminders still go out unless the catalog is more than three days stale.

| Alert | When |
| --- | --- |
| Weekly digest | Mondays: matches newly listed or newly opened since last week |
| New match closing soon | The same day, when a new match closes on or before the next digest |
| Followed program opened | The day a new round of a followed program opens |
| Deadline reminder | 7 and 2 calendar days before a saved listing's published deadline |

If Monday's run is missed or its sync fails, the digest goes out with the next successful run that week. Each person gets at most one digest a week and one other alert email a day.

Jobs and communities have no deadlines in the source, so they only appear in the digest. Focus (technical, governance, general) applies to programs and courses only. A listing with no known location matches only "Any location".

## Run it

Requires Node 22 or newer.

```sh
npm install
npm run dev          # http://localhost:5173
```

Without Supabase settings, the site runs as a **preview**: it shows the bundled catalog snapshot in `src/catalog/fixtures/`, with sign-in and alerts turned off. To run the full stack locally, start Supabase with the [CLI](https://supabase.com/docs/guides/local-development) (`npx supabase start` applies `supabase/migrations/`), then copy `.env.example` to `.env.local` and fill in the local URL and keys.

## Test it

```sh
npm test               # catalog, alert planning, server jobs on PGlite, row level security, and pages
npm run test:e2e       # browse, save, and old-link redirects in Chrome, against a production build
npm run build          # type-check everything and build

# The built Vercel Functions against a real Postgres (wiped first; localhost only):
docker run -d --name safetyapps-pg -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:17
npx vercel build
SMOKE_DATABASE_URL=postgres://postgres:pw@localhost:55432/postgres npm run smoke:functions
```

Server tests run the real migrations on [PGlite](https://pglite.dev) with a small stand-in for Supabase's `auth` schema and roles, so row level security is tested against Postgres itself. Time-dependent tests pin the clock to the snapshot day, Oct 9, 2026.

## Where things live

- `src/catalog/`: catalog types, normalization, location parsing, family rules, status, and browsing. Also runs on the server.
- `src/alerts/`: preference matching, alert planning, and email rendering. Also runs on the server.
- `src/views/`, `src/components/`, `src/state/`: the site. `src/lib/` talks to Supabase.
- `server/`: the sync, alerts, outbox, unsubscribe, account deletion, and status handlers.
- `api/`: Vercel Functions, thin wrappers around `server/handlers.ts`. Schedules are in `vercel.json`.
- `supabase/`: the database migration, local CLI settings, and the sign-in email template.
- `src/data/inventory/`: the researched records for eight fellowships, shown as preparation notes on their program pages, with the date they were checked.
- `data/independent-listings/`: independently researched catalog listings (JSON files). See that folder's README for the format. Not the same as inventory prep notes or catalog fixtures.
- `src/commonapp/`: the Common App prototype (see below).

Code in `src/catalog`, `src/alerts`, and `server` runs as plain ES modules in Vercel Functions, so its relative imports end in `.js`.

## Operations

- **Review queued cohorts:** `npm run catalog:review` lists them, then `npm run catalog:review -- link <cohort> <family>` or `-- standalone <cohort>`. Decisions apply at the next sync. Needs `DATABASE_URL`.
- **A new recurring program appears:** the sync and `/api/status` report it in `familiesWithoutRules`. Add a rule to `src/catalog/familyRules.ts` and a row to the table in `src/catalog/families.test.ts`.
- **Monitoring:** `/api/status` returns 503, with a list of `problems`, when the catalog hasn't synced or the alerts job hasn't finished in the last 26 hours, an alerts run stopped without finishing, an email has been stuck in the outbox for over 26 hours, or an email failed in the last day. Otherwise it returns 200. Failed syncs and failed deliveries also email `OPS_EMAIL`.
- **Refresh the test snapshot:** `npm run catalog:snapshot`, then update the fixture import and test dates.

Launch steps (domain, email, Supabase, Vercel) are in [docs/launch.md](docs/launch.md).

## The Common App prototype

The earlier Common App (one application for several fellowships) is kept in `src/commonapp/` for future partnership work. It isn't routed or bundled with the site, and old links such as `#/programs/mats` and `#/resources` redirect to the matching SafetyApps pages. Its tests still run; render `CommonApp` from `src/commonapp/CommonApp.tsx` to try it.
