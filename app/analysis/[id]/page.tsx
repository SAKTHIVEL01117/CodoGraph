/**
 * CodoGraph — Canonical Analysis Route (/analysis/[id]) (Phases 4, 5, 6, 7 & 8).
 *
 * Strictly authenticated & RLS-enforced:
 * - Completed analyses render the three-column architectural <CanvasShell /> directly.
 * - Pending, running, or failed analyses render <AnalysisProgressView /> with Realtime updates.
 */
import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { Loader2 } from 'lucide-react';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  getAnalysisById,
  getAnalysisGraph,
  getAllAnalysesForOrg,
  type AnalysisRecord,
} from '@/lib/pipeline/storage';
import { OrgSync } from '@/components/org-sync';
import { AnalysisProgressView } from '@/components/analysis/progress-view';
import { CanvasShell, type AnalysisSummary } from '@/components/canvas/canvas-shell';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapStatusToSummaryState(status: AnalysisRecord['status']): AnalysisSummary['state'] {
  if (status === 'completed') return 'complete';
  if (status === 'pending') return 'queued';
  return status;
}

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    notFound();
  }

  const sessionAuth = await auth({ treatPendingAsSignedOut: false });
  if (!sessionAuth.userId) {
    redirect('/sign-in');
  }

  const ctx = await resolveOrgContext(true);
  if (!ctx.isAuthenticated || !ctx.userId) {
    redirect('/sign-in');
  }

  const sessionOrgId = sessionAuth.orgId;

  // Wait for client-side Clerk setActive({ organization }) on brand-new session before RLS lookup
  if (!sessionOrgId && ctx.orgId) {
    return (
      <>
        <OrgSync activeOrgId={ctx.orgId} />
        <div className="min-h-screen bg-background text-muted-foreground flex items-center justify-center font-mono text-xs gap-2.5">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span>Activating organization session...</span>
        </div>
      </>
    );
  }

  const supabase = await createSupabaseServerClient();
  const analysis = await getAnalysisById(supabase, id);

  if (!analysis) {
    notFound();
  }

  if (analysis.status === 'completed') {
    const [graphData, orgRecords] = await Promise.all([
      getAnalysisGraph(supabase, id),
      getAllAnalysesForOrg(supabase),
    ]);

    if (!graphData) {
      notFound();
    }

    const orgAnalyses: AnalysisSummary[] = orgRecords.map((rec) => {
      const repoClean = rec.repository_url
        ? rec.repository_url.replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '')
        : 'Repository';

      return {
        id: rec.id,
        repository: repoClean,
        branch: rec.branch || 'main',
        state: mapStatusToSummaryState(rec.status),
        commit: rec.commit_hash ? rec.commit_hash.slice(0, 7) : null,
        errorMessage: rec.error_message,
        result: rec.id === id ? graphData.result : undefined,
      };
    });

    return (
      <>
        <OrgSync activeOrgId={ctx.orgId} />
        <CanvasShell
          key={`${id}-${analysis.updated_at}`}
          primaryAnalysis={graphData.result}
          orgAnalyses={orgAnalyses}
          initialAnalysisId={id}
        />
      </>
    );
  }

  return (
    <>
      <OrgSync activeOrgId={ctx.orgId} />
      <AnalysisProgressView
        analysisId={id}
        initialAnalysis={analysis}
      />
    </>
  );
}
