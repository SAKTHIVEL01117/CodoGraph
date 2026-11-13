/**
 * CodoGraph — Phase 12: Short-Lived Agent Credential Minting Endpoint.
 *
 * Requirements (docs/specs/phase-12.md):
 * 1. Proves the asker owns the analysis via Clerk authenticated org context.
 * 2. Mints a short-lived signed credential naming exactly one analysis and its organization.
 * 3. Prevents prompt injection: the agent runtime receives this credential and cannot switch targets.
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAnalysisById } from '@/lib/pipeline/storage';
import { mintAgentCredential } from '@/lib/auth/agent-credential';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate the caller and resolve their active organization context
    const ctx = await resolveOrgContext(false);
    if (!ctx.isAuthenticated || !ctx.userId || !ctx.orgId) {
      return NextResponse.json(
        { error: 'Unauthorized: Signed-in organization context required to mint agent credentials.' },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      analysisId?: string;
      ttlSeconds?: number;
    };

    const { analysisId, ttlSeconds } = body;

    if (!analysisId || !UUID_REGEX.test(analysisId)) {
      return NextResponse.json(
        { error: 'Valid analysisId is required.' },
        { status: 400 }
      );
    }

    // 2. Strict RLS ownership check: verify the analysis exists and belongs to the caller's active org
    const supabase = await createSupabaseServerClient();
    const analysis = await getAnalysisById(supabase, analysisId);

    if (!analysis) {
      return NextResponse.json(
        { error: 'Analysis not found or not accessible within your organization.' },
        { status: 404 }
      );
    }

    // 3. Mint the short-lived signed credential
    const credential = mintAgentCredential({
      analysisId: analysis.id,
      orgId: ctx.orgId,
      ttlSeconds: typeof ttlSeconds === 'number' ? ttlSeconds : 15 * 60,
    });

    const expiresAt = new Date(Date.now() + (typeof ttlSeconds === 'number' ? ttlSeconds : 15 * 60) * 1000).toISOString();

    return NextResponse.json({
      success: true,
      credential,
      expiresAt,
      analysisId: analysis.id,
      orgId: ctx.orgId,
    });
  } catch (error) {
    console.error('[CodoGraph /api/agent/credential POST Error]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error minting agent credential' },
      { status: 500 }
    );
  }
}
