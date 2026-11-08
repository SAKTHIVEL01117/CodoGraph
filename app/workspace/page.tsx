/**
 * CodoGraph — Organization Workspace Dashboard (Phase 2 & Phase 7).
 *
 * Implements the workspace view matching the reference layout:
 * - Subheader: Organization name (from user credentials) + analyses count.
 * - Ingestion Form: Paste public GitHub repo URL and trigger pipeline.
 * - Monospace developer table with columns: Repository | State | Commit | Started | Finished.
 * - Multiline error diagnostic under failed state.
 * - Live real-time updates via Supabase Realtime broadcast on org:<orgId>.
 * - Stale run detection marking abandoned runs past 3 minutes old.
 * - Multi-tenant isolation verified by database RLS policies.
 */
import React from 'react';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { getAllAnalysesForOrg, type AnalysisRecord } from '@/lib/pipeline/storage';
import { WorkspaceDashboard } from '@/components/workspace-dashboard';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage() {
  const ctx = await resolveOrgContext(false);
  const effectiveOrgId =
    ctx.orgId ||
    (process.env.NODE_ENV !== 'production' ? 'org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot' : null);

  let initialRecords: AnalysisRecord[] = [];
  if (effectiveOrgId) {
    try {
      initialRecords = await getAllAnalysesForOrg(effectiveOrgId);
    } catch {
      // Fallback handled in component
    }
  }

  return (
    <WorkspaceDashboard
      initialOrgId={effectiveOrgId}
      initialRecords={initialRecords}
    />
  );
}
