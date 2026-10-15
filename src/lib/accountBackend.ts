import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertPreferences } from '../alerts/preferences';
import type { Focus, Kind } from '../catalog/types';
import { supabaseConfig } from './catalogSource';

export interface Session {
  userId: string;
  email: string;
  accessToken: string;
}

export interface AccountRecord {
  alertsEnabled: boolean;
  preferences: AlertPreferences;
}

export interface SavedRow {
  id: string;
  savedAt: string;
}

/**
 * Account storage. The browser only ever sends email (to sign in), alert preferences,
 * and saved or followed listing IDs. Row level security keeps each account private.
 */
export interface AccountBackend {
  sendSignInLink(email: string, redirectTo: string): Promise<void>;
  /** Finishes sign-in from the link's query parameters. */
  completeSignIn(params: URLSearchParams): Promise<Session>;
  getSession(): Promise<Session | null>;
  onSessionChange(listener: (session: Session | null) => void): () => void;
  signOut(): Promise<void>;
  /** Creates the account on first sign-in, with alerts off. */
  ensureAccount(): Promise<AccountRecord>;
  updateAccount(patch: Partial<AccountRecord>): Promise<AccountRecord>;
  listSaved(): Promise<SavedRow[]>;
  addSaved(ids: string[]): Promise<void>;
  removeSaved(id: string): Promise<void>;
  listFollows(): Promise<string[]>;
  follow(programId: string): Promise<void>;
  unfollow(programId: string): Promise<void>;
  /** Deletes the account and everything stored with it. */
  deleteAccount(): Promise<void>;
}

interface AccountRow {
  alerts_enabled: boolean;
  kinds: Kind[];
  focus: Focus[];
  any_location: boolean;
  countries: string[];
  remote: boolean;
}

function toRecord(row: AccountRow): AccountRecord {
  return {
    alertsEnabled: row.alerts_enabled,
    preferences: { kinds: row.kinds, focus: row.focus, location: { anyLocation: row.any_location, countries: row.countries, remote: row.remote } },
  };
}

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

function one<T>(result: { data: T | null; error: { message: string } | null }): T {
  const data = check(result);
  if (data === null) throw new Error('No account found.');
  return data;
}

function supabaseBackend(client: SupabaseClient): AccountBackend {
  const toSession = (s: { user: { id: string; email?: string }; access_token: string } | null): Session | null =>
    s ? { userId: s.user.id, email: s.user.email ?? '', accessToken: s.access_token } : null;
  const userId = async () => {
    const { data } = await client.auth.getSession();
    if (!data.session) throw new Error('Signed out. Sign in again.');
    return data.session.user.id;
  };

  return {
    async sendSignInLink(email, redirectTo) {
      const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
      if (error) throw new Error(error.message);
    },
    async completeSignIn(params) {
      const tokenHash = params.get('token_hash');
      const code = params.get('code');
      const failure = params.get('error_description');
      if (failure) throw new Error(failure);
      if (tokenHash) {
        const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: (params.get('type') as 'email' | 'magiclink' | null) ?? 'email' });
        if (error || !data.session) throw new Error(error?.message ?? 'This sign-in link has expired.');
        return toSession(data.session)!;
      }
      if (code) {
        const { data, error } = await client.auth.exchangeCodeForSession(code);
        if (error || !data.session) throw new Error(error?.message ?? 'This sign-in link has expired.');
        return toSession(data.session)!;
      }
      throw new Error('This sign-in link is incomplete.');
    },
    async getSession() {
      const { data } = await client.auth.getSession();
      return toSession(data.session);
    },
    onSessionChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(toSession(session)));
      return () => data.subscription.unsubscribe();
    },
    async signOut() {
      await client.auth.signOut({ scope: 'local' });
    },
    async ensureAccount() {
      return toRecord(one(await client.rpc('ensure_account').single<AccountRow>()));
    },
    async updateAccount(patch) {
      const row: Partial<AccountRow> = {};
      if (patch.alertsEnabled !== undefined) row.alerts_enabled = patch.alertsEnabled;
      if (patch.preferences) {
        const p = patch.preferences;
        Object.assign(row, { kinds: p.kinds, focus: p.focus, any_location: p.location.anyLocation, countries: p.location.countries, remote: p.location.remote });
      }
      const updated = one(await client.from('accounts').update(row).eq('user_id', await userId()).select().single<AccountRow>());
      return toRecord(updated);
    },
    async listSaved() {
      const rows = check(await client.from('saved_opportunities').select('opportunity_id, saved_at').order('saved_at'));
      return (rows ?? []).map((r) => ({ id: r.opportunity_id as string, savedAt: r.saved_at as string }));
    },
    async addSaved(ids) {
      if (ids.length === 0) return;
      check(await client.from('saved_opportunities').upsert(ids.map((id) => ({ opportunity_id: id })), { onConflict: 'user_id,opportunity_id', ignoreDuplicates: true }));
    },
    async removeSaved(id) {
      check(await client.from('saved_opportunities').delete().eq('opportunity_id', id));
    },
    async listFollows() {
      const rows = check(await client.from('followed_programs').select('program_id'));
      return (rows ?? []).map((r) => r.program_id as string);
    },
    async follow(programId) {
      check(await client.from('followed_programs').upsert({ program_id: programId }, { onConflict: 'user_id,program_id', ignoreDuplicates: true }));
    },
    async unfollow(programId) {
      check(await client.from('followed_programs').delete().eq('program_id', programId));
    },
    async deleteAccount() {
      const { data } = await client.auth.getSession();
      if (!data.session) throw new Error('Signed out. Sign in again to delete your account.');
      const res = await fetch('/api/account/delete', { method: 'POST', headers: { authorization: `Bearer ${data.session.access_token}` } });
      if (!res.ok) throw new Error('Could not delete your account. Try again, or email us.');
      await client.auth.signOut({ scope: 'local' });
    },
  };
}

/**
 * The Supabase-backed account store, or null when Supabase isn't configured (local
 * previews). The client library loads on demand, after the page renders.
 */
export async function loadAccountBackend(): Promise<AccountBackend | null> {
  const config = supabaseConfig();
  if (!config) return null;
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(config.url, config.anonKey, {
    auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storageKey: 'safetyapps-auth' },
  });
  return supabaseBackend(client);
}
