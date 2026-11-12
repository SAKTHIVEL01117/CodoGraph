/**
 * CodoGraph — Supabase server-side client factory.
 *
 * Uses the native Supabase third-party authentication integration.
 * Clerk JWT is forwarded via the `accessToken` option — the official
 * pattern for @supabase/supabase-js ≥ 2.x with a third-party identity provider.
 *
 * Session ownership belongs entirely to Clerk; Supabase Auth is NOT used.
 * Storage of tokens in cookies/localStorage is disabled to avoid competing sessions.
 */
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Creates a server-side Supabase client that forwards the active Clerk session
 * token with every request, enabling org-scoped RLS policies in Postgres.
 *
 * Call this inside a Server Component, Server Action, or Route Handler.
 * Never call this in a client component or share one instance across requests.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      '[CodoGraph] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
        'Ensure these are set in .env.local before starting the server.'
    );
  }

  // Capture the Clerk auth state once for the current request
  const clerkAuth = await auth({ treatPendingAsSignedOut: false });

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    // Native third-party auth integration: Supabase forwards the Clerk session
    // token carrying sub, role ('authenticated'), and active org claims (o.id / org_id).
    accessToken: async () => {
      return clerkAuth.getToken();
    },
  });
}
