import type { ProgramPrep } from '../domain/prep';
import { REUSE_META, REUSE_ORDER } from '../domain/taxonomy';

/** Stacked bar of the upfront application by how each answer is prepared. */
export function QuestionMix({ prep }: { prep: ProgramPrep }) {
  const counts = REUSE_ORDER.map((r) => ({ reuse: r, n: prep.groups[r].length }));
  const total = counts.reduce((sum, c) => sum + c.n, 0) + prep.notYetVisible.length;
  if (total === 0) return <p className="mix-empty">No upfront questions published.</p>;

  return (
    <div className="mix">
      <div className="mix-bar" aria-hidden="true">
        {counts.map(({ reuse, n }) =>
          n ? <span key={reuse} className={`mix-seg reuse-${reuse}`} style={{ flexGrow: n }} /> : null,
        )}
        {prep.notYetVisible.length > 0 && <span className="mix-seg mix-unknown" style={{ flexGrow: prep.notYetVisible.length }} />}
      </div>
      <ul className="mix-legend">
        {counts.map(({ reuse, n }) =>
          n ? (
            <li key={reuse}>
              <span className={`swatch reuse-${reuse}`} aria-hidden="true" />
              {n} {REUSE_META[reuse].short.toLowerCase()}
            </li>
          ) : null,
        )}
        {prep.notYetVisible.length > 0 && (
          <li>
            <span className="swatch mix-unknown" aria-hidden="true" />
            {prep.notYetVisible.length} not published
          </li>
        )}
      </ul>
    </div>
  );
}
