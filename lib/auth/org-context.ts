/**
 * CodoGraph — Server-side organization context resolver.
 *
 * Resolves the authenticated user, their active organization, role, and metadata
 * from Clerk, and ensures public.organizations in Supabase stays in sync.
 *
 * Organization lifecycle (Phases 1 & 2):
 *  1. Unauthenticated visitors fail closed cleanly (never fabricate a fallback user/org).
 *  2. If the Clerk session carries an active orgId claim — resolve metadata & sync to Supabase.
 *  3. If not yet active in the session cookie, check existing organization memberships.
 *  4. If existing memberships exist, resolve the first organization so <OrgSync /> activates it.
 *  5. If zero memberships exist and autoProvision=true, create their first Clerk organization.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { syncOrganizationToSupabase } from '@/lib/supabase/sync-org';

export interface OrgContext {
  /** Clerk user ID, or null when signed out. */
  userId: string | null;
  /** Active Clerk organization ID, or null when no org is active. */
  orgId: string | null;
  /** Active organization name. */
  orgName: string | null;
  /** Active organization slug. */
  orgSlug: string | null;
  /** Active organization role (e.g. 'org:admin', 'org:member'), or null. */
  orgRole: string | null;
  /** Clerk session ID, or null when signed out. */
  sessionId: string | null;
  /** True when the user has an active authenticated session. */
  isAuthenticated: boolean;
}

const UNAUTHENTICATED_CONTEXT: OrgContext = {
  userId: null,
  orgId: null,
  orgName: null,
  orgSlug: null,
  orgRole: null,
  sessionId: null,
  isAuthenticated: false,
};

export async function resolveOrgContext(autoProvision = true): Promise<OrgContext> {
  const { userId, orgId, orgRole, orgSlug, sessionId } = await auth({
    treatPendingAsSignedOut: false,
  });

  if (!userId) {
    return UNAUTHENTICATED_CONTEXT;
  }

  const client = await clerkClient();

  // Case 1: Active organization claim is already present in Clerk session
  if (orgId) {
    let resolvedName = orgSlug || 'Workspace';
    let resolvedSlug = orgSlug ?? null;

    try {
      const org = await client.organizations.getOrganization({
        organizationId: orgId,
      });
      resolvedName = org.name || resolvedName;
      resolvedSlug = org.slug || resolvedSlug;
    } catch (err) {
      console.warn(`[CodoGraph] Could not fetch Clerk organization metadata for ${orgId}:`, err);
    }

    await syncOrganizationToSupabase({
      id: orgId,
      name: resolvedName,
      slug: resolvedSlug,
    });

    return {
      userId,
      orgId,
      orgName: resolvedName,
      orgSlug: resolvedSlug,
      orgRole: orgRole ?? null,
      sessionId: sessionId ?? null,
      isAuthenticated: true,
    };
  }

  // Case 2: Signed in, but orgId claim is not yet active on the current session
  const memberships = await client.users.getOrganizationMembershipList({
    userId,
    limit: 10,
  });

  if (memberships.data && memberships.data.length > 0) {
    const first = memberships.data[0];
    const resolvedName = first.organization.name || first.organization.slug || 'Workspace';
    const resolvedSlug = first.organization.slug || null;

    await syncOrganizationToSupabase({
      id: first.organization.id,
      name: resolvedName,
      slug: resolvedSlug,
    });

    return {
      userId,
      orgId: first.organization.id,
      orgName: resolvedName,
      orgSlug: resolvedSlug,
      orgRole: first.role,
      sessionId: sessionId ?? null,
      isAuthenticated: true,
    };
  }

  // Case 3: First-time registration with zero memberships
  if (!autoProvision) {
    return {
      userId,
      orgId: null,
      orgName: null,
      orgSlug: null,
      orgRole: null,
      sessionId: sessionId ?? null,
      isAuthenticated: true,
    };
  }

  const user = await client.users.getUser(userId);
  const displayName =
    user.fullName ||
    user.firstName ||
    user.username ||
    user.emailAddresses[0]?.emailAddress?.split('@')[0] ||
    'Team';
  const defaultOrgName = `${displayName}'s Organization`;

  const newOrg = await client.organizations.createOrganization({
    name: defaultOrgName,
    createdBy: userId,
  });

  await syncOrganizationToSupabase({
    id: newOrg.id,
    name: newOrg.name || defaultOrgName,
    slug: newOrg.slug || null,
  });

  return {
    userId,
    orgId: newOrg.id,
    orgName: newOrg.name || defaultOrgName,
    orgSlug: newOrg.slug || null,
    orgRole: 'org:admin',
    sessionId: sessionId ?? null,
    isAuthenticated: true,
  };
}

/**
 * Asserts that the visitor is authenticated; throws if unauthenticated.
 */
export async function requireAuth(): Promise<OrgContext> {
  const ctx = await resolveOrgContext(false);
  if (!ctx.isAuthenticated || !ctx.userId) {
    throw new Error('[UNAUTHORIZED] Authenticated Clerk session required.');
  }
  return ctx;
}

/**
 * Asserts that the visitor is authenticated and possesses an active organization.
 */
export async function requireOrg(): Promise<OrgContext & { orgId: string }> {
  const ctx = await resolveOrgContext(true);
  if (!ctx.isAuthenticated || !ctx.userId) {
    throw new Error('[UNAUTHORIZED] Authenticated Clerk session required.');
  }
  if (!ctx.orgId) {
    throw new Error('[FORBIDDEN] Active organization membership required.');
  }
  return ctx as OrgContext & { orgId: string };
}
