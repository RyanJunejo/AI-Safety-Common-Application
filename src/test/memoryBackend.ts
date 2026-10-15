import { DEFAULT_PREFERENCES } from '../alerts/preferences';
import type { AccountBackend, AccountRecord, Session } from '../lib/accountBackend';

/**
 * An in-memory stand-in for Supabase, for UI tests. It keeps one "server" per test
 * and records every write, so tests can check what left the browser.
 */
export function memoryBackend() {
  const server = {
    accounts: new Map<string, AccountRecord>(),
    saved: new Map<string, Map<string, string>>(),
    follows: new Map<string, Set<string>>(),
    links: [] as { email: string; redirectTo: string; token: string }[],
    writes: [] as { op: string; payload: unknown }[],
    deleted: [] as string[],
  };
  let session: Session | null = null;
  const listeners = new Set<(s: Session | null) => void>();

  const me = () => {
    if (!session) throw new Error('Signed out');
    return session.userId;
  };
  const savedOf = (id: string) => server.saved.get(id) ?? server.saved.set(id, new Map()).get(id)!;
  const followsOf = (id: string) => server.follows.get(id) ?? server.follows.set(id, new Set()).get(id)!;
  const write = (op: string, payload: unknown) => server.writes.push({ op, payload });

  const backend: AccountBackend = {
    async sendSignInLink(email, redirectTo) {
      const token = `token-${server.links.length + 1}`;
      server.links.push({ email, redirectTo, token });
      write('sendSignInLink', { email });
    },
    async completeSignIn(params) {
      const link = server.links.find((l) => l.token === params.get('token_hash'));
      if (!link) throw new Error('Email link is invalid or has expired');
      server.links = server.links.filter((l) => l !== link);
      session = { userId: `user:${link.email}`, email: link.email, accessToken: 'access' };
      listeners.forEach((l) => l(session));
      return session;
    },
    async getSession() {
      return session;
    },
    onSessionChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async signOut() {
      session = null;
      listeners.forEach((l) => l(null));
    },
    async ensureAccount() {
      const id = me();
      if (!server.accounts.has(id)) server.accounts.set(id, { alertsEnabled: false, preferences: DEFAULT_PREFERENCES });
      return server.accounts.get(id)!;
    },
    async updateAccount(patch) {
      const id = me();
      write('updateAccount', patch);
      const next = { ...server.accounts.get(id)!, ...patch };
      server.accounts.set(id, next);
      return next;
    },
    async listSaved() {
      return [...savedOf(me()).entries()].map(([id, savedAt]) => ({ id, savedAt }));
    },
    async addSaved(ids) {
      write('addSaved', ids);
      const saved = savedOf(me());
      for (const id of ids) if (!saved.has(id)) saved.set(id, '2026-10-09T12:00:00.000Z');
    },
    async removeSaved(id) {
      write('removeSaved', id);
      savedOf(me()).delete(id);
    },
    async listFollows() {
      return [...followsOf(me())];
    },
    async follow(programId) {
      write('follow', programId);
      followsOf(me()).add(programId);
    },
    async unfollow(programId) {
      write('unfollow', programId);
      followsOf(me()).delete(programId);
    },
    async deleteAccount() {
      const id = me();
      server.accounts.delete(id);
      server.saved.delete(id);
      server.follows.delete(id);
      server.deleted.push(id);
      session = null;
    },
  };
  /** Starts as if the person signed in on an earlier visit. */
  const restoreSession = (email: string) => {
    session = { userId: `user:${email}`, email, accessToken: 'access' };
  };
  return { backend, server, restoreSession };
}
