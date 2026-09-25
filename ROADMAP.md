# Roadmap

The prototype shows the applicant experience end to end. Nothing is sent to programs yet. These are the steps to a working service.

## 1. Pilot with two or three programs
- Agree on the packet a program receives: the Common Application, its own questions, and recommenders.
- Start with programs whose forms are already in Airtable or Google Forms, so a packet can be imported directly.
- Confirm which of each program's questions the Common Application can replace, and which stay program-specific.

## 2. Accounts and storage
- Sign-in, and a hosted database with per-program access (for example, Postgres with row-level security), so each program sees only applications sent to it.
- Export to each program's Airtable or spreadsheet, or push to it directly.
- Retention and deletion rules, and a privacy policy both applicants and programs agree to.

## 3. Recommenders
- Send each recommender a single link to a single form.
- With the applicant's consent, share the recommendation with every program that asks for one.
- Show applicants whether each recommendation has arrived, never its contents.

## 4. Keep program details current
- Re-check deadlines, links, and questions each round, and flag changes.
- Ask organizers for their next-round questions before forms open.

## 5. Grow the resources
- Interview practice sets and example answers from past fellows, with permission.
- A short "which program fits me" guide.

## Open questions
- Should the Common App standardize a few written questions that programs accept in place of their own?
- How should mentor-specific questions work (SPAR, Pivotal, MATS streams)? They change every round.
- Timed tests (MATS, IAPS) stay on programs' own platforms. How do we link applicants to them cleanly?
