/**
 * Reviewed rules that tie a cohort record to its recurring program family, one per
 * recurring training program in the AISafety.com feed. Keyed by the family's source
 * record ID, which is stable.
 *
 * A cohort whose title matches exactly one family's `titles` is linked automatically.
 * A cohort that only shares a web host with a family (or matches more than one
 * family) is queued for a person to review, and gets no family alerts until then.
 *
 * When the feed adds a recurring program, the sync reports it as missing a rule. Add
 * one here, with a test case in `families.test.ts`, after checking its cohorts by hand.
 * Last reviewed against the feed on Oct 9, 2026.
 */
export interface FamilyRule {
  /** The family's name, for people reading this file. */
  name: string;
  /** Title patterns for this family's cohorts. Matched case-insensitively against the start of the title. */
  titles: RegExp[];
  /** Extra web hosts that suggest a cohort may belong here. The family's own host is always used. */
  hosts?: string[];
}

export const FAMILY_RULES: Record<string, FamilyRule> = {
  recwQkZJJ2UbDUjhy: { name: 'AI Governance Taskforce', titles: [/^AI Governance Taskforce\b/i] },
  recoyRTtlcaDUUQdL: { name: 'AI Safety Camp (AISC)', titles: [/^AI Safety Camp\b/i, /^AISC\b/i] },
  recxzjEgVSubdNgVg: { name: 'AI Security Bootcamp (AISB)', titles: [/^AI Security Bootcamp\b/i, /^AISB\b/i] },
  recvuVrhIqffLrRNP: { name: 'ARBOx', titles: [/^ARBOx\b/i, /^Alignment Research Bootcamp Oxford\b/i] },
  recqUhj6LaubXR3vo: { name: 'ARENA', titles: [/^ARENA\b/, /^Alignment Research Engineer Accelerator\b/i] },
  recsF7D6LJdj9SjgJ: { name: 'Algoverse AI Safety', titles: [/^Algoverse\b/i] },
  recLdJIkptiztPH6P: {
    name: 'Anthropic Fellows Program',
    titles: [/^Anthropic (?:AI Safety )?Fellows(?: Program(?:me)?)?\b/i],
    hosts: ['job-boards.greenhouse.io/anthropic'],
  },
  recTUrG6O0p0sxQsi: { name: 'Apart Fellowship', titles: [/^Apart (?:Research )?Fellowship\b/i] },
  rec0JQTRiQZj1a9QV: { name: 'Astra Fellowship', titles: [/^(?:Constellation )?Astra Fellowship\b/i] },
  recUOQCM2x0v8jwqs: { name: 'Athena Mentorship Program', titles: [/^(?:Research )?Athena\b/i] },
  rec6rat76WhqULQUS: { name: 'BASE Fellowship', titles: [/^BASE Fellowship\b/i] },
  recdQ969YmHCnhV29: { name: 'BlueDot Impact courses', titles: [/^BlueDot\b/i] },
  recLAzcPCI6At1MOE: { name: 'CAMBRIA', titles: [/^CAMBRIA\b/i] },
  rec7eRVZBrTF7JLor: {
    name: 'CBAI Research Fellowship',
    titles: [/^CBAI (?:(?:Fall|Spring|Summer|Winter|Autumn) )?(?:AI Safety )?Research Fellowship\b/i],
  },
  recZwEHdV8QpMrVCR: { name: 'CHAI Internship', titles: [/^CHAI (?:Research )?Internship\b/i] },
  rectGGLf3xNBjG27m: { name: 'CLR Summer Research Fellowship', titles: [/^CLR (?:Summer )?Research Fellowship\b/i] },
  recEE7W7lvNUkyPVB: { name: 'Constellation Visiting Fellows', titles: [/^Constellation Visiting (?:Fellows|Fellowship|Researchers?)\b/i] },
  recG6wHPLlxNoXQTB: { name: 'Cooperative AI Summer School', titles: [/^Cooperative AI Summer School\b/i] },
  recor9jSJMZqTxa3k: { name: 'Dilemmas and Dangers in AI', titles: [/^Dilemmas and Dangers in AI\b/i] },
  recCleOyyfQGkBZIJ: { name: 'Dovetail Research Fellowship', titles: [/^Dovetail\b.*\bFellowship\b/i] },
  rec2sUSuXraFWl7u3: { name: 'ERA:AI Fellowship', titles: [/^ERA\s*:\s*AI\b/i, /^ERA (?:Cambridge )?Fellowship\b/i] },
  recU9TIvuBwGmPSwF: { name: 'Effective Thesis Fellowship', titles: [/^Effective Thesis Fellowship\b/i] },
  recwcNlRsRTneoGdB: { name: 'Foresight Fellowship', titles: [/^Foresight (?:Institute )?Fellowship\b/i] },
  recq1YTdMkJ0FMBsC: { name: 'Frame Fellowship', titles: [/^Frame Fellowship\b/i] },
  recag9i2y47twdsGD: { name: 'Future Impact Group (FIG) Fellowship', titles: [/^(?:Future Impact Group|FIG)\b.*\bFellowship\b/i] },
  recHZhlokiYZ33diI: { name: 'Global Challenges Project (GCP)', titles: [/^Global Challenges Project\b/i, /^GCP\b/] },
  recxJjGgPujKFbxdO: { name: 'GovAI Fellowship', titles: [/^GovAI\b.*\bFellowship\b/i] },
  recdoMAlALXfnxCeW: { name: 'HIP Impact Accelerator Program (IAP)', titles: [/^(?:HIP )?Impact Accelerator Program\b/i] },
  recRfaFKPcs5Kuhys: { name: 'Horizon Fellowship', titles: [/^Horizon (?:Public Service )?Fellowship\b/i] },
  rec3OM4l8WhLjbD2I: { name: 'Human-Aligned AI Summer School', titles: [/^Human[- ]Aligned AI Summer School\b/i] },
  rechE62zg7HFr2wv7: {
    name: 'IAPS AI Policy Fellowship',
    titles: [/^(?:Institute for AI Policy and Strategy \(IAPS\)|IAPS) AI Policy Fellowship\b/i],
  },
  rec4fx8zjp86cI6aq: { name: 'ILINA Junior Research Fellowship', titles: [/^ILINA\b.*\bFellowship\b/i] },
  recraUtUpAHxmv1FL: { name: 'Iliad Fellowship', titles: [/^Iliad Fellowship\b/i] },
  recydfEpm2p9tW6oF: { name: 'Iliad Intensive', titles: [/^Iliad Intensive\b/i] },
  rectetscTK7TA4HWb: { name: 'Introduction to Cooperative AI', titles: [/^Introduction to Cooperative AI\b/i] },
  recBZC37c1HgT9gzJ: { name: 'LASR Labs', titles: [/^LASR Labs\b/i] },
  recE7CZjmNxsF2DNR: { name: 'LawAI Research Fellowships', titles: [/^LawAI\b.*\bFellowship\b/i] },
  rechpNtQUj1Xm5d9j: { name: 'Lens Academy courses', titles: [/^Lens Academy\b/i] },
  reczLfFotU3eOa2OJ: { name: 'MARS', titles: [/^MARS\b/, /^Mentorship for Alignment Research Students\b/i] },
  receOAca5S5nHnSpU: { name: 'MATS', titles: [/^MATS\b/, /^ML Alignment (?:&|and) Theory Scholars\b/i] },
  recXrfObONnuQYWmd: { name: 'ML4Good', titles: [/^ML4Good\b/i] },
  recCjhxRjjDsTVSQL: { name: 'Meridian Visiting Researcher Programme', titles: [/^Meridian Visiting Researcher/i] },
  recRaWeq7OdXbMxbq: { name: 'Non-Trivial Fellowship', titles: [/^Non-?Trivial\b/i] },
  rec3s5QA6fHHNR8gs: { name: 'Orion AI Policy Accelerator', titles: [/^Orion AI Policy Accelerator\b/i] },
  recYA6ZCK741kp5FQ: { name: 'PIBBSS Fellowship', titles: [/^(?:Principles of Intelligence\s*)?\(?PIBBSS\)?\s+Fellowship\b/i] },
  recW6uWJQ7LaR8VMM: { name: 'Paragon Policy Fellowship', titles: [/^Paragon\b.*\bFellowship\b/i] },
  recVmwa1RXc25dDLZ: { name: 'Pathfinder Fellowship', titles: [/^(?:Kairos )?Pathfinder Fellowship\b/i] },
  recDvRawU9wlVpuG6: { name: 'Pivotal Research Fellowship', titles: [/^Pivotal\b.*\bFellowship\b/i] },
  recSs3CQteyddEU2D: { name: 'RAND CAST Fellowship', titles: [/^RAND\b.*\bCAST\b/i] },
  rectGZPQWFrvyhd3Z: { name: 'SPAR', titles: [/^SPAR\b/, /^Supervised Program for Alignment Research\b/i] },
  recnlYQ6tbjbzbTkD: { name: 'TARA', titles: [/^TARA\b/, /^Technical Alignment Research Accelerator\b/i] },
  recvW8ziwUxeJOKEg: { name: 'Talos Fellowship', titles: [/^Talos\b.*\bFellowship\b/i] },
  recpQsYl8ToL43DQa: { name: 'Tarbell Fellowship', titles: [/^Tarbell\b.*\bFellowship\b/i] },
  reccGVf5ghXob6ALF: { name: 'XLab Summer Research Fellowship', titles: [/^(?:UChicago )?XLab\b.*\bResearch Fellowship\b/i] },
};
