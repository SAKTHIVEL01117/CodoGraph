/**
 * CodoGraph — Organization Workspace Dashboard (Phase 2 & Phase 7).
 *
 * Implements the multi-tenant workspace view over Supabase HTTPS + Clerk JWT RLS:
 * - Resolves and syncs active Clerk organization via resolveOrgContext(true) + <OrgSync />.
 * - Executes unfiltered query via createSupabaseServerClient() (RLS enforces tenant isolation).
 * - Surfaces database/RLS errors loudly instead of masking them with seed data.
 */
import React from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAllAnalysesForOrg, type AnalysisRecord } from '@/lib/pipeline/storage';
import { OrgSync } from '@/components/org-sync';
import { WorkspaceDashboard } from '@/components/workspace-dashboard';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage() {
  const sessionAuth = await auth({ treatPendingAsSignedOut: false });
  if (!sessionAuth.userId) {
    redirect('/sign-in');
  }

  let orgId: string | null = sessionAuth.orgId ?? null;
  let orgName: string | null = sessionAuth.orgSlug || null;
  let initialRecords: AnalysisRecord[] = [];
  let initialError: string | null = null;

  try {
    const ctx = await resolveOrgContext(true);
    if (!ctx.isAuthenticated || !ctx.userId) {
      redirect('/sign-in');
    }
    orgId = ctx.orgId;
    orgName = ctx.orgName;
  } catch (err) {
    initialError =
      err instanceof Error ? err.message : 'Failed to synchronize organization session.';
    console.error('[CodoGraph Workspace] Organization resolution error:', err);
  }

  const sessionOrgId = sessionAuth.orgId ?? null;
  const isOrgActivating = !sessionOrgId && Boolean(orgId);

  if (sessionOrgId) {
    try {
      const supabase = await createSupabaseServerClient();
      initialRecords = await getAllAnalysesForOrg(supabase);
    } catch (err) {
      initialError =
        err instanceof Error ? err.message : 'Failed to load workspace analyses from Supabase.';
      console.error('[CodoGraph Workspace] Error loading analyses:', err);
    }
  }

  return (
    <>
      <OrgSync activeOrgId={orgId} />
      <WorkspaceDashboard
        initialOrgId={orgId}
        initialOrgName={orgName}
        initialRecords={initialRecords}
        initialError={initialError}
        isOrgActivating={isOrgActivating}
      />
    </>
  );
}
