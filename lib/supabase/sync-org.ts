/**
 * CodoGraph — Synchronize Active Organization to Supabase Postgres.
 *
 * Ensures that the active Clerk organization exists in public.organizations,
 * satisfying foreign key constraints for projects and analyses.
 */
import { Client } from 'pg';

export async function syncOrganizationToSupabase(org: {
  id: string;
  name: string;
  slug?: string | null;
}): Promise<void> {
  if (!org.id) return;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return;

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query(
      `insert into public.organizations (id, name, slug)
       values ($1, $2, $3)
       on conflict (id) do update set
         name = excluded.name,
         slug = coalesce(excluded.slug, public.organizations.slug),
         updated_at = now();`,
      [org.id, org.name || 'Organization', org.slug || null]
    );
  } catch (err) {
    console.warn('[CodoGraph] Organization sync warning:', err);
  } finally {
    try {
      await client.end();
    } catch {}
  }
}

