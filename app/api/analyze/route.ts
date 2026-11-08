/**
 * CodoGraph — Phase 7: Repository Analysis Trigger Endpoint.
 *
 * Implements:
 * 1. Auth and Organization verification via Clerk session claims.
 * 2. URL parsing & normalization.
 * 3. "One analysis per repository" enforcement:
 *    If an analysis for this repo already exists, returns it immediately without duplicating.
 * 4. Asynchronous pipeline execution with live database state transitions.
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { parseGitHubUrl } from '@/lib/pipeline/github';
import {
  findExistingAnalysis,
  createPendingAnalysis,
} from '@/lib/pipeline/storage';
import { runAnalysisPipeline } from '@/lib/pipeline/runner';

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveOrgContext(true);

    let body: { repositoryUrl?: string; branch?: string; orgId?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const repositoryUrl = body?.repositoryUrl;
    const requestedOrgId = body?.orgId;

    const effectiveOrgId =
      ctx.orgId ||
      requestedOrgId ||
      (process.env.NODE_ENV !== 'production' ? 'org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot' : null);

    const effectiveUserId =
      ctx.userId ||
      (process.env.NODE_ENV !== 'production' ? 'user_dev_sakthivel' : null);

    if (!effectiveOrgId || (!ctx.isAuthenticated && process.env.NODE_ENV === 'production')) {
      return NextResponse.json(
        { error: 'Unauthorized: Active organization session required.' },
        { status: 401 }
      );
    }

    if (!repositoryUrl || typeof repositoryUrl !== 'string') {
      return NextResponse.json(
        { error: 'A valid public GitHub repository URL is required.' },
        { status: 400 }
      );
    }

    // 1. Normalize and validate GitHub URL
    let coords;
    try {
      coords = parseGitHubUrl(repositoryUrl);
    } catch (urlErr) {
      return NextResponse.json(
        { error: urlErr instanceof Error ? urlErr.message : 'Invalid GitHub repository URL.' },
        { status: 400 }
      );
    }

    // 2. "One analysis per repository" invariant
    const existing = await findExistingAnalysis(effectiveOrgId, coords.canonicalUrl);
    if (existing) {
      return NextResponse.json({
        success: true,
        analysisId: existing.id,
        reusedExisting: true,
        redirectTo:
          existing.status === 'completed'
            ? `/preview?id=${existing.id}`
            : `/analysis/${existing.id}`,
      });
    }

    // 3. Create initial pending record
    const targetBranch = coords.ref || body?.branch || 'main';
    const analysis = await createPendingAnalysis(
      effectiveOrgId,
      coords.canonicalUrl,
      coords.repo,
      targetBranch,
      effectiveUserId
    );

    // 4. Trigger pipeline execution in background referencing the created analysis
    // runAnalysisPipeline records named stages (fetching, selecting, parsing, storing, complete/failed)
    // and database triggers broadcast these transitions in real-time.
    runAnalysisPipeline(coords.canonicalUrl, effectiveOrgId, {
      userId: effectiveUserId,
      analysisId: analysis.id,
      forceRerun: true,
    }).catch((err) => {
      console.error(`[CodoGraph Pipeline] Analysis ${analysis.id} failed:`, err);
    });

    return NextResponse.json({
      success: true,
      analysisId: analysis.id,
      reusedExisting: false,
      redirectTo: `/analysis/${analysis.id}`,
    });
  } catch (error) {
    console.error('[CodoGraph /api/analyze Error]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

