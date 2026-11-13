/**
 * CodoGraph — Phase 10: Explanation & Non-structural Role Endpoint.
 *
 * Requirements:
 * 1. Strict Clerk authentication & RLS query context.
 * 2. Fetches or generates file & folder explanations, traced via LangSmith.
 * 3. Cache read happens inside the traced call (cache hits record 0 tokens).
 * 4. Assigns non-structural roles to unclassified files.
 * 5. Checks staleness against current file content hash and commit hash.
 * 6. Exposes tracing status visibility.
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  getAnalysisById,
  getLatestExplanation,
  getAllExplanationsForAnalysis,
} from '@/lib/pipeline/storage';
import {
  explainFileTraced,
  explainFolderTraced,
  classifyFileRoleTraced,
  computeFolderContentHash,
  checkStaleness,
} from '@/lib/ai/explain';
import { getTracingStatus, PINNED_MODEL } from '@/lib/ai/client';
import { checkInventedPaths } from '@/lib/ai/evals/invented-paths';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates and normalizes relative repository file/folder paths.
 * Defends against directory traversal (../), control characters, and null bytes.
 */
function sanitizePath(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 500) return null;
  // Disallow null bytes, carriage returns, and control chars
  if (/[\0\x00-\x1F\x7F]/.test(trimmed)) return null;
  // Normalize Windows backslashes to standard POSIX slashes
  const normalized = trimmed.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  // Disallow directory traversal segments ('..' or '.')
  const segments = normalized.split('/');
  if (segments.some((s) => s === '..' || s === '.')) return null;
  return normalized;
}

/**
 * Validates commit hashes (7 to 40 hex characters).
 */
function sanitizeCommit(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{7,40}$/.test(trimmed)) return trimmed;
  return undefined;
}

// In-memory sliding window rate limiter: maximum 30 AI explain requests per minute per user
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(userId: string, limit = 30, windowMs = 60000): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(userId) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) {
    return false;
  }
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return true;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await resolveOrgContext(false);
    if (!ctx.isAuthenticated || !ctx.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    const supabase = await createSupabaseServerClient();
    const analysis = await getAnalysisById(supabase, id);
    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    const url = new URL(req.url);
    const rawTargetPath = url.searchParams.get('targetPath');
    const targetPath = rawTargetPath ? sanitizePath(rawTargetPath) : null;
    const isFolder = url.searchParams.get('isFolder') === 'true';

    const tracingStatus = getTracingStatus();

    if (!targetPath) {
      // Return all explanations for this analysis
      const explanations = await getAllExplanationsForAnalysis(supabase, id);
      return NextResponse.json({
        explanations,
        tracingStatus,
        model: PINNED_MODEL,
      });
    }

    // Lookup latest explanation for single target
    const latest = await getLatestExplanation(supabase, id, targetPath, isFolder);

    return NextResponse.json({
      explanation: latest,
      tracingStatus,
      model: PINNED_MODEL,
    });
  } catch (error) {
    console.error('[CodoGraph /api/analyses/[id]/explain GET Error]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await resolveOrgContext(false);
    if (!ctx.isAuthenticated || !ctx.userId || !ctx.orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limiting: defense against abusive loops and token exhaustion
    if (!checkRateLimit(ctx.userId)) {
      return NextResponse.json(
        { error: 'Too many explanation requests. Please wait a minute before requesting again.' },
        { status: 429 }
      );
    }

    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const targetPath = sanitizePath(body.targetPath);
    const isFolder = Boolean(body.isFolder);
    const forceRefresh = Boolean(body.forceRefresh);
    const latestRepoCommit = sanitizeCommit(body.latestRepoCommit);

    if (!targetPath) {
      return NextResponse.json(
        { error: 'Valid repository targetPath is required' },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const analysis = await getAnalysisById(supabase, id);
    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    // Strict multi-tenant verification: ensure analysis belongs to caller's org
    if (analysis.org_id !== ctx.orgId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tracingStatus = getTracingStatus();

    if (isFolder) {
      // 1. Folder Explanation: query files belonging to folder
      const { data: folderFiles, error: filesErr } = await supabase
        .from('files')
        .select('path, folder, role, content_hash')
        .eq('analysis_id', id);

      if (filesErr) {
        throw new Error(`Failed querying folder files: ${filesErr.message}`);
      }

      const allFiles = folderFiles ?? [];
      const filesInFolder = allFiles.filter(
        (f) => f.folder === targetPath || f.path.startsWith(`${targetPath}/`)
      );

      if (filesInFolder.length === 0) {
        return NextResponse.json(
          { error: `Folder ${targetPath} has no indexed files` },
          { status: 404 }
        );
      }

      const folderFilePaths = new Set(filesInFolder.map((f) => f.path));

      // Query edges to calculate external dependents and dependencies
      const { data: edgeRows, error: edgeErr } = await supabase
        .from('edges')
        .select('source_path, target_path')
        .eq('analysis_id', id);

      if (edgeErr) {
        throw new Error(`Failed querying edges: ${edgeErr.message}`);
      }

      const allEdges = edgeRows ?? [];
      const externalDependentsSet = new Set<string>();
      const externalDependenciesSet = new Set<string>();
      let fanIn = 0;
      let fanOut = 0;

      for (const edge of allEdges) {
        const isSourceInside = folderFilePaths.has(edge.source_path);
        const isTargetInside = folderFilePaths.has(edge.target_path);

        if (!isSourceInside && isTargetInside) {
          externalDependentsSet.add(edge.source_path);
          fanIn++;
        } else if (isSourceInside && !isTargetInside) {
          externalDependenciesSet.add(edge.target_path);
          fanOut++;
        }
      }

      const folderHash = computeFolderContentHash(
        filesInFolder.map((f) => ({
          path: f.path,
          contentHash: f.content_hash || '',
        }))
      );

      // Traced folder explanation (cache read inside)
      const explanation = await explainFolderTraced({
        supabase,
        orgId: ctx.orgId,
        analysisId: id,
        folderPath: targetPath,
        folderHash,
        filesInFolder: filesInFolder.map((f) => ({ path: f.path, role: f.role })),
        fanIn,
        fanOut,
        externalDependents: Array.from(externalDependentsSet).sort(),
        externalDependencies: Array.from(externalDependenciesSet).sort(),
        forceRefresh,
      });

      const staleness = checkStaleness(
        folderHash,
        explanation.contentHash,
        analysis.commit_hash,
        latestRepoCommit
      );

      // Phase 11: Live Evaluator on Real Traffic (Invented-Path Check)
      const shownFolderPaths = new Set<string>([
        targetPath,
        ...filesInFolder.map((f) => f.path),
        ...Array.from(externalDependentsSet),
        ...Array.from(externalDependenciesSet),
      ]);
      const liveEval = checkInventedPaths(explanation.content, shownFolderPaths, {
        explanationId: explanation.id,
        targetPath,
      });

      return NextResponse.json({
        success: true,
        explanation,
        isStale: staleness.isStale,
        stalenessReason: staleness.reason || null,
        tracingStatus,
        model: PINNED_MODEL,
        eval: liveEval,
      });
    }

    // 2. File Explanation
    const { data: fileRow, error: fileErr } = await supabase
      .from('files')
      .select('id, path, folder, lines, role, content_hash')
      .eq('analysis_id', id)
      .eq('path', targetPath)
      .maybeSingle();

    if (fileErr || !fileRow) {
      return NextResponse.json(
        { error: `File ${targetPath} not found in analysis` },
        { status: 404 }
      );
    }

    // Query edges and declared routes in parallel using parameterized exact matches
    const [depsResult, dependentsResult, routesResult] = await Promise.all([
      supabase
        .from('edges')
        .select('target_path')
        .eq('analysis_id', id)
        .eq('source_path', targetPath),
      supabase
        .from('edges')
        .select('source_path')
        .eq('analysis_id', id)
        .eq('target_path', targetPath),
      supabase
        .from('routes')
        .select('method, pattern, line')
        .eq('analysis_id', id)
        .eq('file_path', targetPath),
    ]);

    if (depsResult.error) {
      throw new Error(`Failed querying file dependencies: ${depsResult.error.message}`);
    }
    if (dependentsResult.error) {
      throw new Error(`Failed querying file dependents: ${dependentsResult.error.message}`);
    }

    const dependencies = Array.from(
      new Set(
        (depsResult.data ?? [])
          .map((e) => e.target_path)
          .filter((p) => p !== targetPath)
      )
    ).sort();

    const dependents = Array.from(
      new Set(
        (dependentsResult.data ?? [])
          .map((e) => e.source_path)
          .filter((p) => p !== targetPath)
      )
    ).sort();

    let activeRole = fileRow.role;

    // If file has no adapter-assigned role, classify it using model
    if (!activeRole || activeRole === 'module' || activeRole === 'unknown') {
      try {
        const classified = await classifyFileRoleTraced({
          supabase,
          orgId: ctx.orgId,
          analysisId: id,
          filePath: targetPath,
          dependencies,
          dependents,
        });
        activeRole = classified;
      } catch (err) {
        console.warn(`[CodoGraph] Role classification failed for ${targetPath}:`, err);
      }
    }

    // Traced file explanation (cache read inside)
    const explanation = await explainFileTraced({
      supabase,
      orgId: ctx.orgId,
      analysisId: id,
      filePath: targetPath,
      contentHash: fileRow.content_hash || '',
      fileRole: activeRole,
      folder: fileRow.folder,
      lines: fileRow.lines,
      routes: routesResult.data ?? [],
      dependencies,
      dependents,
      forceRefresh,
    });

    const staleness = checkStaleness(
      fileRow.content_hash || '',
      explanation.contentHash,
      analysis.commit_hash,
      latestRepoCommit
    );

    // Phase 11: Live Evaluator on Real Traffic (Invented-Path Check)
    const shownFilePaths = new Set<string>([targetPath, ...dependencies, ...dependents]);
    const liveEval = checkInventedPaths(explanation.content, shownFilePaths, {
      explanationId: explanation.id,
      targetPath,
    });

    return NextResponse.json({
      success: true,
      explanation,
      role: activeRole,
      isStale: staleness.isStale,
      stalenessReason: staleness.reason || null,
      tracingStatus,
      model: PINNED_MODEL,
      eval: liveEval,
    });
  } catch (error) {
    console.error('[CodoGraph /api/analyses/[id]/explain POST Error]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
