import { handleDeleteAccount } from '../../server/handlers.js';
import { ConfigError, requireEnv } from '../../server/runtime.js';

/** Deletes the signed-in person's account and everything stored with it. */
export async function POST(request: Request): Promise<Response> {
  try {
    return await handleDeleteAccount(request, {
      supabaseUrl: requireEnv('VITE_SUPABASE_URL'),
      anonKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? requireEnv('VITE_SUPABASE_ANON_KEY'),
      serviceRoleKey: process.env.SUPABASE_SECRET_KEY ?? requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    });
  } catch (err) {
    if (err instanceof ConfigError) return Response.json({ error: err.message }, { status: 500 });
    throw err;
  }
}
