/**
 * CodoGraph — Phase 12: Agent Tools Graph Service.
 *
 * Requirements (docs/specs/phase-12.md):
 * 1. "Those tools call the SAME graph functions that draw the canvas. They do not reimplement any of it."
 * 2. Pure graph functions imported directly from '@/lib/canvas/metrics'.
 * 3. Scoped strictly to the authenticated analysis and organization from the signed credential.
 * 4. Short-lived LRU/cache prevents repeated database queries across sequential tool calls.
 * 5. Does not accept an analysis ID parameter from tool arguments — target is permanently bound by credential.
 */
import {
  computeRepositorySummary,
  computeFileNeighbours,
  computeTransitiveWalk,
  type RepositorySummary,
  type FileNeighbours,
  type TransitiveWalkResult,
} from '../canvas/metrics.ts';
import { createSupabaseAdminClient } from '../supabase/admin.ts';
import type { ParsedFile, ParsedEdge, ExtractedRoute, CoverageReport } from '../parser/types.ts';
import type { AgentCredentialPayload } from '../auth/agent-credential.ts';

export interface GraphDataset {
  analysisId: string;
  orgId: string;
  repositoryUrl: string;
  files: ParsedFile[];
  edges: ParsedEdge[];
  routes: ExtractedRoute[];
  coverage: CoverageReport;
  cachedAt: number;
}

// In-memory cache for fast multi-tool execution within a single question/turn (TTL: 60s)
const GRAPH_CACHE_TTL_MS = 60 * 1000;
const graphCache = new Map<string, GraphDataset>();

export class ToolExecutionError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ToolExecutionError';
    this.statusCode = statusCode;
  }
}

/**
 * Loads and caches the parsed graph dataset strictly scoped to the credential's analysis and org.
 */
export async function getScopedGraphData(credential: AgentCredentialPayload): Promise<GraphDataset> {
  const { analysisId, orgId } = credential;
  const now = Date.now();

  const cached = graphCache.get(analysisId);
  if (cached && cached.orgId === orgId && now - cached.cachedAt < GRAPH_CACHE_TTL_MS) {
    return cached;
  }

  const supabase = createSupabaseAdminClient();

  // 1. Fetch analysis record, strictly verifying organization ownership
  const { data: analysis, error: analysisErr } = await supabase
    .from('analyses')
    .select('id, org_id, repository_url, status, summary')
    .eq('id', analysisId)
    .maybeSingle();

  if (analysisErr) {
    throw new ToolExecutionError(`Failed to load analysis: ${analysisErr.message}`, 500);
  }

  if (!analysis) {
    throw new ToolExecutionError('Analysis not found.', 404);
  }

  // Cross-tenant verification: verify credential's org_id matches database row
  if (analysis.org_id !== orgId) {
    throw new ToolExecutionError('Unauthorized: Analysis does not belong to the credential organization.', 403);
  }

  // 2. Fetch files, edges, file_roles, routes
  const [filesRes, edgesRes, rolesRes, routesRes] = await Promise.all([
    supabase
      .from('files')
      .select('id, path, folder, extension, lines, size_bytes, content_hash, fan_in, fan_out, role')
      .eq('analysis_id', analysisId)
      .order('path', { ascending: true }),
    supabase
      .from('edges')
      .select('source_path, target_path, kind, specifier')
      .eq('analysis_id', analysisId),
    supabase
      .from('file_roles')
      .select('file_path, role')
      .eq('analysis_id', analysisId),
    supabase
      .from('routes')
      .select('method, pattern, line, framework, file_id')
      .eq('analysis_id', analysisId)
      .order('pattern', { ascending: true }),
  ]);

  if (filesRes.error) {
    throw new ToolExecutionError(`Failed to load files: ${filesRes.error.message}`, 500);
  }

  const fileRows = filesRes.data || [];
  const edgeRows = edgesRes.data || [];
  const roleRows = rolesRes.data || [];
  const routeRows = routesRes.data || [];

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
    kind: e.kind || 'import',
    specifier: e.specifier || '',
  }));

  const summaryObj = (analysis.summary && typeof analysis.summary === 'object' ? analysis.summary : {}) as Record<
    string,
    unknown
  >;

  let routes: ExtractedRoute[] = routeRows.map((r) => ({
    method: r.method,
    pattern: r.pattern,
    filePath: r.file_id ? fileIdToPath.get(r.file_id) || '' : '',
    line: typeof r.line === 'number' ? r.line : undefined,
    framework: r.framework || undefined,
  }));

  if (routes.length === 0 && Array.isArray(summaryObj.routes)) {
    routes = summaryObj.routes as ExtractedRoute[];
  }

  const coverage: CoverageReport = (summaryObj.coverage as CoverageReport) || {
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

  const dataset: GraphDataset = {
    analysisId,
    orgId,
    repositoryUrl: analysis.repository_url,
    files,
    edges,
    routes,
    coverage,
    cachedAt: now,
  };

  graphCache.set(analysisId, dataset);
  return dataset;
}

// =============================================================================
// Six Pure Graph Tool Operations (Phase 12)
// =============================================================================

/**
 * Tool 1: get_analysis_summary
 */
export async function executeSummaryTool(credential: AgentCredentialPayload): Promise<RepositorySummary> {
  const data = await getScopedGraphData(credential);
  const repoName = data.repositoryUrl.replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '') || 'Repository';
  const adapter = (data.coverage as unknown as { framework?: string })?.framework || 'nextjs';
  return computeRepositorySummary(repoName, adapter, data.files, data.edges, data.routes);
}

/**
 * Tool 2: search_files
 */
export async function executeSearchFilesTool(
  credential: AgentCredentialPayload,
  query: string
): Promise<Array<{ path: string; role: string | null; lines: number; fanIn: number; fanOut: number }>> {
  if (!query || typeof query !== 'string') {
    throw new ToolExecutionError('Query parameter is required for search_files.');
  }

  const normalized = query.trim().toLowerCase();
  const data = await getScopedGraphData(credential);

  return data.files
    .filter((f) => f.path.toLowerCase().includes(normalized))
    .slice(0, 50)
    .map((f) => ({
      path: f.path,
      role: f.role,
      lines: f.lines,
      fanIn: f.fanIn,
      fanOut: f.fanOut,
    }));
}

/**
 * Tool 3: list_files_by_role
 */
export async function executeListFilesByRoleTool(
  credential: AgentCredentialPayload,
  role: string
): Promise<Array<{ path: string; role: string; lines: number; fanIn: number; fanOut: number }>> {
  if (!role || typeof role !== 'string') {
    throw new ToolExecutionError('Role parameter is required for list_files_by_role.');
  }

  const normalized = role.trim().toLowerCase();
  const data = await getScopedGraphData(credential);

  return data.files
    .filter((f) => (f.role || '').toLowerCase() === normalized)
    .slice(0, 100)
    .map((f) => ({
      path: f.path,
      role: f.role || normalized,
      lines: f.lines,
      fanIn: f.fanIn,
      fanOut: f.fanOut,
    }));
}

/**
 * Tool 4: get_file_neighbours
 */
export async function executeGetFileNeighboursTool(
  credential: AgentCredentialPayload,
  filePath: string
): Promise<FileNeighbours> {
  if (!filePath || typeof filePath !== 'string') {
    throw new ToolExecutionError('filePath parameter is required for get_file_neighbours.');
  }

  const normalizedPath = filePath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const data = await getScopedGraphData(credential);

  return computeFileNeighbours(normalizedPath, data.edges);
}

/**
 * Tool 5: transitive_walk
 */
export async function executeTransitiveWalkTool(
  credential: AgentCredentialPayload,
  filePath: string,
  direction: 'incoming' | 'outgoing' = 'incoming',
  depth = 2
): Promise<TransitiveWalkResult> {
  if (!filePath || typeof filePath !== 'string') {
    throw new ToolExecutionError('filePath parameter is required for transitive_walk.');
  }

  if (direction !== 'incoming' && direction !== 'outgoing') {
    throw new ToolExecutionError('Direction must be either "incoming" (blast radius) or "outgoing" (dependency tree).');
  }

  const validDepth = Math.max(1, Math.min(Number(depth) || 2, 5));
  const normalizedPath = filePath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const data = await getScopedGraphData(credential);

  return computeTransitiveWalk(normalizedPath, data.edges, direction, validDepth);
}

/**
 * Tool 6: get_route_table
 */
export async function executeGetRouteTableTool(
  credential: AgentCredentialPayload
): Promise<ExtractedRoute[]> {
  const data = await getScopedGraphData(credential);
  return data.routes;
}
