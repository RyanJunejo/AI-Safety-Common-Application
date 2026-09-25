# Fellowship Application Workspace

A browser workspace for researchers applying to AI safety fellowships. It maps the questions eight programs ask, shows which answers carry across programs and which need fresh thinking, and tracks what each application still needs.

It uses a fictional sample researcher, never submits anything to a program, and keeps every edit in the browser's local storage.

## What it does

- **Compare programs**: round status (checked against stated deadlines), location fit against your dossier, AI-use policy, published time estimates, your status, and readiness. You can rule programs out with a reason.
- **Question map**: every question grouped by what it asks for (identity & CV, evidence of past work, motivation, original research judgment, program fit, references, availability, consent), with each program's prompts side by side.
- **Researcher dossier**: facts, links, work artifacts, and references you prepare once. Each group shows how many questions it fills.
- **Program preparation**: each application split into
  - **Prepare once**: filled from the dossier.
  - **Tailor for this program**: motivation and fit answers written for this prompt.
  - **Original reasoning**: critiques, proposals, and timed tasks.
  - **Confirm per program**: stream choices, consent, and AI attestations.
  - **Not yet published**: prompts behind closed forms.
- **Export**: a Markdown checklist for all active programs or one program. Working drafts are never included.
- **Sources**: the evidence behind each program's round status, the sources consulted, and the full question inventory, downloadable as JSON.

## Programs covered

LASR Labs, Anthropic Fellows, MATS, SPAR, PIBBSS, Pivotal, Iliad, and the IAPS AI Policy Fellowship. All were verified on September 25, 2026.

## The question inventory

`src/data/inventory/<program>.json` holds one record per program, validated at load time by the Zod schema in `src/data/schema.ts`.

Each question records:

- its category, stage, and input format
- its stated length and required status
- its official source URL and verification date
- a `promptVisibility` label:

| Label | Meaning |
| --- | --- |
| `verbatim` ("Exact prompt") | Wording seen on an official page on the verification date. For a closed round the UI adds "closed round", because the next round may change it. When the round's status needs rechecking, it adds "as of" the verification date instead. |
| `paraphrased` ("Wording not verified") | From an official description, or from a closed form's source that is not displayed to applicants. |
| `unknown` ("Prompt not published") | The question exists but no official source gives its wording. |

Records also carry workspace annotations:

- `dossierField`: the single dossier fact that answers a question (for example, years of software engineering). A question is ready only when that exact fact is filled in. Questions the dossier can't answer, such as whether you can attend the IAPS D.C. kickoff, have no `dossierField`; you confirm those yourself.
- `dossierSlots`, `referenceParts`: for reference questions, which references (`[3]` for "Reference 3: Name", `[1, 2]` for a field asked of two referees) and which of their fields (name, email, role, organization, relationship) the question needs.
- `condition`: questions shown only after certain answers. These are excluded from required counts.
- `reuse`: overrides the default preparation class.

Notes deliberately leave out scoring logic, answer keys, and screening mechanisms. Records describe only what an applicant sees.

Round status is computed from the current time, and the page updates itself when a deadline passes:

- Deadlines are recorded per cohort in the program's own timezone. A form that serves several cohorts, such as Iliad's Intensive and Fellowship, stays open until the last cohort's deadline.
- A stated deadline always wins, so a form still reachable after its deadline shows as closed.
- An open round with no deadline shows as "Recheck status" 21 days after it was last verified. It is never presented as closed.

### Updating a program

1. Re-read the official pages and forms. Don't enter or submit anything.
2. Edit the program's JSON: update `accessed` and `verifiedOn` dates, round evidence, and prompts. Use `verbatim` only for wording you saw.
3. Run `npm test`. The inventory tests check sources, stage references, verification labels, and round-status rules.

## Development

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # unit and component tests (Vitest)
npm run test:e2e     # applicant walkthrough in Chrome (Playwright)
npm run build        # type-check and production build
```

The end-to-end tests build the app and serve it on port 4317, and they use an installed Chrome. Set `PLAYWRIGHT_CHROME_PATH` to point at a specific binary. The tests pin or advance the browser clock, so round status is deterministic.

## Privacy

There is no backend. The workspace is stored under one `localStorage` key, and "Reset sample" replaces it with the fictional researcher. Official application links open the programs' own sites, where applicants submit directly.

See [ROADMAP.md](ROADMAP.md) for the partner-supported submission flow.
