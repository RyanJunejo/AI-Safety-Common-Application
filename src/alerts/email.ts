import { formatDay, weekOf } from '../catalog/dates.js';
import { describeLocation } from '../catalog/location.js';
import { closesIn, liveStatus } from '../catalog/status.js';
import { KIND_LABEL, type Opportunity } from '../catalog/types.js';
import type { NewMatch, PlannedEmail } from './plan.js';

/** Turns a planned alert into an email with HTML and plain-text bodies. */

export interface EmailLinks {
  siteUrl: string;
  unsubscribeUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function opportunityUrl(siteUrl: string, id: string): string {
  return `${siteUrl.replace(/\/$/, '')}/opportunities/${encodeURIComponent(id)}`;
}

interface Line {
  o: Opportunity;
  /** Status line, e.g. "Closes Oct 18, 2026 (as published)". */
  note: string;
}

function deadlineNote(o: Opportunity, day: string): string {
  const s = liveStatus(o, day);
  if (o.deadline && (s.state === 'open' || s.state === 'upcoming')) {
    const when = `${s.state === 'upcoming' ? 'Opens soon; closes' : 'Closes'} ${formatDay(o.deadline)} (as published)`;
    return s.daysLeft !== null && s.daysLeft <= 7 ? `${when}, ${closesIn(s.daysLeft).toLowerCase()}` : when;
  }
  return s.detail;
}

function matchNote(m: NewMatch, day: string): string {
  const prefix = m.change === 'opened' ? 'Now open. ' : '';
  return `${prefix}${deadlineNote(m.opportunity, day)}`;
}

interface Section {
  title: string;
  intro?: string;
  lines: Line[];
}

function sections(e: PlannedEmail): Section[] {
  const out: Section[] = [];
  if (e.openings.length) {
    out.push({
      title: 'Programs you follow are open',
      lines: e.openings.map((x) => ({ o: x.opportunity, note: `${x.family ? `A new round of ${x.family.title}. ` : ''}${deadlineNote(x.opportunity, e.day)}` })),
    });
  }
  if (e.urgent.length) {
    out.push({
      title: 'New, and closing before your next digest',
      lines: e.urgent.map((m) => ({ o: m.opportunity, note: matchNote(m, e.day) })),
    });
  }
  if (e.reminders.length) {
    out.push({
      title: 'Deadlines on your saved list',
      intro: 'Deadlines are dates as published. Check the official page for the exact closing time.',
      lines: e.reminders.map((r) => ({ o: r.opportunity, note: `${closesIn(r.daysLeft)}: ${formatDay(r.opportunity.deadline!)} (as published)` })),
    });
  }
  const kinds = ['program', 'course', 'job', 'community'] as const;
  for (const kind of kinds) {
    const lines = e.matches.filter((m) => m.opportunity.kind === kind).map((m) => ({ o: m.opportunity, note: matchNote(m, e.day) }));
    if (lines.length) out.push({ title: `New ${KIND_LABEL[kind].many.toLowerCase()}`, lines });
  }
  return out;
}

function subjectFor(e: PlannedEmail): string {
  if (e.kind === 'digest') {
    const n = e.matches.length;
    return n === 1 ? `1 new match this week: ${e.matches[0]!.opportunity.title}` : `${n} new matches this week`;
  }
  const total = e.openings.length + e.urgent.length + e.reminders.length;
  const more = total > 1 ? ` (+${total - 1} more)` : '';
  if (e.openings[0]) return `Now open: ${e.openings[0].opportunity.title}${more}`;
  if (e.urgent[0]) return `New, closes ${formatDay(e.urgent[0].opportunity.deadline!)}: ${e.urgent[0].opportunity.title}${more}`;
  const r = e.reminders[0]!;
  return `${closesIn(r.daysLeft)}: ${r.opportunity.title}${more}`;
}

function meta(o: Opportunity): string {
  return [o.organization, o.format, describeLocation(o.location)].filter(Boolean).join(' · ');
}

export function renderEmail(e: PlannedEmail, links: EmailLinks): RenderedEmail {
  const subject = subjectFor(e);
  const parts = sections(e);
  const manage = `${links.siteUrl.replace(/\/$/, '')}/account`;
  const heading = e.kind === 'digest' ? `New matches for the week of ${formatDay(weekOf(e.day))}` : 'Your SafetyApps alert';

  const text = [
    heading,
    '',
    ...parts.flatMap((s) => [
      s.title.toUpperCase(),
      ...(s.intro ? [s.intro] : []),
      ...s.lines.flatMap((l) => [`- ${l.o.title}`, `  ${meta(l.o)}`, `  ${l.note}`, `  ${opportunityUrl(links.siteUrl, l.o.id)}`]),
      '',
    ]),
    'Listings come from AISafety.com (CC BY 4.0).',
    `Change what you get: ${manage}`,
    `Unsubscribe from alerts: ${links.unsubscribeUrl}`,
  ].join('\n');

  const p = 'margin:0 0 4px;font-size:14px;line-height:1.5;color:#1b2430';
  const muted = 'margin:0 0 4px;font-size:13px;line-height:1.5;color:#5b6675';
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f5f7fa;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dfe4ea;border-radius:10px;padding:24px">
<p style="margin:0 0 16px;font-weight:700;color:#1d4f91">SafetyApps</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#1b2430">${esc(heading)}</h1>
${parts
  .map(
    (s) => `<h2 style="margin:20px 0 8px;font-size:16px;color:#1b2430">${esc(s.title)}</h2>
${s.intro ? `<p style="${muted}">${esc(s.intro)}</p>` : ''}
${s.lines
  .map(
    (l) => `<div style="margin:0 0 14px">
<p style="${p}"><a href="${esc(opportunityUrl(links.siteUrl, l.o.id))}" style="color:#1d4f91;font-weight:600">${esc(l.o.title)}</a></p>
<p style="${muted}">${esc(meta(l.o))}</p>
<p style="${p}">${esc(l.note)}</p>
</div>`,
  )
  .join('\n')}`,
  )
  .join('\n')}
<hr style="border:none;border-top:1px solid #dfe4ea;margin:20px 0">
<p style="${muted}">Listings come from <a href="https://aisafety.com" style="color:#5b6675">AISafety.com</a> (CC BY 4.0).</p>
<p style="${muted}">You get this because you turned on alerts at SafetyApps. <a href="${esc(manage)}" style="color:#5b6675">Change what you get</a> · <a href="${esc(links.unsubscribeUrl)}" style="color:#5b6675">Unsubscribe</a></p>
</div>
</body></html>`;

  return { subject, html, text };
}
