/**
 * CodoGraph — Supabase browser-side client factory.
 *
 * Uses the native Supabase third-party authentication integration with Clerk.
 * The `accessToken` option is called by Supabase on every request; we return
 * the active Clerk session token so Postgres RLS policies can verify org claims.
 *
 * Usage:
 *   const { session } = useSession();
 *   const supabase = createSupabaseClient(session);
 *   // OR:
 *   const { getToken } = useAuth();
 *   const supabase = createSupabaseClient(getToken);
 *
 * Session ownership belongs entirely to Clerk.
 * Supabase client is configured with persistSession: false to prevent competing
 * auth state or duplicate cookie issuance.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type ClerkTokenProvider =
  | { getToken: (options?: { template?: string }) => Promise<string | null> }
  | (() => Promise<string | null>)
  | null
  | undefined;

/**
 * Creates a browser-side Supabase client authenticated with the current Clerk session.
 * Pass the Clerk `session` from `useSession()` or the `getToken` function from `useAuth()`.
 *
 * - Authenticated requests forward the Clerk JWT carrying sub, org_id, and org_role.
 * - Anonymous requests (no session) return null token and are evaluated safely by RLS.
 * - Never expose the Supabase service-role key here.
 */
export function createSupabaseClient(tokenProvider?: ClerkTokenProvider): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      '[CodoGraph] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
        'Ensure these are set in .env.local.'
    );
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    accessToken: async () => {
      if (!tokenProvider) return null;
      if (typeof tokenProvider === 'function') {
        return tokenProvider();
      }
      return tokenProvider.getToken();
    },
  });
}

/** Backward-compatible alias for existing imports */
export const createSupabaseBrowserClient = createSupabaseClient;
