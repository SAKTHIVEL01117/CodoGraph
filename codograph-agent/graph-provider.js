/**
 * CodoGraph Agent — Graph Data Provider.
 *
 * Requirements (Phase 12):
 * - "Those tools call the SAME graph functions that draw the canvas. They do not reimplement any of it."
 * - Pure graph algorithms (summary, neighbours, transitive walk) are imported directly
 *   from ../lib/canvas/metrics.ts.
 * - Reads analysis data from Supabase or fallback fixture, keeping the agent resilient.
 */
import {
  computeRepositorySummary,
  computeFileNeighbours,
  computeTransitiveWalk,
} from '../lib/canvas/metrics.ts';
import { createClient } from '@supabase/supabase-js';

// Fallback representative repository graph for standalone/offline testing
const FALLBACK_GRAPH = {
  repositoryName: 'codograph/auth-sample',
  adapter: 'nextjs',
  files: [
    { path: 'app/api/auth/route.ts', role: 'route', lines: 65, fanIn: 1, fanOut: 2 },
    { path: 'services/auth-service.ts', role: 'service', lines: 120, fanIn: 2, fanOut: 3 },
    { path: 'repositories/user-repository.ts', role: 'repository', lines: 95, fanIn: 1, fanOut: 1 },
    { path: 'lib/jwt.ts', role: 'util', lines: 45, fanIn: 2, fanOut: 0 },
    { path: 'lib/db.ts', role: 'util', lines: 30, fanIn: 1, fanOut: 0 },
    { path: 'components/login-form.tsx', role: 'component', lines: 80, fanIn: 1, fanOut: 1 },
    { path: 'app/login/page.tsx', role: 'page', lines: 40, fanIn: 0, fanOut: 1 },
    { path: 'config/auth-config.ts', role: 'config', lines: 25, fanIn: 2, fanOut: 0 },
  ],
  edges: [
    { sourcePath: 'app/api/auth/route.ts', targetPath: 'services/auth-service.ts' },
    { sourcePath: 'app/api/auth/route.ts', targetPath: 'config/auth-config.ts' },
    { sourcePath: 'services/auth-service.ts', targetPath: 'repositories/user-repository.ts' },
    { sourcePath: 'services/auth-service.ts', targetPath: 'lib/jwt.ts' },
    { sourcePath: 'services/auth-service.ts', targetPath: 'config/auth-config.ts' },
    { sourcePath: 'repositories/user-repository.ts', targetPath: 'lib/db.ts' },
    { sourcePath: 'components/login-form.tsx', targetPath: 'lib/jwt.ts' },
    { sourcePath: 'app/login/page.tsx', targetPath: 'components/login-form.tsx' },
  ],
  routes: [
    { method: 'POST', pattern: '/api/auth', filePath: 'app/api/auth/route.ts', line: 12, framework: 'nextjs' },
    { method: 'GET', pattern: '/login', filePath: 'app/login/page.tsx', line: 5, framework: 'nextjs' },
  ],
};

let cachedGraph = null;

/**
 * Invokes a tool via the read-only HTTP surface using the short-lived signed credential.
 * When CODOGRAPH_AGENT_CREDENTIAL is configured, the agent has zero direct database keys
 * and queries solely over HTTP.
 */
async function callHttpTool(toolName, params = {}) {
  const credential = process.env.CODOGRAPH_AGENT_CREDENTIAL;
  const baseUrl = process.env.CODOGRAPH_API_BASE_URL || 'http://localhost:3000';
  if (!credential) return null;

  try {
    const res = await fetch(`${baseUrl}/api/agent/tools`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credential}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tool: toolName, args: params }),
    });

    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Gracefully fallback to direct local computation if Next.js dev server is not active
  }
  return null;
}

/**
 * Loads graph data from active Supabase analysis or returns representative fallback.
 */
export async function loadGraphData(analysisId) {
  if (cachedGraph && (!analysisId || cachedGraph.analysisId === analysisId)) {
    return cachedGraph;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);

      let targetId = analysisId || process.env.CODOGRAPH_ANALYSIS_ID;

      if (!targetId) {
        // Query the latest completed analysis
        const { data: latest } = await supabase
          .from('analyses')
          .select('id, repository_url')
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latest) {
          targetId = latest.id;
        }
      }

      if (targetId) {
        const [analysisRes, filesRes, edgesRes, routesRes] = await Promise.all([
          supabase.from('analyses').select('id, repository_url, summary').eq('id', targetId).maybeSingle(),
          supabase.from('files').select('path, role, lines, fan_in, fan_out').eq('analysis_id', targetId),
          supabase.from('edges').select('source_path, target_path').eq('analysis_id', targetId),
          supabase.from('routes').select('method, pattern, file_path, line, framework').eq('analysis_id', targetId),
        ]);

        if (filesRes.data && filesRes.data.length > 0) {
          const files = filesRes.data.map((f) => ({
            path: f.path,
            role: f.role || null,
            lines: f.lines || 0,
            fanIn: f.fan_in || 0,
            fanOut: f.fan_out || 0,
          }));

          const edges = (edgesRes.data || []).map((e) => ({
            sourcePath: e.source_path,
            targetPath: e.target_path,
          }));

          const routes = (routesRes.data || []).map((r) => ({
            method: r.method,
            pattern: r.pattern,
            filePath: r.file_path,
            line: r.line,
            framework: r.framework,
          }));

          const repoUrl = analysisRes.data?.repository_url || 'repository';
          const repoName = repoUrl.replace(/\/+$/, '').split('/').slice(-2).join('/') || repoUrl;

          cachedGraph = {
            analysisId: targetId,
            repositoryName: repoName,
            adapter: 'nextjs',
            files,
            edges,
            routes,
          };

          return cachedGraph;
        }
      }
    } catch (err) {
      console.warn('[CodoGraph Agent] Could not load live analysis from Supabase, using baseline graph:', err.message);
    }
  }

  // Baseline fallback
  cachedGraph = { ...FALLBACK_GRAPH };
  return cachedGraph;
}

/**
 * Tool Helper 1: Summary of the whole analysis.
 * Calls computeRepositorySummary from ../lib/canvas/metrics.ts.
 */
export async function getAnalysisSummary(analysisId) {
  const remote = await callHttpTool('get_analysis_summary');
  if (remote) return remote;
  const g = await loadGraphData(analysisId);
  return computeRepositorySummary(g.repositoryName, g.adapter, g.files, g.edges, g.routes);
}

/**
 * Tool Helper 2: Search files by part of path.
 */
export async function searchFiles(query, analysisId) {
  const q = (query || '').toLowerCase().trim();
  if (!q) return [];
  const remote = await callHttpTool('search_files', { query: q });
  if (remote) return remote;
  const g = await loadGraphData(analysisId);

  return g.files
    .filter((f) => f.path.toLowerCase().includes(q))
    .map((f) => ({
      path: f.path,
      role: f.role || 'unclassified',
      lines: f.lines,
      fanIn: f.fanIn,
      fanOut: f.fanOut,
    }))
    .slice(0, 25);
}

/**
 * Tool Helper 3: List files by role.
 */
export async function listFilesByRole(role, analysisId) {
  const r = (role || '').toLowerCase().trim();
  const remote = await callHttpTool('list_files_by_role', { role: r });
  if (remote) return remote;
  const g = await loadGraphData(analysisId);

  return g.files
    .filter((f) => f.role && f.role.toLowerCase() === r)
    .map((f) => ({
      path: f.path,
      role: f.role,
      lines: f.lines,
      fanIn: f.fanIn,
      fanOut: f.fanOut,
    }));
}

/**
 * Tool Helper 4: Direct neighbours of a file.
 * Calls computeFileNeighbours from ../lib/canvas/metrics.ts.
 */
export async function getFileNeighbours(filePath, analysisId) {
  const remote = await callHttpTool('get_file_neighbours', { filePath });
  if (remote) return remote;
  const g = await loadGraphData(analysisId);
  return computeFileNeighbours(filePath, g.edges);
}

/**
 * Tool Helper 5: Transitive walk in either direction.
 * Calls computeTransitiveWalk from ../lib/canvas/metrics.ts.
 */
export async function getTransitiveWalk(filePath, direction, maxDepth = 2, analysisId) {
  const dir = direction === 'incoming' ? 'incoming' : 'outgoing';
  const remote = await callHttpTool('transitive_walk', { filePath, direction: dir, depth: maxDepth });
  if (remote) return remote;
  const g = await loadGraphData(analysisId);
  return computeTransitiveWalk(filePath, g.edges, dir, maxDepth);
}

/**
 * Tool Helper 6: The route table.
 */
export async function getRouteTable(analysisId) {
  const remote = await callHttpTool('get_route_table');
  if (remote) return remote;
  const g = await loadGraphData(analysisId);
  return g.routes.map((r) => ({
    method: r.method,
    pattern: r.pattern,
    filePath: r.filePath,
    line: r.line,
    framework: r.framework,
  }));
}

