import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AlertPreferences } from '../alerts/preferences';
import { loadAccountBackend, type AccountBackend, type AccountRecord, type Session } from '../lib/accountBackend';

/**
 * Saved listings, sign-in, and alert settings.
 *
 * Signed out, the saved list lives in this browser. Signing in by email link merges
 * it into the account; after that the account is the source of truth and the browser
 * keeps a copy. Alerts stay off until the person turns them on.
 */

export const SAVED_KEY = 'safetyapps/saved/v1';
const PENDING_FOLLOW_KEY = 'safetyapps/pending-follow';

type Saved = Record<string, string>;

function readSaved(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) ?? 'null') as { version?: number; saved?: Saved } | null;
    if (raw?.version !== 1 || !raw.saved || typeof raw.saved !== 'object') return {};
    return Object.fromEntries(Object.entries(raw.saved).filter(([id, at]) => typeof id === 'string' && typeof at === 'string'));
  } catch {
    return {};
  }
}

/** A program to follow after sign-in, if the request is less than a day old. */
function readPendingFollow(): string | null {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_FOLLOW_KEY) ?? 'null') as { programId?: string; at?: number } | null;
    return raw?.programId && typeof raw.at === 'number' && Date.now() - raw.at < 86_400_000 ? raw.programId : null;
  } catch {
    return null;
  }
}

function writeSaved(saved: Saved) {
  try {
    if (Object.keys(saved).length) localStorage.setItem(SAVED_KEY, JSON.stringify({ version: 1, saved }));
    else localStorage.removeItem(SAVED_KEY);
  } catch {
    // Storage full or blocked: the in-memory list still works for this visit.
  }
}

export interface AccountState {
  /** `unavailable` when accounts aren't configured (local previews). */
  backend: 'loading' | 'unavailable' | 'ready';
  session: Session | null;
  account: AccountRecord | null;
  saved: Saved;
  follows: string[];
  /** True while merging and loading account data after sign-in. */
  syncing: boolean;
  error: string | null;
}

export interface Account extends AccountState {
  isSaved(id: string): boolean;
  toggleSave(id: string): Promise<void>;
  isFollowing(programId: string): boolean;
  follow(programId: string): Promise<void>;
  unfollow(programId: string): Promise<void>;
  /** Remembers a program to follow once the person signs in. */
  followAfterSignIn(programId: string): void;
  sendSignInLink(email: string): Promise<void>;
  completeSignIn(params: URLSearchParams): Promise<void>;
  signOut(): Promise<void>;
  setAlerts(on: boolean): Promise<void>;
  savePreferences(prefs: AlertPreferences): Promise<void>;
  deleteAccount(): Promise<void>;
  clearError(): void;
}

const AccountContext = createContext<Account | null>(null);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function AccountProvider({ backend: given, children }: { backend?: AccountBackend | null | Promise<AccountBackend | null>; children: ReactNode }) {
  const [state, setState] = useState<AccountState>(() => ({
    backend: 'loading',
    session: null,
    account: null,
    saved: readSaved(),
    follows: [],
    syncing: false,
    error: null,
  }));
  const backendRef = useRef<Promise<AccountBackend | null> | null>(null);
  backendRef.current ??= Promise.resolve(given === undefined ? loadAccountBackend() : given).catch(() => null);
  const signIns = useRef(new Map<string, Promise<void>>());
  // The signed-in person as of the latest auth event, ahead of the next render.
  const sessionRef = useRef<Session | null>(null);
  const loads = useRef(new Map<string, Promise<void>>());
  const update = (patch: Partial<AccountState> | ((s: AccountState) => Partial<AccountState>)) =>
    setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));

  /**
   * Loads the account. At sign-in (`merge`), the browser's anonymous saves and any
   * program waiting to be followed are added first. A restored session skips that: the
   * browser then only holds a copy of the account's list, and merging it back would
   * undo removals made on another device.
   */
  const loadAccount = useCallback(async (backend: AccountBackend, session: Session, merge: boolean) => {
    update({ session, syncing: true, error: null });
    try {
      const account = await backend.ensureAccount();
      if (merge) {
        await backend.addSaved(Object.keys(readSaved()));
        const pending = readPendingFollow();
        if (pending) await backend.follow(pending);
        localStorage.removeItem(PENDING_FOLLOW_KEY);
      }
      const [rows, follows] = await Promise.all([backend.listSaved(), backend.listFollows()]);
      const saved = Object.fromEntries(rows.map((r) => [r.id, r.savedAt]));
      writeSaved(saved);
      update({ account, saved, follows, syncing: false });
    } catch (err) {
      update({ syncing: false, error: `Couldn’t sync your account: ${message(err)}` });
    }
  }, []);

  const signedOut = useCallback(() => {
    sessionRef.current = null;
    // Don't leave the list behind on a shared computer; it's in the account.
    writeSaved({});
    update({ session: null, account: null, saved: {}, follows: [], syncing: false });
  }, []);

  /**
   * Switches this tab to `session`, wherever the sign-in happened: a restored session, the
   * email link opened in this tab, or the link opened in another tab (Supabase tells every
   * tab). Anonymous saves merge only when the tab was signed out, and never into a
   * different person's account. Concurrent calls for one person share a single load.
   */
  const adopt = useCallback(
    (backend: AccountBackend, session: Session, how: 'restore' | 'sign-in'): Promise<void> => {
      const inflight = loads.current.get(session.userId);
      if (inflight) return inflight;
      const previous = sessionRef.current;
      sessionRef.current = session;
      if (previous && previous.userId !== session.userId) {
        // Someone else signed in: drop the previous person's copy of their list.
        writeSaved({});
        update({ account: null, saved: {}, follows: [] });
      }
      const run = loadAccount(backend, session, how === 'sign-in' && previous === null).finally(() => loads.current.delete(session.userId));
      loads.current.set(session.userId, run);
      return run;
    },
    [loadAccount],
  );

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    void backendRef.current!.then(async (backend) => {
      if (cancelled) return;
      if (!backend) return update({ backend: 'unavailable' });
      update({ backend: 'ready' });
      const session = await backend.getSession().catch(() => null);
      if (session && !cancelled) await adopt(backend, session, 'restore');
      if (cancelled) return;
      unsubscribe = backend.onSessionChange((next) => {
        const current = sessionRef.current;
        // Signed out here or elsewhere, or the session couldn't be refreshed.
        if (!next) {
          if (current) signedOut();
          return;
        }
        // A refreshed token for the same person changes nothing here.
        if (current?.userId === next.userId) return;
        void adopt(backend, next, 'sign-in');
      });
    });
    // Keep tabs in step while signed out.
    const onStorage = (e: StorageEvent) => {
      if (e.key === SAVED_KEY) update({ saved: readSaved() });
    };
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener('storage', onStorage);
    };
  }, [adopt, signedOut]);

  const withBackend = async <T,>(fn: (b: AccountBackend) => Promise<T>): Promise<T> => {
    const backend = await backendRef.current!;
    if (!backend) throw new Error('Accounts aren’t available here.');
    return fn(backend);
  };

  const api = useMemo<Account>(() => {
    const signedIn = Boolean(state.session);
    return {
      ...state,
      isSaved: (id) => id in state.saved,
      async toggleSave(id) {
        const was = state.saved;
        const removing = id in was;
        const next = { ...was };
        if (removing) delete next[id];
        else next[id] = new Date().toISOString();
        writeSaved(next);
        update({ saved: next, error: null });
        if (!signedIn) return;
        try {
          await withBackend((b) => (removing ? b.removeSaved(id) : b.addSaved([id])));
        } catch (err) {
          writeSaved(was);
          update({ saved: was, error: `Couldn’t update your saved list: ${message(err)}` });
        }
      },
      isFollowing: (programId) => state.follows.includes(programId),
      async follow(programId) {
        update((s) => ({ follows: [...new Set([...s.follows, programId])], error: null }));
        try {
          await withBackend((b) => b.follow(programId));
        } catch (err) {
          update((s) => ({ follows: s.follows.filter((f) => f !== programId), error: `Couldn’t follow: ${message(err)}` }));
        }
      },
      async unfollow(programId) {
        update((s) => ({ follows: s.follows.filter((f) => f !== programId), error: null }));
        try {
          await withBackend((b) => b.unfollow(programId));
        } catch (err) {
          update((s) => ({ follows: [...s.follows, programId], error: `Couldn’t unfollow: ${message(err)}` }));
        }
      },
      followAfterSignIn(programId) {
        localStorage.setItem(PENDING_FOLLOW_KEY, JSON.stringify({ programId, at: Date.now() }));
      },
      async sendSignInLink(email) {
        await withBackend((b) => b.sendSignInLink(email.trim(), `${window.location.origin}/auth/confirm`));
      },
      completeSignIn(params) {
        // A sign-in link works once; don't spend it twice (React may run effects twice).
        const key = params.toString();
        const existing = signIns.current.get(key);
        if (existing) return existing;
        const run = withBackend(async (b) => {
          const session = await b.completeSignIn(params);
          await adopt(b, session, 'sign-in');
        });
        signIns.current.set(key, run);
        return run;
      },
      async signOut() {
        await withBackend((b) => b.signOut());
        signedOut();
      },
      async setAlerts(on) {
        const account = await withBackend((b) => b.updateAccount({ alertsEnabled: on }));
        update({ account });
      },
      async savePreferences(preferences) {
        const account = await withBackend((b) => b.updateAccount({ preferences }));
        update({ account });
      },
      async deleteAccount() {
        await withBackend((b) => b.deleteAccount());
        localStorage.removeItem(PENDING_FOLLOW_KEY);
        signedOut();
      },
      clearError: () => update({ error: null }),
    };
  }, [state, adopt, signedOut]);

  return <AccountContext.Provider value={api}>{children}</AccountContext.Provider>;
}

export function useAccount(): Account {
  const account = useContext(AccountContext);
  if (!account) throw new Error('useAccount must be used inside AccountProvider');
  return account;
}
