/**
 * CodoGraph — Phase 7: Single Analysis Status Endpoint.
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { getAnalysisById, deleteAnalysis } from '@/lib/pipeline/storage';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await resolveOrgContext(false);
    const effectiveOrgId =
      ctx.orgId ||
      (process.env.NODE_ENV !== 'production' ? 'org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot' : undefined);

    let analysis = await getAnalysisById(id, effectiveOrgId || undefined);
    if (!analysis) {
      // Direct lookup fallback if org filter misses
      analysis = await getAnalysisById(id);
    }

    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('[CodoGraph /api/analyses/[id] Error]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await resolveOrgContext(false);
    const effectiveOrgId =
      ctx.orgId ||
      (process.env.NODE_ENV !== 'production' ? 'org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot' : undefined);

    let deleted = await deleteAnalysis(id, effectiveOrgId);
    if (!deleted) {
      // Direct fallback
      deleted = await deleteAnalysis(id);
    }

    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    console.error('[CodoGraph /api/analyses/[id] DELETE Error]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

