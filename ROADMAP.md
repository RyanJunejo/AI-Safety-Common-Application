# Roadmap

## Now: public beta

SafetyApps lists programs, courses, jobs, and communities from AISafety.com, lets anyone save them, and sends opt-in alerts. Launch steps are in [docs/launch.md](docs/launch.md). During the beta:

- Invite survey respondents ([draft](docs/beta-invite.md)) and collect feedback.
- Review queued cohorts weekly (`npm run catalog:review`) and add rules for new recurring programs.
- Watch digest and alert volume; adjust what counts as "closing soon" if people find the same-day emails too frequent.

## Next: resume reviews

Resume and application reviews for people applying to programs, starting with survey respondents who asked for one. This comes after the beta release.

## Later

- **More preparation notes.** The eight researched programs show what their applications asked. Extend this to more recurring programs, and refresh it each round.
- **Guides.** A "which program fits me" guide, and curated resources for people new to AI safety (reading lists, how to write research papers, who to talk to).
- **More from AISafety.com.** Events and funding are in the same API and could be added as categories.
- **Common App partnerships.** The Common App prototype (`src/commonapp/`) is kept for future work with programs, for example alongside Talent Commons. It needs program agreements on what a shared application covers before it's useful.

## Open questions

- Should followers also hear when a new round is *announced* (listed as opening soon), not only when it opens?
- Should alerts have per-type switches (digest, reminders, follows), or are types and locations enough?
- Should followers also hear about independently researched listings the same way as AISafety.com ones? (Duplicates across sources already fail the sync.)
