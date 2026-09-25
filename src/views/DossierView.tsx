import type { ReactNode } from 'react';
import type { DossierField } from '../data/schema';
import { ALL_LOCATIONS, INVENTORY, QUESTIONS } from '../data/inventory';
import { completeReferences, EMPTY_REFERENCE, newId, type Artifact, type Dossier, type Reference } from '../domain/dossier';
import { isRemote } from '../domain/prep';
import { useWorkspace } from '../state/store';

const PROGRAM_OF = new Map(INVENTORY.flatMap((r) => r.questions.map((q) => [q.id, r.program.name])));

/** How many inventory questions, across how many programs, a set of dossier fields supports. */
function usage(fields: DossierField[]) {
  const qs = QUESTIONS.filter((q) => q.dossierField && fields.includes(q.dossierField));
  return { questions: qs.length, programs: new Set(qs.map((q) => PROGRAM_OF.get(q.id))).size };
}

/** The largest number of references any program's form asks for, and which program asks. */
function mostReferencesAsked(): { n: number; program: string } | null {
  let best: { n: number; program: string } | null = null;
  for (const q of QUESTIONS) {
    const n = q.dossierField === 'references' && q.dossierSlots ? Math.max(...q.dossierSlots) : 0;
    if (n && (!best || n > best.n)) best = { n, program: PROGRAM_OF.get(q.id) ?? '' };
  }
  return best;
}

export function DossierView() {
  const { ws, dispatch } = useWorkspace();
  const d = ws.dossier;
  const patch = (fn: (d: Dossier) => Dossier) => dispatch({ type: 'dossier/replace', dossier: fn(structuredClone(d)) });
  const refsAsked = mostReferencesAsked();
  const completeRefs = completeReferences(d).length;

  const updateArtifact = (id: string, change: Partial<Artifact>) =>
    patch((x) => ({ ...x, artifacts: x.artifacts.map((a) => (a.id === id ? { ...a, ...change } : a)) }));
  const updateReference = (id: string, change: Partial<Reference>) =>
    patch((x) => ({ ...x, references: x.references.map((r) => (r.id === id ? { ...r, ...change } : r)) }));

  const places = ALL_LOCATIONS.filter((l) => !isRemote(l));

  return (
    <section aria-labelledby="dossier-title">
      <div className="page-head">
        <div>
          <h1 id="dossier-title">Researcher dossier</h1>
          <p className="lede">
            Facts and work samples you prepare once. Every program’s preparation view reads from here, so an update shows up everywhere.
            The researcher below is fictional sample data. Replace it with your own; it stays in this browser.
          </p>
        </div>
      </div>

      <Group title="Identity & contact" fields={['fullName', 'email', 'currentLocation', 'citizenship', 'workAuthorization']}>
        <Text label="Full name" value={d.fullName} onChange={(v) => patch((x) => ({ ...x, fullName: v }))} />
        <Text label="Email" type="email" value={d.email} onChange={(v) => patch((x) => ({ ...x, email: v }))} />
        <Text label="Current location" value={d.currentLocation} onChange={(v) => patch((x) => ({ ...x, currentLocation: v }))} />
        <Text label="Citizenship / passport" value={d.citizenship} onChange={(v) => patch((x) => ({ ...x, citizenship: v }))} />
        <Text
          label="Work authorization"
          wide
          value={d.workAuthorization}
          onChange={(v) => patch((x) => ({ ...x, workAuthorization: v }))}
        />
      </Group>

      <Group title="CV" fields={['cv']} note="The workspace records which file you plan to upload. It never stores the file.">
        <Text label="File name" value={d.cv.fileName} onChange={(v) => patch((x) => ({ ...x, cv: { ...x.cv, fileName: v } }))} />
        <Text label="Last updated" type="date" value={d.cv.updated} onChange={(v) => patch((x) => ({ ...x, cv: { ...x.cv, updated: v } }))} />
      </Group>

      <Group title="Education" fields={['educationLevel', 'educationField', 'educationInstitution']}>
        <Text label="Highest level" value={d.education.level} onChange={(v) => patch((x) => ({ ...x, education: { ...x.education, level: v } }))} />
        <Text label="Field" value={d.education.field} onChange={(v) => patch((x) => ({ ...x, education: { ...x.education, field: v } }))} />
        <Text
          label="Institution"
          value={d.education.institution}
          onChange={(v) => patch((x) => ({ ...x, education: { ...x.education, institution: v } }))}
        />
        <Text label="Year" value={d.education.year} onChange={(v) => patch((x) => ({ ...x, education: { ...x.education, year: v } }))} />
      </Group>

      <Group
        title="Experience"
        fields={[
          'currentRole',
          'yearsWork',
          'yearsSoftware',
          'yearsResearch',
          'publications',
          'peerReviewed',
          'papersReadClosely',
          'longestSelfDirected',
          'priorPrograms',
        ]}
        note="Programs ask these as numbers. Keep them consistent across applications."
      >
        <Text
          label="Current role"
          wide
          value={d.experience.currentRole}
          onChange={(v) => patch((x) => ({ ...x, experience: { ...x.experience, currentRole: v } }))}
        />
        {(
          [
            ['yearsWork', 'Years of work'],
            ['yearsSoftware', 'Years of software engineering'],
            ['yearsResearch', 'Years of research'],
            ['publications', 'Publications'],
            ['peerReviewed', 'Peer-reviewed papers'],
            ['papersReadClosely', 'AI safety papers read closely'],
            ['longestSelfDirectedMonths', 'Longest self-directed project (months)'],
          ] as const
        ).map(([key, label]) => (
          <Text
            key={key}
            label={label}
            inputMode="decimal"
            value={d.experience[key]}
            onChange={(v) => patch((x) => ({ ...x, experience: { ...x.experience, [key]: v } }))}
          />
        ))}
        <Text
          label="Programs and courses completed"
          wide
          value={d.experience.priorPrograms}
          onChange={(v) => patch((x) => ({ ...x, experience: { ...x.experience, priorPrograms: v } }))}
        />
      </Group>

      <Group title="Links" fields={['github', 'linkedin', 'website', 'scholar', 'otherLinks']}>
        {(
          [
            ['github', 'GitHub'],
            ['linkedin', 'LinkedIn'],
            ['website', 'Personal website'],
            ['scholar', 'Google Scholar'],
            ['other', 'Other (blog, forum profile, talks)'],
          ] as const
        ).map(([key, label]) => (
          <Text key={key} label={label} type="url" value={d.links[key]} onChange={(v) => patch((x) => ({ ...x, links: { ...x.links, [key]: v } }))} />
        ))}
      </Group>

      <Group
        title="Work artifacts"
        fields={['artifacts']}
        note="Repositories, papers, and write-ups you can attach to any program’s evidence questions."
        testId="dossier-artifacts"
      >
        <ul className="entry-list">
          {d.artifacts.map((a) => (
            <li key={a.id} className="entry" data-testid={`artifact-${a.id}`}>
              <Text label="Title" wide value={a.title} onChange={(v) => updateArtifact(a.id, { title: v })} />
              <label className="field">
                <span>Kind</span>
                <select value={a.kind} onChange={(e) => updateArtifact(a.id, { kind: e.target.value as Artifact['kind'] })}>
                  {(['repository', 'paper', 'blog post', 'tool', 'talk', 'other'] as const).map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <Text label="Link" type="url" value={a.url} onChange={(v) => updateArtifact(a.id, { url: v })} />
              <TextArea label="What it shows" value={a.summary} onChange={(v) => updateArtifact(a.id, { summary: v })} />
              <div className="entry-foot">
                <label className="check-manual">
                  <input type="checkbox" checked={a.shareable} onChange={(e) => updateArtifact(a.id, { shareable: e.target.checked })} /> Can be
                  shared publicly
                </label>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => patch((x) => ({ ...x, artifacts: x.artifacts.filter((y) => y.id !== a.id) }))}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-small"
          onClick={() =>
            patch((x) => ({
              ...x,
              artifacts: [...x.artifacts, { id: newId('artifact'), title: '', kind: 'repository', url: '', summary: '', shareable: true }],
            }))
          }
        >
          Add artifact
        </button>
      </Group>

      <Group
        title="References"
        fields={['references']}
        testId="dossier-references"
        note={
          refsAsked
            ? `${completeRefs} complete, with every field filled. ${refsAsked.program} asks for ${refsAsked.n}, the most of any program.`
            : undefined
        }
      >
        <ul className="entry-list">
          {d.references.map((r, i) => (
            <li key={r.id} className="entry">
              <p className="entry-label">Reference {i + 1}</p>
              <Text label="Name" value={r.name} onChange={(v) => updateReference(r.id, { name: v })} />
              <Text label="Email" type="email" value={r.email} onChange={(v) => updateReference(r.id, { email: v })} />
              <Text label="Role or job title" value={r.role} onChange={(v) => updateReference(r.id, { role: v })} />
              <Text label="Organization" value={r.organization} onChange={(v) => updateReference(r.id, { organization: v })} />
              <TextArea label="How they know your work" value={r.relationship} onChange={(v) => updateReference(r.id, { relationship: v })} />
              <div className="entry-foot">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => patch((x) => ({ ...x, references: x.references.filter((y) => y.id !== r.id) }))}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-small"
          onClick={() =>
            patch((x) => ({ ...x, references: [...x.references, { id: newId('ref'), ...EMPTY_REFERENCE }] }))
          }
        >
          Add reference
        </button>
      </Group>

      <Group title="Availability" fields={['earliestStart', 'fullTime', 'commitments']}>
        <Text
          label="Earliest start"
          type="date"
          value={d.availability.earliestStart}
          onChange={(v) => patch((x) => ({ ...x, availability: { ...x.availability, earliestStart: v } }))}
        />
        <label className="field">
          <span>Full-time</span>
          <select
            value={d.availability.fullTime}
            onChange={(e) =>
              patch((x) => ({ ...x, availability: { ...x.availability, fullTime: e.target.value as Dossier['availability']['fullTime'] } }))
            }
          >
            <option value="">Not set</option>
            <option value="yes">Yes</option>
            <option value="partly">Partly</option>
            <option value="no">No</option>
          </select>
        </label>
        <TextArea
          label="Other commitments"
          value={d.availability.notes}
          onChange={(v) => patch((x) => ({ ...x, availability: { ...x.availability, notes: v } }))}
        />
      </Group>

      <Group
        title="Where you can work"
        fields={['locationPreferences']}
        note="Used to flag programs whose locations do not work for you."
        testId="dossier-locations"
      >
        <fieldset className="place-list">
          <legend className="sr-only">Locations</legend>
          <label>
            <input
              type="checkbox"
              checked={d.locationPreferences.remote}
              onChange={(e) => patch((x) => ({ ...x, locationPreferences: { ...x.locationPreferences, remote: e.target.checked } }))}
            />{' '}
            Remote
          </label>
          {places.map((place) => (
            <label key={place}>
              <input
                type="checkbox"
                checked={d.locationPreferences.places.includes(place)}
                onChange={(e) =>
                  patch((x) => ({
                    ...x,
                    locationPreferences: {
                      ...x.locationPreferences,
                      places: e.target.checked
                        ? [...x.locationPreferences.places, place]
                        : x.locationPreferences.places.filter((p) => p !== place),
                    },
                  }))
                }
              />{' '}
              {place}
            </label>
          ))}
        </fieldset>
        <TextArea
          label="Notes on relocation and visas"
          value={d.locationPreferences.notes}
          onChange={(v) => patch((x) => ({ ...x, locationPreferences: { ...x.locationPreferences, notes: v } }))}
        />
      </Group>

      <Group
        title="Research notes"
        fields={['researchInterests']}
        note="Your own notes on interests and goals. Motivation questions show them as material to draw on. Write each answer fresh for its program."
      >
        <TextArea label="Notes" rows={5} value={d.researchNotes} onChange={(v) => patch((x) => ({ ...x, researchNotes: v }))} />
      </Group>
    </section>
  );
}

function Group({
  title,
  fields,
  note,
  children,
  testId,
}: {
  title: string;
  fields: DossierField[];
  note?: string;
  children: ReactNode;
  testId?: string;
}) {
  const u = usage(fields);
  return (
    <section className="dossier-group" data-testid={testId}>
      <header>
        <h2>{title}</h2>
        {u.questions > 0 && (
          <p className="usage">
            Fills {u.questions} question{u.questions === 1 ? '' : 's'} across {u.programs} program{u.programs === 1 ? '' : 's'}
          </p>
        )}
      </header>
      {note && <p className="group-note">{note}</p>}
      <div className="field-grid">{children}</div>
    </section>
  );
}

function Text({
  label,
  value,
  onChange,
  type = 'text',
  wide,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  wide?: boolean;
  inputMode?: 'decimal';
}) {
  return (
    <label className={wide ? 'field field-wide' : 'field'}>
      <span>{label}</span>
      <input type={type} value={value} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function TextArea({ label, value, onChange, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="field field-wide">
      <span>{label}</span>
      <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
