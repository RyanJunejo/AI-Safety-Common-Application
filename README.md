# AI Safety Common App

One application for AI safety fellowships, with the resources applicants need alongside it.

AI safety fellowships are competitive, applications are rising fast, and every program has its own form. Most of those forms ask the same things. This prototype lets an applicant fill those in once, choose programs, answer only each program's own questions, and ask recommenders once. It is modeled on the US Common App.

## How it works

- **My application.** Profile, education and experience, work and links, availability, and one personal statement. These go to every program.
- **Programs.** Eight fellowships, with their status, deadline, location, stipend, and what each asks beyond the Common Application. Add programs to your list.
- **Program pages.** Each program's own questions, using the real prompts from its current or last application. Each page also has its AI-use rule, a requirements checklist, its confirmations, and a Submit button. Closed rounds can be saved and prepared for, but not submitted.
- **Recommenders.** Add up to three people once. One request covers every program that asks for references.
- **Resources.** Deadlines and official application links, how to write answers, each program's AI rule, work samples, references, interview prep (technical, research, and behavioral), and where to go next.
- **What programs receive.** Every applicant arrives in the same format, and programs can download it as a spreadsheet for the tools they already use.

## Why a common application works here

The program details come from each program's official pages and forms, checked on Sep 25, 2026 (`src/data/inventory/`). Across the eight programs:

- **81% shared:** of the 165 required upfront questions, 81% are shared facts or quick confirmations.
- **About 28 profile fields** answer all of those shared questions.
- **What's left is written:** each program adds 1 to 7 written questions, 29 in total.
- **Written answers stay with each program.** LASR Labs, MATS, and SPAR don't accept AI-written answers, and Anthropic allows AI only to refine your own draft. So the Common App shares facts and one personal statement.

## What's real and what's simulated

| Real | Simulated |
| --- | --- |
| Program details, deadlines, official links, AI rules, and each program's questions | Submitting: nothing is sent to any program |
| Status that updates as deadlines pass | Recommender requests: no emails are sent |
| The packet and spreadsheet a program would receive | Storage: everything stays in this browser's `localStorage` |

**Storage.** For a prototype, browser storage needs no accounts or setup. For the real service, use a hosted database with sign-in, such as Postgres with row-level security, rather than a shared spreadsheet. Applications hold personal data, and each program should see only the applications sent to it. Programs can still receive a spreadsheet or Airtable export. See [ROADMAP.md](ROADMAP.md).

## Run it

Requires Node 22 or newer.

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # data, rules, and screen tests (Vitest)
npm run test:e2e     # the applicant walkthrough in Chrome (Playwright)
npm run build        # type-check and production build
```

Use **Load sample applicant** in the top bar to explore with a fictional applicant, and **Start over** to clear it.

## Where things live

- `src/data/inventory/`: the sourced record for each program, validated by `src/data/schema.ts`.
- `src/data/catalog.ts`: which of each program's questions appear on its page, plus a one-line summary.
- `src/logic.ts`: section completeness, answer checks, and what blocks a submission.
- `src/views/`: one file per screen.

## Updating a program for a new round

1. Re-read the program's official pages and form without submitting anything.
2. Update its JSON in `src/data/inventory/`: the deadline, round status and evidence, and questions.
3. If its questions changed, update its entry in `src/data/catalog.ts`.
4. Run `npm test`.
