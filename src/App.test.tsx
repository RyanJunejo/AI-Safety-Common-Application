import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { STORAGE_KEY } from './state/app';
import { Providers } from './state/store';

function renderApp() {
  return render(
    <Providers>
      <App />
    </Providers>,
  );
}

async function go(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('applying through the Common App', () => {
  beforeAll(() => {
    // Round status depends on the date; pin it to the day the program details were checked.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
  });
  afterAll(() => vi.useRealTimers());
  beforeEach(() => localStorage.clear());

  it('welcomes a first-time visitor with the three steps', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: 'Apply to AI safety fellowships with one application.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start my application' })).toHaveAttribute('href', '#/application/profile');
  });

  it('takes the sample applicant from the dashboard to a submitted application', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: /look around with a sample applicant/i }));

    expect(screen.getByRole('heading', { name: 'Welcome back, Talia' })).toBeInTheDocument();
    const row = screen.getByTestId('row-anthropic-fellows');
    expect(row).toHaveTextContent('2 of 3');
    expect(row).toHaveTextContent('In progress');

    // One more recommendation covers the program's requirement.
    await go('#/recommenders');
    await user.click(within(screen.getByTestId('rec-3')).getByRole('button', { name: 'Send request' }));
    expect(screen.getByTestId('rec-3')).toHaveTextContent('Requested');

    await go('#/programs/anthropic-fellows');
    const submit = screen.getByRole('button', { name: 'Submit to Anthropic Fellows' });
    expect(submit).toBeDisabled();
    await user.click(screen.getByLabelText(/review Anthropic's AI policy/i));
    await user.click(screen.getByLabelText(/Send my Common Application/i));
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(screen.getByTestId('submitted')).toHaveTextContent('Submitted');

    await user.click(screen.getByRole('link', { name: /See what Anthropic Fellows receives/ }));
    const packet = screen.getByTestId('packet');
    expect(packet).toHaveTextContent('Talia Nwosu-Berg (sample)');
    expect(packet).toHaveTextContent('Why are you interested in participating in the Fellows program?');
    expect(packet).toHaveTextContent(/Submitted/);

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.programs['anthropic-fellows'].submittedAt).toBeTruthy();
  });

  it('keeps closed rounds from being submitted', async () => {
    const user = userEvent.setup();
    renderApp();
    await go('#/programs/lasr');
    expect(screen.getByText('Applications are closed for this round.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save for next round' }));
    expect(screen.getByRole('button', { name: 'Submit to LASR Labs' })).toBeDisabled();
    expect(screen.getByTestId('blockers')).toHaveTextContent('This round is closed.');
  });

  it('filters the directory to open rounds', async () => {
    const user = userEvent.setup();
    renderApp();
    await go('#/programs');
    expect(screen.getAllByTestId(/^card-/)).toHaveLength(8);
    await user.click(screen.getByLabelText('Open now only'));
    expect(screen.getAllByTestId(/^card-/).map((c) => c.dataset.testid)).toEqual(['card-anthropic-fellows', 'card-iliad', 'card-iaps']);
  });

  it('points applicants to the forms that actually take applications', async () => {
    renderApp();
    await go('#/resources');
    const deadlines = screen.getByRole('region', { name: 'Deadlines and official links' });
    const row = within(deadlines).getByRole('row', { name: /Anthropic Fellows/ });
    expect(within(row).getByRole('link', { name: /Official application/ })).toHaveAttribute(
      'href',
      'https://airtable.com/appCHLjgoTUCJMLct/pagUhpiBE5KxoU3lX/form',
    );
  });
});
