/**
 * CodoGraph — Phase 7: List Organization Analyses Endpoint (RLS-Enforced).
 */
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAllAnalysesForOrg } from '@/lib/pipeline/storage';

export async function GET() {
  try {
    const ctx = await resolveOrgContext(false);
    if (!ctx.isAuthenticated || !ctx.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId: sessionOrgId } = await auth({ treatPendingAsSignedOut: false });
    if (!sessionOrgId) {
      return NextResponse.json({ analyses: [], orgPending: true });
    }

    const supabase = await createSupabaseServerClient();
    const analyses = await getAllAnalysesForOrg(supabase);
    return NextResponse.json({ analyses });
  } catch (error) {
    console.error('[CodoGraph /api/analyses Error]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
