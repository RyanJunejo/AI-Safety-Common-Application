import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { PROGRAMS } from './data/inventory';
import { STORAGE_KEY } from './state/workspace';
import { AppProviders } from './state/providers';

function renderApp() {
  return render(
    <AppProviders>
      <App />
    </AppProviders>,
  );
}

async function go(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('applicant walkthrough', () => {
  beforeAll(() => {
    // Pin "now" to the verification date so round status matches the sources.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
  });
  afterAll(() => vi.useRealTimers());
  beforeEach(() => localStorage.clear());

  it('compares programs without showing any closed round as open', () => {
    renderApp();
    for (const p of PROGRAMS) {
      const badge = within(screen.getByTestId(`program-${p.id}`)).getByTestId(`round-${p.id}`);
      const expected = ['anthropic-fellows', 'iliad', 'iaps'].includes(p.id) ? 'open' : 'closed';
      expect(badge.dataset.state, p.id).toBe(expected);
      if (expected === 'closed') expect(badge).not.toHaveTextContent(/^Open/);
    }
  });

  it('rules out a closed round and a location conflict, then keeps them ruled out after a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp();

    const lasr = screen.getByTestId('program-lasr');
    await user.click(within(lasr).getByRole('button', { name: /rule out: closed round/i }));
    expect(within(lasr).getByText(/Round closed: deadline passed sep 20, 2026/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/hide location conflicts/i));
    expect(screen.queryByTestId('program-pibbss')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/hide location conflicts/i));

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.programs.lasr.status).toBe('ruled-out');

    unmount();
    renderApp();
    expect(within(screen.getByTestId('program-lasr')).getByText(/Round closed/)).toBeInTheDocument();
  });

  it('reuses a dossier artifact and separates original answers', async () => {
    const user = userEvent.setup();
    renderApp();

    await go('#/program/anthropic-fellows');
    const workLinks = await screen.findByTestId('q-anthropic-fellows-work-links');
    expect(workLinks).not.toHaveClass('done');
    await user.click(within(workLinks).getByLabelText(/probe-drift/));
    expect(workLinks).toHaveClass('done');

    await go('#/program/iliad');
    const original = await screen.findByTestId('section-original');
    expect(within(original).getByText(/two most difficult mathematical concepts/)).toBeInTheDocument();
    const tailor = screen.getByTestId('section-tailor');
    expect(within(tailor).getByText('Why are you applying to this program?')).toBeInTheDocument();
  });

  it('labels unpublished prompts as not published', async () => {
    renderApp();
    await go('#/program/pivotal');
    const unseen = await screen.findByTestId('not-yet-visible');
    const badge = within(unseen).getByText('Prompt not published');
    expect(badge).toHaveAttribute('data-visibility', 'unknown');
    expect(screen.queryByText('Exact prompt')).not.toBeInTheDocument();
  });

  it('exports the preparation checklist as Markdown', async () => {
    const user = userEvent.setup();
    const blobs: Blob[] = [];
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      blobs.push(b as Blob);
      return 'blob:checklist';
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderApp();
    await user.click(within(screen.getByTestId('program-lasr')).getByRole('button', { name: /rule out/i }));
    await user.click(screen.getByRole('button', { name: 'Export checklist' }));

    expect(blobs).toHaveLength(1);
    const md = await blobs[0]!.text();
    expect(md).toContain('# Application preparation checklist');
    expect(md).toContain('## Anthropic Fellows');
    expect(md).toMatch(/## Ruled out\n\n- LASR Labs — Round closed/);
    [create, revoke, click].forEach((s) => s.mockRestore());
  });
});

describe('status over time', () => {
  afterEach(() => vi.useRealTimers());

  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date(iso));
  };

  it('keeps Iliad open for its later cohort', async () => {
    at('2026-10-01T12:00:00Z');
    renderApp();
    expect(screen.getByTestId('round-iliad')).toHaveAttribute('data-state', 'open');
    expect(screen.getByTestId('round-iliad')).toHaveTextContent('Closes Oct 19, 2026 (Dec 2026 Fellowship)');
    // fireEvent is synchronous; user-event would wait on the faked setTimeout.
    fireEvent.click(screen.getByLabelText(/open rounds only/i));
    expect(screen.getByTestId('program-iliad')).toBeInTheDocument();
    expect(screen.queryByTestId('program-iaps')).not.toBeInTheDocument();
  });

  it('closes a round on an open page when its deadline passes', async () => {
    at('2026-09-27T23:58:00-04:00');
    renderApp();
    fireEvent.click(screen.getByLabelText(/open rounds only/i));
    expect(screen.getByTestId('round-iaps')).toHaveAttribute('data-state', 'open');

    // Step through time so each re-render can schedule its next wake-up.
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });
    }
    expect(screen.queryByTestId('program-iaps')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/open rounds only/i));
    expect(screen.getByTestId('round-iaps')).toHaveAttribute('data-state', 'closed');
    expect(screen.getByTestId('round-iaps')).toHaveTextContent('Deadline passed Sep 27, 2026');
  });

  it('presents a stale rolling status as unverified, not closed', async () => {
    at('2026-10-20T12:00:00Z');
    renderApp();
    expect(screen.getByTestId('round-anthropic-fellows')).toHaveAttribute('data-state', 'unknown');

    await go('#/program/anthropic-fellows');
    const callout = screen.getByTestId('round-callout');
    expect(callout).toHaveTextContent('Check the official page before applying');
    expect(screen.queryByText(/not accepting applications/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/closed round/)).not.toBeInTheDocument();
    expect(within(screen.getByTestId('q-anthropic-fellows-email')).getByText(/Exact prompt/)).toHaveTextContent(
      'Exact prompt · as of Sep 25, 2026',
    );

    await go('#/program/lasr');
    expect(screen.getByTestId('round-callout')).toHaveTextContent('This round is not accepting applications');
    expect(within(screen.getByTestId('q-lasr-email')).getByText(/Exact prompt/)).toHaveTextContent('Exact prompt · closed round');
  });
});
