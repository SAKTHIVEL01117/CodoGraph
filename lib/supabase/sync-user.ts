/**
 * CodoGraph — Synchronize Clerk User Profile into Supabase Postgres.
 *
 * Upserts the authenticated Clerk user into public.users in Supabase so that
 * user auth/profile details are visible and queryable in Supabase.
 */
import { currentUser } from '@clerk/nextjs/server';
import { createSupabaseServerClient } from './server';

export async function syncUserToSupabase(): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: 'No active Clerk user' };

    const supabase = await createSupabaseServerClient();
    const primaryEmail = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress || user.emailAddresses[0]?.emailAddress || '';

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Developer';

    const { error } = await supabase
      .from('users')
      .upsert({
        id: user.id,
        email: primaryEmail,
        full_name: fullName,
        image_url: user.imageUrl,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (error) {
      // Non-fatal if table not created yet in Supabase
      console.warn('[CodoGraph] Supabase user sync warning:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.warn('[CodoGraph] Supabase user sync exception:', err);
    return { success: false, error: String(err) };
  }
}

