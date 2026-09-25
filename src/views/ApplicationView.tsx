import { Check, SelectField, TextField } from '../components/ui';
import { countWords, SECTIONS, STATEMENT_MAX_WORDS, STATEMENT_MIN_WORDS, type SectionKey } from '../logic';
import { href } from '../router';
import type { SectionId } from '../state/app';
import { useStore } from '../state/store';

const LOCATIONS = ['Remote', 'London', 'Berkeley / Bay Area', 'Washington, D.C.', 'Cape Town'];

const EDUCATION = ["High school", "Bachelor's", "Master's", 'PhD', 'Postdoc', 'Other'].map((v) => ({ value: v, label: v }));

export function ApplicationView({ section }: { section?: string }) {
  const { state, dispatch } = useStore();
  const a = state.application;
  const current = (SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]).id as SectionKey;
  const index = SECTIONS.findIndex((s) => s.id === current);
  const next = SECTIONS[index + 1];

  const set = (sec: SectionId) => (field: string) => (value: unknown) =>
    dispatch({ type: 'section', section: sec, patch: { [field]: value } });
  const profile = set('profile');
  const background = set('background');
  const work = set('work');
  const availability = set('availability');

  return (
    <div className="application">
      <aside className="app-nav" aria-label="Application sections">
        <h1>My application</h1>
        <p className="muted small">Sent to every program you apply to.</p>
        <ol>
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={href({ name: 'application', section: s.id })} className={s.id === current ? 'active' : undefined} aria-current={s.id === current ? 'step' : undefined}>
                <Check done={s.complete(a)} />
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </aside>

      <section className="panel app-form" aria-labelledby="section-title">
        <h2 id="section-title">{SECTIONS[index]!.title}</h2>

        {current === 'profile' && (
          <div className="grid">
            <TextField label="First name" required value={a.profile.firstName} onChange={profile('firstName')} />
            <TextField label="Last name" required value={a.profile.lastName} onChange={profile('lastName')} />
            <TextField label="Email" type="email" required value={a.profile.email} onChange={profile('email')} />
            <TextField label="Country you live in" required value={a.profile.country} onChange={profile('country')} />
            <TextField label="City" value={a.profile.city} onChange={profile('city')} />
            <TextField label="Citizenship" required value={a.profile.citizenship} onChange={profile('citizenship')} />
            <TextField
              label="Where you can work without a visa"
              wide
              value={a.profile.workAuthorization}
              onChange={profile('workAuthorization')}
              hint="Several programs can’t sponsor visas, so they ask this."
            />
          </div>
        )}

        {current === 'background' && (
          <div className="grid">
            <SelectField label="Highest education" required value={a.background.education} onChange={background('education')} options={EDUCATION} />
            <TextField label="Field of study" value={a.background.field} onChange={background('field')} />
            <TextField label="Institution" value={a.background.institution} onChange={background('institution')} />
            <TextField label="Current role" required value={a.background.currentRole} onChange={background('currentRole')} placeholder="e.g. Software engineer, PhD student" />
            <TextField label="Years of work experience" required value={a.background.yearsExperience} onChange={background('yearsExperience')} />
            <TextField label="Years of research experience" value={a.background.yearsResearch} onChange={background('yearsResearch')} />
            <TextField label="Publications" value={a.background.publications} onChange={background('publications')} hint="A number is fine." />
          </div>
        )}

        {current === 'work' && (
          <div className="grid">
            <label className="field wide">
              <span className="field-label">
                CV <span className="req">*</span>
              </span>
              <input type="file" accept=".pdf" onChange={(e) => work('cvFileName')(e.target.files?.[0]?.name ?? '')} />
              <span className="field-hint">
                {a.work.cvFileName ? `Attached: ${a.work.cvFileName}` : 'PDF. This prototype keeps only the file name.'}
              </span>
            </label>
            <TextField label="GitHub" type="url" value={a.work.github} onChange={work('github')} />
            <TextField label="LinkedIn" type="url" value={a.work.linkedin} onChange={work('linkedin')} />
            <TextField label="Website, blog, or Google Scholar" type="url" wide value={a.work.website} onChange={work('website')} />
            <TextField
              label="Your best piece of work"
              type="url"
              wide
              value={a.work.sampleUrl}
              onChange={work('sampleUrl')}
              hint="A repository, paper, post, or tool. Make sure the link works when logged out."
            />
            <label className="field wide">
              <span className="field-label">What it is and why it was hard</span>
              <textarea rows={3} value={a.work.sampleSummary} onChange={(e) => work('sampleSummary')(e.target.value)} />
              <span className="field-hint">One or two sentences. If it can’t be shared, describe it here instead.</span>
            </label>
          </div>
        )}

        {current === 'availability' && (
          <div className="grid">
            <TextField label="Earliest start date" type="date" required value={a.availability.startDate} onChange={availability('startDate')} />
            <SelectField
              label="Commitment"
              required
              value={a.availability.commitment}
              onChange={availability('commitment')}
              options={[
                { value: 'full-time', label: 'Full-time' },
                { value: 'part-time', label: 'Part-time' },
              ]}
            />
            <fieldset className="field wide">
              <legend className="field-label">
                Where you could do a fellowship <span className="req">*</span>
              </legend>
              <div className="choices inline">
                {LOCATIONS.map((l) => (
                  <label key={l} className="choice">
                    <input
                      type="checkbox"
                      checked={a.availability.locations.includes(l)}
                      onChange={(e) =>
                        availability('locations')(
                          e.target.checked ? [...a.availability.locations, l] : a.availability.locations.filter((x) => x !== l),
                        )
                      }
                    />{' '}
                    {l}
                  </label>
                ))}
              </div>
            </fieldset>
            <SelectField
              label="Would you need a visa?"
              required
              value={a.availability.needsVisa}
              onChange={availability('needsVisa')}
              options={[
                { value: 'no', label: 'No' },
                { value: 'yes', label: 'Yes' },
                { value: 'unsure', label: 'Not sure' },
              ]}
            />
            <label className="field wide">
              <span className="field-label">Other commitments</span>
              <textarea rows={2} value={a.availability.notes} onChange={(e) => availability('notes')(e.target.value)} />
            </label>
          </div>
        )}

        {current === 'statement' && (
          <div className="statement">
            <p className="question-prompt">Why do you want to work on AI safety, and what would you like to work on?</p>
            <p className="field-hint">
              {STATEMENT_MIN_WORDS}–{STATEMENT_MAX_WORDS} words. This goes to every program. Programs ask their own specific questions
              separately.
            </p>
            <p className="ai-rule">Write this yourself. LASR Labs, MATS, and SPAR don’t accept AI-written answers.</p>
            <textarea
              aria-label="Personal statement"
              rows={12}
              value={a.statement}
              onChange={(e) => dispatch({ type: 'statement', text: e.target.value })}
            />
            <StatementCount text={a.statement} />
          </div>
        )}

        <div className="form-foot">
          <span className="muted small">Saved as you type.</span>
          {next ? (
            <a className="btn btn-primary" href={href({ name: 'application', section: next.id })}>
              Next: {next.title}
            </a>
          ) : (
            <a className="btn btn-primary" href={href({ name: 'programs' })}>
              Choose programs
            </a>
          )}
        </div>
      </section>
    </div>
  );
}

function StatementCount({ text }: { text: string }) {
  const n = countWords(text);
  const ok = n >= STATEMENT_MIN_WORDS && n <= STATEMENT_MAX_WORDS;
  return <span className={ok || n === 0 ? 'counter' : 'counter over'}>{n} words</span>;
}
