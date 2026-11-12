/**
 * CodoGraph — Phase 7 & 8: Pipeline Database Storage Layer (Supabase HTTPS).
 *
 * Implements:
 * 1. User-facing queries & deletes through Clerk-authenticated Supabase client (RLS enforced, NO WHERE org_id = ...).
 * 2. Background worker stage transitions and atomic batch storage through admin HTTPS client
 *    (strictly scoped with .eq('id', analysisId).eq('org_id', orgId)).
 * 3. Full pagination (.range) on files, edges, file_roles, and routes (no 1000-row PostgREST truncation).
 * 4. "One analysis per repository" lookup and in-place Re-run reset.
 */
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '../supabase/admin.ts';
import type {
  ParserResult,
  ParsedFile,
  ParsedEdge,
  CoverageReport,
  ExtractedRoute,
  EdgeKind,
} from '../parser/types.ts';
import type { CodebaseInsight } from '../canvas/metrics.ts';

export const ANALYSIS_COLUMNS =
  'id, org_id, project_id, repository_url, branch, commit_hash, status, stage, error_message, summary, created_at, updated_at';

const POSTGREST_PAGE_SIZE = 1000;

export type PipelineStage =
  | 'fetching'
  | 'selecting'
  | 'parsing'
  | 'storing'
  | 'complete'
  | 'failed';

export interface AnalysisRecord {
  id: string;
  org_id: string;
  project_id: string | null;
  repository_url: string;
  branch: string;
  commit_hash: string | null;
  status: 'pending' | 'fetching' | 'selecting' | 'parsing' | 'storing' | 'completed' | 'failed';
  stage: string | null;
  error_message: string | null;
  summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FullAnalysisGraph {
  analysis: AnalysisRecord;
  result: ParserResult;
}

async function fetchAllRows<T>(
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  while (true) {
    const to = from + POSTGREST_PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) {
      throw new Error(`[CodoGraph Storage] Query pagination failed: ${error.message}`);
    }

    const rows = data ?? [];
    all.push(...rows);

    if (rows.length < POSTGREST_PAGE_SIZE) {
      break;
    }

    from += POSTGREST_PAGE_SIZE;
  }

  return all;
}

async function insertInChunks(
  admin: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  chunkSize = 200
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await admin.from(table).insert(chunk);
    if (error) {
      throw new Error(
        `[CodoGraph Storage] Failed inserting batch into ${table}: ${error.message}`
      );
    }
  }
}

// =============================================================================
// 1. USER-FACING RLS FUNCTIONS (Clerk JWT forwarded via createSupabaseServerClient)
//    Invariant: Zero application-level org_id filters on SELECT / UPDATE / DELETE.
// =============================================================================

/**
 * Fetches all analysis records visible to the caller's active organization via RLS.
 */
export async function getAllAnalysesForOrg(
  supabase: SupabaseClient,
  limit = 100
): Promise<AnalysisRecord[]> {
  const { data, error } = await supabase
    .from('analyses')
    .select(ANALYSIS_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`[CodoGraph Storage] Failed to list analyses: ${error.message}`);
  }

  return (data ?? []) as AnalysisRecord[];
}

/**
 * Fetches a single analysis record by ID through PostgreSQL RLS.
 */
export async function getAnalysisById(
  supabase: SupabaseClient,
  analysisId: string
): Promise<AnalysisRecord | null> {
  const { data, error } = await supabase
    .from('analyses')
    .select(ANALYSIS_COLUMNS)
    .eq('id', analysisId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[CodoGraph Storage] Failed to fetch analysis ${analysisId}: ${error.message}`
    );
  }

  return (data as AnalysisRecord | null) ?? null;
}

/**
 * Checks if any analysis already exists for a canonical repository URL in the caller's org.
 * Enforces "One analysis per repository" invariant under RLS.
 */
export async function findExistingAnalysis(
  supabase: SupabaseClient,
  canonicalUrl: string
): Promise<AnalysisRecord | null> {
  const { data, error } = await supabase
    .from('analyses')
    .select(ANALYSIS_COLUMNS)
    .eq('repository_url', canonicalUrl)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[CodoGraph Storage] Failed to look up existing analysis for ${canonicalUrl}: ${error.message}`
    );
  }

  return (data as AnalysisRecord | null) ?? null;
}

/**
 * Finds or creates a project record, then inserts a new pending analysis row under RLS.
 */
export async function createPendingAnalysis(
  supabase: SupabaseClient,
  orgId: string,
  canonicalUrl: string,
  repoName: string,
  branch = 'main'
): Promise<AnalysisRecord> {
  const { data: existingProj, error: projSelectErr } = await supabase
    .from('projects')
    .select('id')
    .eq('repository_url', canonicalUrl)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (projSelectErr) {
    throw new Error(
      `[CodoGraph Storage] Failed to query project for ${canonicalUrl}: ${projSelectErr.message}`
    );
  }

  let projectId: string;
  if (existingProj?.id) {
    projectId = existingProj.id as string;
  } else {
    const { data: newProj, error: projInsertErr } = await supabase
      .from('projects')
      .insert({
        org_id: orgId,
        name: repoName,
        repository_url: canonicalUrl,
        default_branch: branch,
      })
      .select('id')
      .single();

    if (projInsertErr || !newProj?.id) {
      throw new Error(
        `[CodoGraph Storage] Failed to create project for ${canonicalUrl}: ${
          projInsertErr?.message || 'Unknown error'
        }`
      );
    }

    projectId = newProj.id as string;
  }

  const { data: analysis, error: analysisErr } = await supabase
    .from('analyses')
    .insert({
      org_id: orgId,
      project_id: projectId,
      repository_url: canonicalUrl,
      branch,
      status: 'pending',
      stage: 'fetching',
      error_message: null,
      summary: {},
    })
    .select(ANALYSIS_COLUMNS)
    .single();

  if (analysisErr || !analysis) {
    throw new Error(
      `[CodoGraph Storage] Failed to create pending analysis: ${
        analysisErr?.message || 'Unknown error'
      }`
    );
  }

  return analysis as AnalysisRecord;
}

/**
 * Resets an existing analysis record in-place under RLS to prepare for a Re-run.
 */
export async function prepareAnalysisForRerun(
  supabase: SupabaseClient,
  analysisId: string,
  branch?: string
): Promise<AnalysisRecord> {
  const updatePayload: Record<string, unknown> = {
    status: 'pending',
    stage: 'fetching',
    error_message: null,
    updated_at: new Date().toISOString(),
  };

  if (branch && branch.trim() !== '') {
    updatePayload.branch = branch.trim();
  }

  const { data, error } = await supabase
    .from('analyses')
    .update(updatePayload)
    .eq('id', analysisId)
    .select(ANALYSIS_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[CodoGraph Storage] Failed to reset analysis ${analysisId} for re-run: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(`Analysis ${analysisId} not found or access denied.`);
  }

  return data as AnalysisRecord;
}

/**
 * Deletes an analysis record via RLS (cascading to files, edges, roles, routes, insights).
 */
export async function deleteAnalysis(
  supabase: SupabaseClient,
  analysisId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('analyses')
    .delete()
    .eq('id', analysisId)
    .select('id');

  if (error) {
    throw new Error(
      `[CodoGraph Storage] Failed to delete analysis ${analysisId}: ${error.message}`
    );
  }

  return Array.isArray(data) && data.length > 0;
}

interface StoredFileRow {
  id: string;
  path: string;
  folder: string;
  extension: string | null;
  lines: number | null;
  size_bytes: number | null;
  content_hash: string | null;
  fan_in: number | null;
  fan_out: number | null;
  role: string | null;
}

interface StoredEdgeRow {
  id: string;
  source_path: string;
  target_path: string;
  kind: string;
  specifier: string | null;
}

interface StoredFileRoleRow {
  id: string;
  file_path: string;
  role: string;
}

interface StoredRouteRow {
  id: string;
  file_id: string | null;
  method: string;
  pattern: string;
  line: number | null;
  framework: string | null;
}

/**
 * Loads the complete parsed graph (files, edges, merged roles, routes, coverage) via RLS.
 * Paginates cleanly past PostgREST's 1,000-row default limit.
 */
export async function getAnalysisGraph(
  supabase: SupabaseClient,
  analysisId: string
): Promise<FullAnalysisGraph | null> {
  const analysis = await getAnalysisById(supabase, analysisId);
  if (!analysis) return null;

  const [fileRows, edgeRows, roleRows, routeRows] = await Promise.all([
    fetchAllRows<StoredFileRow>((from, to) =>
      supabase
        .from('files')
        .select('id, path, folder, extension, lines, size_bytes, content_hash, fan_in, fan_out, role')
        .eq('analysis_id', analysisId)
        .order('path', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<StoredEdgeRow>((from, to) =>
      supabase
        .from('edges')
        .select('id, source_path, target_path, kind, specifier')
        .eq('analysis_id', analysisId)
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<StoredFileRoleRow>((from, to) =>
      supabase
        .from('file_roles')
        .select('id, file_path, role')
        .eq('analysis_id', analysisId)
        .order('file_path', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<StoredRouteRow>((from, to) =>
      supabase
        .from('routes')
        .select('id, file_id, method, pattern, line, framework')
        .eq('analysis_id', analysisId)
        .order('pattern', { ascending: true })
        .order('method', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ]);

  const roleByPath = new Map<string, string>();
  for (const r of roleRows) {
    if (r.file_path && r.role) {
      roleByPath.set(r.file_path, r.role);
    }
  }

  const fileIdToPath = new Map<string, string>();
  for (const f of fileRows) {
    fileIdToPath.set(f.id, f.path);
  }

  const files: ParsedFile[] = fileRows.map((f) => ({
    path: f.path,
    folder: f.folder,
    extension: f.extension || (f.path.includes('.') ? '.' + f.path.split('.').pop() : ''),
    lines: Number(f.lines || 0),
    sizeBytes: Number(f.size_bytes || 0),
    contentHash: f.content_hash || '',
    isSourceCode: true,
    fanIn: Number(f.fan_in || 0),
    fanOut: Number(f.fan_out || 0),
    role: f.role ?? roleByPath.get(f.path) ?? null,
  }));

  const edges: ParsedEdge[] = edgeRows.map((e) => ({
    sourcePath: e.source_path,
    targetPath: e.target_path,
    kind: (e.kind as EdgeKind) || 'import',
    specifier: e.specifier || '',
  }));

  const folders = Array.from(new Set(files.map((f) => f.folder))).sort();

  const summary = (
    analysis.summary && typeof analysis.summary === 'object' ? analysis.summary : {}
  ) as Record<string, unknown>;

  const summaryLineMap = new Map<string, number>();
  if (Array.isArray(summary.routes)) {
    for (const sr of summary.routes as ExtractedRoute[]) {
      if (typeof sr.line === 'number') {
        summaryLineMap.set(`${sr.method}|${sr.pattern}|${sr.filePath}`, sr.line);
      }
    }
  }

  let routes: ExtractedRoute[] = routeRows.map((r) => {
    const filePath = r.file_id ? (fileIdToPath.get(r.file_id) ?? '') : '';
    const line =
      typeof r.line === 'number'
        ? r.line
        : summaryLineMap.get(`${r.method}|${r.pattern}|${filePath}`);

    return {
      method: r.method,
      pattern: r.pattern,
      filePath,
      ...(typeof line === 'number' ? { line } : {}),
      framework: r.framework || undefined,
    };
  });

  if (routes.length === 0 && Array.isArray(summary.routes)) {
    routes = summary.routes as ExtractedRoute[];
  }

  const coverage: CoverageReport = (summary.coverage as CoverageReport) || {
    filesFound: files.length,
    filesParsed: files.length,
    filesSkipped: 0,
    skipReasons: {},
    skippedFiles: [],
    importsTotal: edges.length,
    importsResolvedInternal: edges.length,
    importsExternal: 0,
    importsExcluded: 0,
    importsUnresolved: 0,
    reExportsTotal: 0,
    reExportsResolvedInternal: 0,
    dynamicImportsTotal: 0,
    dynamicImportsResolvedInternal: 0,
    requiresTotal: 0,
    requiresResolvedInternal: 0,
    unresolvedDetails: [],
  };

  const repoClean = analysis.repository_url
    ? analysis.repository_url.replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '')
    : 'Repository';

  const adapter =
    typeof summary.adapter === 'string' && summary.adapter.trim() !== ''
      ? summary.adapter
      : 'none';

  const result: ParserResult = {
    repositoryRoot: (summary.repositoryRoot as string) || repoClean,
    timestamp: analysis.updated_at || analysis.created_at || new Date().toISOString(),
    adapter,
    files,
    edges,
    folders,
    coverage,
    routes,
  };

  return {
    analysis,
    result,
  };
}

// =============================================================================
// 2. ADMIN WORKER & CLI PIPELINE FUNCTIONS (HTTPS via createSupabaseAdminClient)
//    Used only inside background workers / CLI verification; scoped by orgId.
// =============================================================================

export async function getAnalysisByIdAdmin(
  analysisId: string,
  orgId?: string
): Promise<AnalysisRecord | null> {
  const admin = createSupabaseAdminClient();
  let query = admin.from('analyses').select(ANALYSIS_COLUMNS).eq('id', analysisId);
  if (orgId) {
    query = query.eq('org_id', orgId);
  }
  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(
      `[CodoGraph Storage] Failed to fetch analysis ${analysisId} (admin): ${error.message}`
    );
  }

  return (data as AnalysisRecord | null) ?? null;
}

export async function findExistingAnalysisAdmin(
  orgId: string,
  canonicalUrl: string
): Promise<AnalysisRecord | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('analyses')
    .select(ANALYSIS_COLUMNS)
    .eq('org_id', orgId)
    .eq('repository_url', canonicalUrl)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[CodoGraph Storage] Failed to find existing analysis (admin): ${error.message}`
    );
  }

  return (data as AnalysisRecord | null) ?? null;
}

export async function createPendingAnalysisAdmin(
  orgId: string,
  canonicalUrl: string,
  repoName: string,
  branch = 'main'
): Promise<AnalysisRecord> {
  const admin = createSupabaseAdminClient();

  const { data: existingProj, error: projSelectErr } = await admin
    .from('projects')
    .select('id')
    .eq('org_id', orgId)
    .eq('repository_url', canonicalUrl)
    .limit(1)
    .maybeSingle();

  if (projSelectErr) {
    throw new Error(
      `[CodoGraph Storage] Failed querying project (admin): ${projSelectErr.message}`
    );
  }

  let projectId: string;
  if (existingProj?.id) {
    projectId = existingProj.id as string;
  } else {
    const { data: newProj, error: projInsertErr } = await admin
      .from('projects')
      .insert({
        org_id: orgId,
        name: repoName,
        repository_url: canonicalUrl,
        default_branch: branch,
      })
      .select('id')
      .single();

    if (projInsertErr || !newProj?.id) {
      throw new Error(
        `[CodoGraph Storage] Failed creating project (admin): ${
          projInsertErr?.message || 'Unknown error'
        }`
      );
    }

    projectId = newProj.id as string;
  }

  const { data: analysis, error: analysisErr } = await admin
    .from('analyses')
    .insert({
      org_id: orgId,
      project_id: projectId,
      repository_url: canonicalUrl,
      branch,
      status: 'pending',
      stage: 'fetching',
      error_message: null,
      summary: {},
    })
    .select(ANALYSIS_COLUMNS)
    .single();

  if (analysisErr || !analysis) {
    throw new Error(
      `[CodoGraph Storage] Failed creating analysis (admin): ${
        analysisErr?.message || 'Unknown error'
      }`
    );
  }

  return analysis as AnalysisRecord;
}

/**
 * Updates the stage and status of an active analysis over HTTPS.
 * Triggers PostgreSQL broadcast for live UI progress.
 */
export async function updateAnalysisStage(
  analysisId: string,
  orgId: string,
  stage: PipelineStage,
  status?: AnalysisRecord['status']
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const effectiveStatus: AnalysisRecord['status'] =
    status || (stage === 'complete' ? 'completed' : stage);

  let lastErr: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { error } = await admin
        .from('analyses')
        .update({
          stage,
          status: effectiveStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', analysisId)
        .eq('org_id', orgId);

      if (error) {
        throw new Error(error.message);
      }
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  throw lastErr;
}

/**
 * Marks an analysis as failed, persisting the failure reason and failed stage.
 */
export async function markAnalysisFailed(
  analysisId: string,
  orgId: string,
  failedStage: PipelineStage | string,
  errorMessage: string
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('analyses')
    .update({
      status: 'failed',
      stage: failedStage,
      error_message: errorMessage.slice(0, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq('id', analysisId)
    .eq('org_id', orgId);

  if (error) {
    throw new Error(
      `[CodoGraph Storage] Failed marking analysis ${analysisId} failed: ${error.message}`
    );
  }
}

/**
 * Persists complete parser results, roles, routes, metrics, and insights into Supabase over HTTPS.
 */
export async function storeAnalysisResults(
  analysisId: string,
  orgId: string,
  commitHash: string,
  parserResult: ParserResult,
  insights: CodebaseInsight[],
  resolvedBranch?: string
): Promise<AnalysisRecord> {
  const admin = createSupabaseAdminClient();

  const { data: repoRow, error: repoFetchErr } = await admin
    .from('analyses')
    .select('id, repository_url')
    .eq('id', analysisId)
    .eq('org_id', orgId)
    .single();

  if (repoFetchErr || !repoRow) {
    throw new Error(
      `[CodoGraph Storage] Analysis ${analysisId} not found for org ${orgId}: ${
        repoFetchErr?.message || 'Not found'
      }`
    );
  }

  // 1. Mark stage as 'storing'
  await updateAnalysisStage(analysisId, orgId, 'storing', 'storing');

  // 2. Clear any prior child rows for idempotent storage / re-runs (in FK-safe order)
  const childTables = ['routes', 'file_roles', 'insights', 'edges', 'files'] as const;
  for (const table of childTables) {
    const { error: delErr } = await admin
      .from(table)
      .delete()
      .eq('analysis_id', analysisId)
      .eq('org_id', orgId);

    if (delErr) {
      throw new Error(
        `[CodoGraph Storage] Failed clearing prior ${table} rows for analysis ${analysisId}: ${delErr.message}`
      );
    }
  }

  // 3. Batch insert files WITH role and capture generated UUIDs
  const pathToFileId = new Map<string, string>();
  const fileBatchSize = 200;

  for (let i = 0; i < parserResult.files.length; i += fileBatchSize) {
    const chunk = parserResult.files.slice(i, i + fileBatchSize);
    const payload = chunk.map((f) => ({
      org_id: orgId,
      analysis_id: analysisId,
      path: f.path,
      folder: f.folder,
      extension: f.extension,
      lines: f.lines,
      size_bytes: f.sizeBytes,
      content_hash: f.contentHash,
      fan_in: f.fanIn,
      fan_out: f.fanOut,
      role: f.role,
    }));

    const { data: insertedFiles, error: filesErr } = await admin
      .from('files')
      .insert(payload)
      .select('id, path');

    if (filesErr) {
      throw new Error(`[CodoGraph Storage] Failed inserting files batch: ${filesErr.message}`);
    }

    for (const row of insertedFiles ?? []) {
      pathToFileId.set(row.path as string, row.id as string);
    }
  }

  // 4. Batch insert edges
  if (parserResult.edges.length > 0) {
    const edgeRows = parserResult.edges.map((e) => ({
      org_id: orgId,
      analysis_id: analysisId,
      source_file_id: pathToFileId.get(e.sourcePath) || null,
      target_file_id: pathToFileId.get(e.targetPath) || null,
      source_path: e.sourcePath,
      target_path: e.targetPath,
      kind: e.kind,
      specifier: e.specifier,
    }));
    await insertInChunks(admin, 'edges', edgeRows, 200);
  }

  // 5. Batch insert insights
  if (insights.length > 0) {
    const insightRows = insights.map((ins) => ({
      org_id: orgId,
      analysis_id: analysisId,
      kind: ins.kind,
      severity: 'info',
      title: ins.title,
      description: ins.sentence,
      metadata: { files: ins.files, cycles: ins.cycles || [] },
    }));
    await insertInChunks(admin, 'insights', insightRows, 100);
  }

  // 6. Batch insert file roles
  const filesWithRoles = parserResult.files.filter((f) => f.role !== null);
  if (filesWithRoles.length > 0) {
    const roleSource = parserResult.adapter !== 'none' ? 'adapter' : 'convention';
    const roleRows = filesWithRoles.map((f) => ({
      org_id: orgId,
      analysis_id: analysisId,
      file_id: pathToFileId.get(f.path) || null,
      file_path: f.path,
      role: f.role,
      source: roleSource,
      confidence: 1.0,
    }));
    await insertInChunks(admin, 'file_roles', roleRows, 200);
  }

  // 6b. Batch insert extracted routes (Phase 8)
  if (parserResult.routes && parserResult.routes.length > 0) {
    const routeRows = parserResult.routes.map((r) => ({
      org_id: orgId,
      analysis_id: analysisId,
      file_id: pathToFileId.get(r.filePath) || null,
      method: r.method,
      pattern: r.pattern,
      line: typeof r.line === 'number' ? r.line : null,
      framework: r.framework || parserResult.adapter,
    }));
    await insertInChunks(admin, 'routes', routeRows, 200);
  }

  // 7. Calculate coverage ratio and summary statistics
  const coverage = parserResult.coverage;
  const resolvedImports = coverage.importsResolvedInternal;
  const totalImportsToResolve = coverage.importsResolvedInternal + coverage.importsUnresolved;
  const coverageRatio =
    coverage.filesFound > 0 && parserResult.files.length === 0
      ? 0.0
      : totalImportsToResolve > 0
        ? Number(((resolvedImports / totalImportsToResolve) * 100).toFixed(1))
        : 100.0;

  const totalRoutesCount = parserResult.routes.length;
  const unidentifiedCount = parserResult.files.filter(
    (f) => !f.role || f.role === 'module' || f.role === 'unknown'
  ).length;

  const rawUrl = repoRow.repository_url as string | undefined;
  const cleanRepoName = rawUrl
    ? rawUrl.replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '')
    : parserResult.repositoryRoot
      ? path.basename(parserResult.repositoryRoot)
      : 'Repository';

  const summary = {
    repositoryRoot: cleanRepoName,
    filesCount: parserResult.files.length,
    importsCount: parserResult.edges.length,
    routesCount: totalRoutesCount,
    unidentifiedCount,
    adapter: parserResult.adapter,
    routes: parserResult.routes || [],
    coverage: {
      ...coverage,
      coverageRatio,
    },
  };

  // 8. Mark analysis completed
  const completionPayload: Record<string, unknown> = {
    status: 'completed',
    stage: 'complete',
    commit_hash: commitHash,
    summary,
    error_message: null,
    updated_at: new Date().toISOString(),
  };

  if (resolvedBranch && resolvedBranch.trim() !== '') {
    completionPayload.branch = resolvedBranch.trim();
  }

  const { data: finalRow, error: completeErr } = await admin
    .from('analyses')
    .update(completionPayload)
    .eq('id', analysisId)
    .eq('org_id', orgId)
    .select(ANALYSIS_COLUMNS)
    .single();

  if (completeErr || !finalRow) {
    throw new Error(
      `[CodoGraph Storage] Failed finalizing analysis ${analysisId}: ${
        completeErr?.message || 'Unknown error'
      }`
    );
  }

  return finalRow as AnalysisRecord;
}
