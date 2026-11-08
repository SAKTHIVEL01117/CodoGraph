/**
 * CodoGraph — Phase 7: Live Analysis Progress Page.
 *
 * Requirements:
 * - Names the stage as it happens, updated live via database broadcast.
 * - Displays exact failed stage and message if a run fails.
 * - Lands on canvas map when complete.
 */
import React from 'react';
import { notFound } from 'next/navigation';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { getAnalysisById } from '@/lib/pipeline/storage';
import { AnalysisProgressView } from '@/components/analysis/progress-view';

export const dynamic = 'force-dynamic';

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await resolveOrgContext(false);
  const effectiveOrgId =
    ctx.orgId ||
    (process.env.NODE_ENV !== 'production' ? 'org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot' : undefined);

  let analysis = await getAnalysisById(id, effectiveOrgId || undefined);
  if (!analysis) {
    // Direct lookup fallback
    analysis = await getAnalysisById(id);
  }

  if (!analysis) {
    notFound();
  }

  return (
    <AnalysisProgressView
      analysisId={id}
      initialAnalysis={analysis}
    />
  );
}

