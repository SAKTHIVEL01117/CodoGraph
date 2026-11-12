/**
 * CodoGraph — Synchronize Active Organization to Supabase Postgres.
 *
 * Ensures that the active Clerk organization exists in public.organizations,
 * satisfying foreign key constraints for projects and analyses over HTTPS.
 */
import { createSupabaseAdminClient } from './admin.ts';

export async function syncOrganizationToSupabase(org: {
  id: string;
  name: string;
  slug?: string | null;
}): Promise<void> {
  if (!org.id) return;

  const admin = createSupabaseAdminClient();
  const payload = {
    id: org.id,
    name: org.name || 'Organization',
    slug: org.slug ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from('organizations')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    throw new Error(
      `[CodoGraph] Failed to synchronize organization ${org.id} to Supabase: ${error.message}`
    );
  }
}
