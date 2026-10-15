import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { memoryBackend } from '../test/memoryBackend';
import { AccountProvider, SAVED_KEY, useAccount, type Account } from './account';

function mount(account: ReturnType<typeof memoryBackend>) {
  const ref: { current: Account | null } = { current: null };
  function Probe() {
    ref.current = useAccount();
    return null;
  }
  render(
    <AccountProvider backend={account.backend}>
      <Probe />
    </AccountProvider>,
  );
  return ref;
}

/** Signs in as if from another tab: Supabase tells every tab about the new session. */
async function signInElsewhere(account: ReturnType<typeof memoryBackend>, email: string) {
  await act(async () => {
    await account.backend.sendSignInLink(email, 'http://localhost/auth/confirm');
    await account.backend.completeSignIn(new URLSearchParams({ token_hash: account.server.links.at(-1)!.token }));
  });
}

describe('signing in from another tab', () => {
  it('switches this tab to the account, so later saves reach it', async () => {
    const account = memoryBackend();
    const tab = mount(account);
    await waitFor(() => expect(tab.current!.backend).toBe('ready'));
    await act(async () => tab.current!.toggleSave('training-before'));

    await signInElsewhere(account, 'ada@example.com');
    await waitFor(() => expect(tab.current!.session?.email).toBe('ada@example.com'));
    await waitFor(() => expect(tab.current!.syncing).toBe(false));
    await act(async () => tab.current!.toggleSave('training-after'));

    // Saves from before (merged at sign-in) and after both reach the account.
    expect([...account.server.saved.get('user:ada@example.com')!.keys()].sort()).toEqual(['training-after', 'training-before']);
  });

  it('never merges one person’s list into another’s', async () => {
    const account = memoryBackend();
    account.restoreSession('ada@example.com');
    account.server.saved.set('user:ada@example.com', new Map([['training-ada', '2026-10-01T00:00:00.000Z']]));
    const tab = mount(account);
    await waitFor(() => expect(Object.keys(tab.current!.saved)).toEqual(['training-ada']));

    await signInElsewhere(account, 'bob@example.com');
    await waitFor(() => expect(tab.current!.session?.email).toBe('bob@example.com'));
    await waitFor(() => expect(tab.current!.syncing).toBe(false));
    expect(account.server.saved.get('user:bob@example.com')?.size ?? 0).toBe(0);
    expect(tab.current!.saved).toEqual({});
    expect(localStorage.getItem(SAVED_KEY)).toBeNull();
  });

  it('loads the account once when the link is opened in this tab', async () => {
    const account = memoryBackend();
    const tab = mount(account);
    await waitFor(() => expect(tab.current!.backend).toBe('ready'));
    let ensures = 0;
    const ensure = account.backend.ensureAccount;
    account.backend.ensureAccount = () => {
      ensures += 1;
      return ensure();
    };
    await act(async () => tab.current!.sendSignInLink('ada@example.com'));
    // The auth event and the confirm page both ask to load the account.
    await act(async () => tab.current!.completeSignIn(new URLSearchParams({ token_hash: account.server.links[0]!.token })));
    expect(tab.current!.session?.email).toBe('ada@example.com');
    expect(ensures).toBe(1);
  });
});
