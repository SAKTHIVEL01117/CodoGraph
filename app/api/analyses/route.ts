/**
 * CodoGraph — Phase 7: List Organization Analyses Endpoint.
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { getAllAnalysesForOrg } from '@/lib/pipeline/storage';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const queryOrgId = searchParams.get('orgId');
    const ctx = await resolveOrgContext(false);

    const effectiveOrgId =
      ctx.orgId ||
      queryOrgId ||
      (process.env.NODE_ENV !== 'production' ? 'org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot' : null);

    if (!effectiveOrgId) {
      return NextResponse.json({ analyses: [] });
    }

    const analyses = await getAllAnalysesForOrg(effectiveOrgId);
    return NextResponse.json({ analyses });
  } catch (error) {
    console.error('[CodoGraph /api/analyses Error]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

