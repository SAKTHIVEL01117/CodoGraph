/**
 * CodoGraph — Phase 7 & 8: Repository Analysis Trigger & Re-run Endpoint.
 *
 * Implements:
 * 1. Strict Clerk auth & session organization verification (ignores caller-supplied orgId).
 * 2. Next.js `after()` lifecycle scheduling so pipeline parsing survives HTTP response completion.
 * 3. URL parsing & normalization + "One analysis per repository" RLS lookup.
 * 4. Explicit in-place Re-run support via `rerunAnalysisId`.
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parseGitHubUrl } from '@/lib/pipeline/github';
import {
  findExistingAnalysis,
  createPendingAnalysis,
  getAnalysisById,
  prepareAnalysisForRerun,
} from '@/lib/pipeline/storage';
import { runAnalysisPipeline } from '@/lib/pipeline/runner';

export const maxDuration = 300;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveOrgContext(true);

    if (!ctx.isAuthenticated || !ctx.userId || !ctx.orgId) {
      return NextResponse.json(
        { error: 'Unauthorized: Active authenticated organization session required.' },
        { status: 401 }
      );
    }

    const { orgId: sessionOrgId } = await auth({ treatPendingAsSignedOut: false });
    if (!sessionOrgId) {
      return NextResponse.json(
        { error: 'Organization session is activating. Please retry in a moment.' },
        { status: 409 }
      );
    }

    let body: { repositoryUrl?: string; branch?: string; rerunAnalysisId?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();

    // Branch A: Re-run an existing analysis in place under RLS
    if (body.rerunAnalysisId !== undefined) {
      if (typeof body.rerunAnalysisId !== 'string' || !UUID_REGEX.test(body.rerunAnalysisId)) {
        return NextResponse.json(
          { error: 'Invalid rerunAnalysisId parameter.' },
          { status: 400 }
        );
      }

      const existing = await getAnalysisById(supabase, body.rerunAnalysisId);
      if (!existing) {
        return NextResponse.json(
          { error: 'Analysis not found or access denied.' },
          { status: 404 }
        );
      }

      const branchOverride =
        typeof body.branch === 'string' && body.branch.trim() !== ''
          ? body.branch.trim()
          : undefined;

      const updated = await prepareAnalysisForRerun(supabase, existing.id, branchOverride);
      const rerunTargetUrl = branchOverride
        ? `${updated.repository_url}/tree/${branchOverride}`
        : updated.repository_url;

      after(async () => {
        try {
          await runAnalysisPipeline(rerunTargetUrl, sessionOrgId, {
            userId: ctx.userId,
            analysisId: updated.id,
            forceRerun: true,
          });
        } catch (err) {
          console.error(`[CodoGraph Pipeline] Re-run ${updated.id} failed:`, err);
        }
      });

      return NextResponse.json({
        success: true,
        analysisId: updated.id,
        reusedExisting: false,
        rerun: true,
        redirectTo: `/analysis/${updated.id}`,
      });
    }

    // Branch B: Analyze a repository URL
    const repositoryUrl = body?.repositoryUrl;
    if (!repositoryUrl || typeof repositoryUrl !== 'string') {
      return NextResponse.json(
        { error: 'A valid public GitHub repository URL is required.' },
        { status: 400 }
      );
    }

    let coords;
    try {
      coords = parseGitHubUrl(repositoryUrl);
    } catch (urlErr) {
      return NextResponse.json(
        { error: urlErr instanceof Error ? urlErr.message : 'Invalid GitHub repository URL.' },
        { status: 400 }
      );
    }

    // "One analysis per repository" invariant enforced via RLS
    const existing = await findExistingAnalysis(supabase, coords.canonicalUrl);
    if (existing) {
      return NextResponse.json({
        success: true,
        analysisId: existing.id,
        reusedExisting: true,
        redirectTo: `/analysis/${existing.id}`,
      });
    }

    const targetBranch = coords.ref || body?.branch?.trim() || 'main';
    const analysis = await createPendingAnalysis(
      supabase,
      sessionOrgId,
      coords.canonicalUrl,
      coords.repo,
      targetBranch
    );

    const pipelineUrl = coords.ref
      ? `${coords.canonicalUrl}/tree/${coords.ref}`
      : coords.canonicalUrl;

    after(async () => {
      try {
        await runAnalysisPipeline(pipelineUrl, sessionOrgId, {
          userId: ctx.userId,
          analysisId: analysis.id,
          forceRerun: true,
        });
      } catch (err) {
        console.error(`[CodoGraph Pipeline] Analysis ${analysis.id} failed:`, err);
      }
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
