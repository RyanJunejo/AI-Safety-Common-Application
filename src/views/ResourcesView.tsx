import type { ReactNode } from 'react';
import type { AiStance } from '../data/schema';
import { CATALOG_PROGRAMS } from '../data/catalog';
import { ExternalLink, RoundPill } from '../components/ui';
import { href } from '../router';

const AI_RULE: Record<AiStance, string> = {
  prohibited: 'Not allowed',
  'own-draft-refinement': 'Only to refine your own draft',
  'section-specific': 'Not allowed on scored questions',
  'not-stated': 'No published policy',
};

const TOPICS = [
  { id: 'start', title: 'Start here' },
  { id: 'deadlines', title: 'Deadlines and official links' },
  { id: 'writing', title: 'Writing your answers' },
  { id: 'ai', title: 'AI help: each program’s rule' },
  { id: 'work', title: 'Work samples' },
  { id: 'references', title: 'References' },
  { id: 'interviews', title: 'Interviews and tests' },
  { id: 'more', title: 'Keep going' },
];

function Topic({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="topic" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      {children}
    </section>
  );
}

export function ResourcesView() {
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="resources">
      <aside className="toc" aria-label="Topics">
        <h1>Resources</h1>
        <ul>
          {TOPICS.map((t) => (
            <li key={t.id}>
              <button type="button" className="link-btn" onClick={() => jump(t.id)}>
                {t.title}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="topics">
        <Topic id="start" title="Start here">
          <p>
            Most AI safety fellowships are mentored research programs lasting one to four months. Many are paid, and most run more than
            one round a year. They’re a common first step into AI safety research, policy, and engineering roles.
          </p>
          <ul>
            <li>
              <strong>Apply to several.</strong> Several programs report accepting well under 10% of applicants, and a no from one says
              little about the next.
            </li>
            <li>
              <strong>Choose by fit.</strong> Look at the topic (technical, theory, or policy), where you’d need to live, whether it’s full
              time, and when it starts.
            </li>
            <li>
              <strong>Talk to someone.</strong> <ExternalLink href="https://aisafety.quest/">AI Safety Quest</ExternalLink> offers free
              one-on-one calls to help you find your path into AI safety.
            </li>
          </ul>
        </Topic>

        <Topic id="deadlines" title="Deadlines and official links">
          <p>
            Some programs have more than one link, such as a job posting and a separate application form. These are the forms that
            actually take applications.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Program</th>
                  <th scope="col">Status</th>
                  <th scope="col">Apply at</th>
                </tr>
              </thead>
              <tbody>
                {CATALOG_PROGRAMS.map((c) => (
                  <tr key={c.program.id}>
                    <th scope="row">
                      <a href={href({ name: 'program', id: c.program.id })}>{c.program.name}</a>
                    </th>
                    <td>
                      <RoundPill program={c.program} compact />
                    </td>
                    <td>
                      <ExternalLink href={c.program.applyUrl}>Official application</ExternalLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Topic>

        <Topic id="writing" title="Writing your answers">
          <ul>
            <li>
              <strong>Show your reasoning.</strong> Say what you think, why you think it, and how sure you are. Reviewers are reading for
              how you think more than for polish.
            </li>
            <li>
              <strong>Be specific.</strong> Name the paper, the result, the number, the link. “I measured X across 14 models” beats “I’m
              passionate about interpretability.”
            </li>
            <li>
              <strong>Show you understand the problem.</strong> These programs focus on catastrophic risks from advanced AI, such as
              misalignment, loss of control, and misuse. Connect your interest to those, not only to AI ethics in general.
            </li>
            <li>
              <strong>Show what you’ve already done about it.</strong> Projects you started on your own, things you’ve written, courses
              and reading groups. Time you’ve invested says more than enthusiasm.
            </li>
            <li>
              <strong>Answer “why us” for real.</strong> Mention the program’s mentors, format, or focus, and what you’d do there that you
              couldn’t do alone.
            </li>
          </ul>
        </Topic>

        <Topic id="ai" title="AI help: each program’s rule">
          <p>Rules differ, and some programs check. When in doubt, write it yourself.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Program</th>
                  <th scope="col">AI help on written answers</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {CATALOG_PROGRAMS.map(({ program: p }) => (
                  <tr key={p.id}>
                    <th scope="row">{p.name}</th>
                    <td>{AI_RULE[p.aiPolicy.stance]}</td>
                    <td>
                      {p.aiPolicy.stance !== 'not-stated' && p.aiPolicy.sourceUrl ? (
                        <ExternalLink href={p.aiPolicy.sourceUrl}>Policy</ExternalLink>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Topic>

        <Topic id="work" title="Work samples">
          <ul>
            <li>
              <strong>Pick one thing that shows ambition for your stage,</strong> and say what made it hard. Non-ML and cross-domain work
              counts.
            </li>
            <li>
              <strong>Check every link while logged out.</strong> Make repositories public, or share a representative sample.
            </li>
            <li>
              <strong>If you can’t share it, describe it concretely:</strong> what you built, for whom, and what changed because of it.
            </li>
            <li>
              <strong>Writing counts too.</strong> A clear post on LessWrong or the Alignment Forum about something you tried is a work
              sample reviewers can read.
            </li>
          </ul>
        </Topic>

        <Topic id="references" title="References">
          <ul>
            <li>
              <strong>Ask people who have seen your work up close and recently.</strong> A manager, supervisor, or collaborator is worth
              more than a well-known name who barely knows you.
            </li>
            <li>
              <strong>Ask early.</strong> Some programs contact references without notice and ask for a reply within a week.
            </li>
            <li>
              <strong>Brief them.</strong> Send your CV, the programs and deadlines, and two or three things you’d like them to speak to.
            </li>
          </ul>
        </Topic>

        <Topic id="interviews" title="Interviews and tests">
          <h3>Technical screens</h3>
          <p>
            Expect timed coding, take-home tasks, or short reasoning tests. MATS and IAPS both include timed reasoning tests. Many screens
            don’t allow AI tools, while some expect you to use them, so check. Practice under a timer, without an assistant, until it feels
            normal again.
          </p>
          <h3>Research interviews</h3>
          <p>
            You may be asked to brainstorm on a problem the team cares about: what you would measure, how you’d know it worked, and what
            could go wrong. Think aloud, and know the main research agendas of the organization you’re talking to, such as evaluations,
            control, or interpretability.
          </p>
          <h3>Behavioral interviews</h3>
          <p>
            Prepare three or four stories you can adapt to most questions: something you drove end to end, a mistake and what you changed,
            a disagreement, and a time you learned something hard quickly. If you’ve worked independently or run a company, draw on
            collaborators, customers, or contractors. An unconventional path is a strength here: it shows initiative.
          </p>
          <h3>Practice</h3>
          <p>
            Do mock interviews with peers, and use an AI model to generate practice questions. Practicing with AI is different from having
            it write your answers, which several programs don’t allow.
          </p>
        </Topic>

        <Topic id="more" title="Keep going">
          <ul className="links">
            <li>
              <ExternalLink href="https://jobs.80000hours.org/">80,000 Hours job board</ExternalLink>: roles and fellowships in AI safety
              and related fields.
            </li>
            <li>
              <ExternalLink href="https://aisafety.com/training">AISafety.com training programs</ExternalLink>: fellowships, bootcamps, and
              courses, online and in person.
            </li>
            <li>
              <ExternalLink href="https://bluedot.org/">BlueDot Impact</ExternalLink>: free online courses on AI safety.
            </li>
            <li>
              <ExternalLink href="https://www.lesswrong.com/">LessWrong</ExternalLink> and{' '}
              <ExternalLink href="https://www.alignmentforum.org/">AI Alignment Forum</ExternalLink>: read current research, and post your
              own.
            </li>
            <li>
              <ExternalLink href="https://aisafety.quest/">AI Safety Quest</ExternalLink>: free one-on-one navigation calls.
            </li>
          </ul>
        </Topic>
      </div>
    </div>
  );
}
