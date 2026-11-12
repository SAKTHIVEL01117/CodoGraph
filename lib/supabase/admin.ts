/**
 * CodoGraph — Server-only Supabase Administrative Client.
 *
 * Uses SUPABASE_SECRET_KEY over HTTPS (never exposed to browser code) strictly for:
 * 1. Organization upsert synchronization with Clerk metadata.
 * 2. Background pipeline stage updates and batch graph storage where short-lived
 *    Clerk session JWTs (~60s) may outlive long repository parses post-response.
 *
 * All user-facing queries and deletes MUST use createSupabaseServerClient() so
 * PostgreSQL RLS enforces multi-tenant isolation.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createSupabaseAdminClient(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error('[CodoGraph] createSupabaseAdminClient() cannot run in a browser context.');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )?.trim();

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      '[CodoGraph] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. ' +
        'Ensure both are configured in .env.local for server-side Supabase operations.'
    );
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

