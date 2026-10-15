import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES } from './alerts/preferences';
import { App } from './App';
import { snapshotCatalog, type CatalogSource } from './lib/catalogSource';
import { navigate } from './router';
import { SAVED_KEY } from './state/account';
import { Providers } from './state/Providers';
import { memoryBackend } from './test/memoryBackend';

const ILIAD_JANUARY = 'training-rec49VTc9xWkCdxwB'; // open, closes Nov 16, 2026
const ANTHROPIC_JANUARY = 'training-recou3Ia7BYOSMxfd'; // open, closes Oct 18, 2026
const MATS_FAMILY = 'training-receOAca5S5nHnSpU';

async function liveCatalog(): Promise<CatalogSource> {
  return { ...(await snapshotCatalog()), preview: false };
}

function renderApp(path = '/', account: ReturnType<typeof memoryBackend> | null = memoryBackend()) {
  window.history.replaceState(null, '', path);
  const utils = render(
    <Providers catalog={liveCatalog()} account={account?.backend ?? null}>
      <App />
    </Providers>,
  );
  return { ...utils, server: account?.server };
}

async function go(path: string) {
  await act(async () => navigate(path));
}

beforeAll(() => {
  // Statuses depend on the date; pin it to the day of the catalog snapshot.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
});
afterAll(() => vi.useRealTimers());

describe('browsing', () => {
  it('opens with “Find your next step” and the four categories', async () => {
    renderApp();
    expect(screen.getByRole('heading', { level: 1, name: 'Find your next step.' })).toBeInTheDocument();
    const categories = screen.getByRole('list', { name: 'Categories' });
    expect(within(categories).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/programs', '/courses', '/jobs', '/communities']);
    expect(await within(categories).findByText('16 open now')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Closing soon' })).toBeInTheDocument();
  });

  it('filters by focus and location, and keeps filters in the URL', async () => {
    const user = userEvent.setup();
    renderApp('/programs');
    await screen.findByTestId('result-count');
    await user.click(screen.getByLabelText('Governance'));
    expect(window.location.search).toBe('?focus=governance');
    const cards = screen.getAllByTestId(/^card-/);
    expect(cards.length).toBeGreaterThan(5);
    for (const card of cards) expect(within(card).getByText('Governance')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Country' }), 'UK');
    expect(window.location.search).toBe('?focus=governance&country=UK');
    expect(screen.getByText('Listings without a known location show only when no location is chosen.')).toBeInTheDocument();
  });

  it('turns the focus filter off for jobs and communities', async () => {
    renderApp('/jobs?focus=technical');
    await screen.findByTestId('result-count');
    expect(screen.getByLabelText('Technical')).toBeDisabled();
    expect(screen.getByText('Jobs and communities aren’t tagged by focus.')).toBeInTheDocument();
    expect(screen.getByTestId('result-count')).toHaveTextContent('120 results');
  });

  it('shows a listing’s published deadline, source, and attribution', async () => {
    renderApp(`/opportunities/${ILIAD_JANUARY}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Iliad Fellowship: January 2027' })).toBeInTheDocument();
    expect(screen.getByText('Nov 16, 2026, as published')).toBeInTheDocument();
    expect(screen.getByText(/Check the/)).toHaveTextContent(/The deadline is the date as published. Check the official page .* for the exact closing time and timezone./);
    expect(screen.getByRole('link', { name: /Official page/ })).toHaveAttribute('href', 'https://www.iliad.ac/upcoming-events');
    const provenance = screen.getByText(/Listed on/);
    expect(provenance).toHaveTextContent('last updated there Oct 9, 2026');
    expect(within(provenance).getByRole('link', { name: /AISafety\.com/ })).toHaveAttribute('href', 'https://aisafety.com/training');
    // Part of a recurring program, with its other rounds.
    expect(screen.getByRole('heading', { name: 'Other rounds of Iliad Fellowship' })).toBeInTheDocument();
  });

  it('keeps the researched preparation notes, with their check date and without old deadlines', async () => {
    renderApp(`/opportunities/${MATS_FAMILY}`);
    const notes = await screen.findByTestId('prep-notes');
    expect(notes).toHaveTextContent('checked Sep 25, 2026');
    expect(notes).toHaveTextContent('Not allowed on written answers.');
    expect(notes).not.toHaveTextContent('Sep 6, 2026');
    expect(screen.getByText('No round is open right now. Follow MATS to get an email when the next one opens.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MATS: Winter 2027' })).toBeInTheDocument();
  });

  it('sends old Common App links to the new pages', async () => {
    renderApp('/#/resources');
    await waitFor(() => expect(window.location.pathname).toBe('/guides'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Guides' })).toBeInTheDocument();
    expect(screen.queryByText('Deadlines and official links')).not.toBeInTheDocument();
  });

  it('redirects every hidden Common App route', async () => {
    const { legacyRedirect } = await import('./router');
    expect(legacyRedirect('#/programs/mats')).toBe(`/opportunities/${MATS_FAMILY}`);
    expect(legacyRedirect('#/programs/iliad')).toBe('/opportunities/training-recraUtUpAHxmv1FL');
    expect(legacyRedirect('#/programs')).toBe('/programs');
    expect(legacyRedirect('#/application/profile')).toBe('/');
    expect(legacyRedirect('#/recommenders')).toBe('/');
    expect(legacyRedirect('#/for-programs/mats')).toBe('/');
    expect(legacyRedirect('#about')).toBeNull();
  });
});

describe('saving and accounts', () => {
  it('saves without an account, in this browser', async () => {
    const user = userEvent.setup();
    renderApp(`/opportunities/${ILIAD_JANUARY}`);
    await user.click(await screen.findByRole('button', { name: 'Save: Iliad Fellowship: January 2027' }));
    expect(JSON.parse(localStorage.getItem(SAVED_KEY)!).saved).toHaveProperty(ILIAD_JANUARY);

    await go('/saved');
    expect(await screen.findByTestId(`card-${ILIAD_JANUARY}`)).toBeInTheDocument();
    expect(screen.getByText(/Saved in this browser only/)).toBeInTheDocument();
  });

  it('syncs anonymous saves at sign-in, and turns on alerts only when asked', async () => {
    // Data from the old Common App prototype stays in the browser.
    localStorage.setItem('ai-safety-common-app/v1', JSON.stringify({ version: 1, application: { statement: 'My private essay' } }));
    const user = userEvent.setup();
    const { server } = renderApp(`/opportunities/${ILIAD_JANUARY}`);
    await user.click(await screen.findByRole('button', { name: /^Save: Iliad/ }));
    await go(`/opportunities/${ANTHROPIC_JANUARY}`);
    await user.click(await screen.findByRole('button', { name: /^Save: Anthropic/ }));

    await go('/account');
    expect(await screen.findByText(/The 2 listings saved in this browser move to your account/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
    expect(await screen.findByText(/We sent a sign-in link to ada@example.com/)).toBeInTheDocument();
    expect(server!.links[0]).toMatchObject({ email: 'ada@example.com', redirectTo: 'http://localhost:3000/auth/confirm' });

    // Opening the emailed link.
    await go(`/auth/confirm?token_hash=${server!.links[0]!.token}&type=email`);
    expect(await screen.findByText('You’re signed in. Your saved list (2) is synced.')).toBeInTheDocument();
    expect([...server!.saved.get('user:ada@example.com')!.keys()].sort()).toEqual([ANTHROPIC_JANUARY, ILIAD_JANUARY].sort());
    expect(JSON.stringify(server!.writes)).not.toContain('My private essay');

    // Alerts need their own explicit opt-in.
    expect(server!.accounts.get('user:ada@example.com')!.alertsEnabled).toBe(false);
    const alerts = screen.getByTestId('alerts');
    const turnOn = within(alerts).getByRole('button', { name: 'Turn on alerts' });
    expect(turnOn).toBeDisabled();
    await user.click(within(alerts).getByLabelText(/Email these alerts to ada@example.com/));
    await user.click(turnOn);
    expect(await within(alerts).findByText('Alerts are on')).toBeInTheDocument();
    expect(server!.accounts.get('user:ada@example.com')!.alertsEnabled).toBe(true);
  });

  it('saves alert preferences and explains where focus does not apply', async () => {
    const user = userEvent.setup();
    const account = memoryBackend();
    renderApp('/account', account);
    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
    await go(`/auth/confirm?token_hash=${account.server.links[0]!.token}&type=email`);
    await screen.findByRole('heading', { name: 'What to alert you about' });

    expect(screen.getByText(/Jobs and communities aren’t tagged by focus in the source data/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('Communities'));
    await user.click(screen.getByLabelText('Only places that suit me'));
    await user.click(screen.getByLabelText('Remote or online'));
    expect(screen.getByRole('button', { name: 'Save preferences' })).toBeDisabled();
    expect(screen.getByText('Choose a country, remote, or any location.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Countries I can be in'), 'Germany');
    await user.click(screen.getByRole('button', { name: 'Save preferences' }));
    expect(await screen.findByText('Preferences saved')).toBeInTheDocument();
    expect(account.server.accounts.get('user:ada@example.com')!.preferences).toEqual({
      kinds: ['program', 'course', 'job'],
      focus: ['technical', 'governance', 'general'],
      location: { anyLocation: false, countries: ['Germany'], remote: false },
    });
  });

  it('follows a recurring program after signing in from its page', async () => {
    const user = userEvent.setup();
    const account = memoryBackend();
    renderApp(`/opportunities/${MATS_FAMILY}`, account);
    await user.click(await screen.findByRole('button', { name: 'Follow MATS' }));
    expect(window.location.pathname).toBe('/account');
    expect(await screen.findByText(/Sign in to follow MATS/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
    await go(`/auth/confirm?token_hash=${account.server.links[0]!.token}&type=email`);
    expect(await screen.findByRole('link', { name: 'MATS (Machine Alignment, Transparency, and Security)' })).toBeInTheDocument();
    expect([...account.server.follows.get('user:ada@example.com')!]).toEqual([MATS_FAMILY]);
  });

  it('doesn’t bring back items removed on another device', async () => {
    const account = memoryBackend();
    account.restoreSession('ada@example.com');
    account.server.accounts.set('user:ada@example.com', { alertsEnabled: false, preferences: DEFAULT_PREFERENCES });
    account.server.saved.set('user:ada@example.com', new Map([[ILIAD_JANUARY, '2026-10-01T00:00:00.000Z']]));
    // This browser's copy still has a listing that was since removed elsewhere.
    localStorage.setItem(SAVED_KEY, JSON.stringify({ version: 1, saved: { [ILIAD_JANUARY]: 'x', [ANTHROPIC_JANUARY]: 'x' } }));
    renderApp('/saved', account);
    expect(await screen.findByText(/Synced to ada@example.com/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Saved (1)' })).toBeInTheDocument());
    expect([...account.server.saved.get('user:ada@example.com')!.keys()]).toEqual([ILIAD_JANUARY]);
    expect(Object.keys(JSON.parse(localStorage.getItem(SAVED_KEY)!).saved)).toEqual([ILIAD_JANUARY]);
  });

  it('rejects a used or wrong sign-in link', async () => {
    renderApp('/auth/confirm?token_hash=forged&type=email');
    expect(await screen.findByRole('heading', { name: 'That sign-in link didn’t work' })).toBeInTheDocument();
    expect(screen.getByText('Email link is invalid or has expired')).toBeInTheDocument();
  });

  it('deletes the account and clears this browser', async () => {
    const user = userEvent.setup();
    const account = memoryBackend();
    renderApp(`/opportunities/${ILIAD_JANUARY}`, account);
    await user.click(await screen.findByRole('button', { name: /^Save: Iliad/ }));
    await go('/account');
    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
    await go(`/auth/confirm?token_hash=${account.server.links[0]!.token}&type=email`);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(await screen.findByRole('button', { name: 'Delete my account' }));
    expect(await screen.findByText('Your account and everything stored with it have been deleted.')).toBeInTheDocument();
    expect(account.server.deleted).toEqual(['user:ada@example.com']);
    expect(localStorage.getItem(SAVED_KEY)).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('hides accounts in a preview without Supabase', async () => {
    renderApp('/account', null);
    expect(await screen.findByText(/Sign-in and email alerts aren’t available in this preview/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});
