import type { Program, Question } from '../data/schema';
import { PROGRAMS } from '../data/inventory';
import { attachedArtifacts, programPrep, locationFit, type PrepItem } from './prep';
import type { Dossier } from './dossier';
import { formatVerified, lastVerified, roundStatus } from './round';
import { lengthLabel, REUSE_META, REUSE_ORDER, VISIBILITY_META } from './taxonomy';
import { AI_STANCE_META } from './ai';
import { ANSWER_STATUS_LABEL, APPLICATION_STATUS_LABEL, progressFor, type Workspace } from '../state/workspace';

function line(item: PrepItem, dossier: Dossier): string {
  const q = item.question;
  const box = item.done ? '[x]' : '[ ]';
  const parts: string[] = [];
  if (q.condition) parts.push(`if applicable: ${q.condition}`);
  else if (q.required === 'optional') parts.push('optional');
  if (q.format === 'timed-task') {
    parts.push(lengthLabel(q), item.done ? 'time set aside' : 'set aside uninterrupted time');
  } else if (item.reuse === 'tailor' || item.reuse === 'original') {
    parts.push(lengthLabel(q), ANSWER_STATUS_LABEL[item.answer.status]);
  }
  const artifacts = attachedArtifacts(item.answer, dossier);
  if (artifacts.length) parts.push(`attached: ${artifacts.map((a) => a.title).join(', ')}`);
  if (item.reuse === 'dossier' && item.fromDossier) parts.push(`from dossier: ${item.fromDossier}`);
  if (item.gap) parts.push(item.gap);
  if (q.aiRule === 'prohibited') parts.push('no AI assistance');
  if (q.promptVisibility === 'paraphrased') parts.push(VISIBILITY_META.paraphrased.label.toLowerCase());
  return `- ${box} ${q.prompt}${parts.length ? ` — ${parts.join('; ')}` : ''}`;
}

function unseen(q: Question): string {
  return `- [ ] ${q.prompt} — ${VISIBILITY_META[q.promptVisibility].label.toLowerCase()}`;
}

function programSection(program: Program, ws: Workspace, now: Date): string[] {
  const prep = programPrep(program, ws);
  const progress = progressFor(ws, program.id);
  const round = roundStatus(program, now);
  const out = [
    `## ${program.name}`,
    '',
    `- Round: ${round.label} (${round.detail})`,
    `- Your status: ${APPLICATION_STATUS_LABEL[progress.status]}`,
    `- Required items ready: ${prep.requiredDone} of ${prep.requiredTotal}`,
    `- Location: ${locationFit(program, ws.dossier).reason}`,
    `- AI use: ${AI_STANCE_META[program.aiPolicy.stance].label}`,
    `- Published time estimate: ${program.publishedTimeEstimate?.text ?? 'Not published'}`,
    `- Official application: ${program.applyUrl}`,
    '',
  ];
  for (const reuse of REUSE_ORDER) {
    const items = prep.groups[reuse];
    if (items.length === 0) continue;
    out.push(`### ${REUSE_META[reuse].label}`, '', ...items.map((i) => line(i, ws.dossier)), '');
  }
  if (prep.notYetVisible.length) {
    out.push('### Not yet visible', '', ...prep.notYetVisible.map(unseen), '');
  }
  if (prep.later.length) {
    out.push('### Later stages (if shortlisted)', '', ...prep.later.map(unseen), '');
  }
  return out;
}

/** A Markdown checklist of the applicant's preparation across active programs. */
export function checklistMarkdown(ws: Workspace, now: Date = new Date(), onlyProgramId?: string): string {
  const selected = PROGRAMS.filter((p) => (onlyProgramId ? p.id === onlyProgramId : true));
  const active = selected.filter((p) => progressFor(ws, p.id).status !== 'ruled-out');
  const ruledOut = selected.filter((p) => progressFor(ws, p.id).status === 'ruled-out');
  const verified = [...new Set(selected.map(lastVerified))].sort();

  const out = [
    '# Application preparation checklist',
    '',
    `Applicant: ${ws.dossier.fullName || 'Unnamed applicant'}`,
    `Exported: ${now.toISOString().slice(0, 10)}`,
    `Program details verified: ${verified.map(formatVerified).join(', ')}`,
    '',
    'Prepared in the Fellowship Application Workspace. Nothing here has been submitted to any program; apply on each official form.',
    '',
  ];
  for (const program of active) out.push(...programSection(program, ws, now));
  if (ruledOut.length) {
    out.push('## Ruled out', '');
    for (const p of ruledOut) {
      const reason = progressFor(ws, p.id).ruledOutReason;
      out.push(`- ${p.name}${reason ? ` — ${reason}` : ''}`);
    }
    out.push('');
  }
  return out.join('\n');
}

export function downloadText(filename: string, text: string, type = 'text/markdown'): void {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
