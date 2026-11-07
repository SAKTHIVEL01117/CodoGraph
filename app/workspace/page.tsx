/**
 * CodoGraph — Organization Workspace Dashboard (Phase 2).
 *
 * Implements the workspace view matching the exact reference layout:
 * - Subheader: Organization name (from user credentials) + analyses count.
 * - Monospace developer table with columns: Repository | State | Commit | Started | Finished.
 * - Multiline error diagnostic under failed state.
 * - Empty state for teams that have never run an analysis.
 * - Multi-tenant isolation verified by database RLS policies.
 */
import React from 'react';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { WorkspaceDashboard } from '@/components/workspace-dashboard';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage() {
  const ctx = await resolveOrgContext(false);

  return <WorkspaceDashboard initialOrgId={ctx.orgId} />;
}
