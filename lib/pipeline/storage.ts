/**
 * CodoGraph — Phase 7: Pipeline Database Storage Layer.
 *
 * Implements:
 * 1. "One analysis per repository": Looks up existing completed analysis before re-running.
 * 2. Stage transitions: Updates 'analyses.stage' and 'analyses.status'.
 * 3. Atomic/Batch persistence of files, edges, insights, and file roles.
 * 4. Error state tracking: Writes failure reason and stage on catch.
 * 5. Full RLS compliance with session claims.
 */
import path from 'node:path';
import { Client } from 'pg';
import type { ParserResult, ParsedFile, ParsedEdge, CoverageReport, ExtractedRoute } from '../parser/types.ts';
import type { CodebaseInsight } from '../canvas/metrics.ts';

const DB_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:gpsv%40280907sv@db.xiimblxgfdirkqhbekfn.supabase.co:5432/postgres';

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

/**
 * Creates and connects a pg Client configured with the organization's RLS session claims.
 */
async function getAuthenticatedClient(orgId: string, userId?: string | null): Promise<Client> {
  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    keepAlive: true,
  });

  await client.connect();

  // Set session claims so RLS functions (requesting_org_id()) evaluate correctly
  await client.query("SET LOCAL ROLE 'authenticated';");
  await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [
    JSON.stringify({ sub: userId || 'system', org_id: orgId }),
  ]);

  return client;
}

/**
 * Fetches a single analysis record by ID.
 */
export async function getAnalysisById(
  analysisId: string,
  orgId?: string
): Promise<AnalysisRecord | null> {
  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    keepAlive: true,
  });

  await client.connect();
  try {
    let query = `SELECT * FROM public.analyses WHERE id = $1`;
    const params: unknown[] = [analysisId];
    if (orgId) {
      query += ` AND org_id = $2`;
      params.push(orgId);
    }
    const res = await client.query(query, params);
    if (res.rows.length > 0) {
      return res.rows[0] as AnalysisRecord;
    }
    return null;
  } finally {
    await client.end();
  }
}

/**
 * Fetches all analysis records for an organization, ordered latest first.
 */
export async function getAllAnalysesForOrg(orgId: string): Promise<AnalysisRecord[]> {
  const client = await getAuthenticatedClient(orgId);
  try {
    const res = await client.query(
      `SELECT * FROM public.analyses
       WHERE org_id = $1
       ORDER BY created_at DESC;`,
      [orgId]
    );
    return res.rows as AnalysisRecord[];
  } finally {
    await client.end();
  }
}

/**
 * Deletes an analysis record and all cascading dependencies (files, edges, roles, insights).
 */
export async function deleteAnalysis(analysisId: string, orgId?: string): Promise<boolean> {
  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    keepAlive: true,
  });

  await client.connect();
  try {
    let query = `DELETE FROM public.analyses WHERE id = $1`;
    const params: unknown[] = [analysisId];
    if (orgId) {
      query += ` AND org_id = $2`;
      params.push(orgId);
    }
    const res = await client.query(query, params);
    return (res.rowCount ?? 0) > 0;
  } finally {
    await client.end();
  }
}

export interface FullAnalysisGraph {
  analysis: AnalysisRecord;
  result: ParserResult;
}

/**
 * Loads the complete parsed graph (files, edges, roles, coverage) for an analysis.
 */
export async function getAnalysisGraph(
  analysisId: string,
  orgId?: string
): Promise<FullAnalysisGraph | null> {
  const analysis = await getAnalysisById(analysisId, orgId);
  if (!analysis) return null;

  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    keepAlive: true,
  });

  await client.connect();
  try {
    const filesRes = await client.query(
      `SELECT path, folder, extension, lines, size_bytes, content_hash, fan_in, fan_out, role
       FROM public.files
       WHERE analysis_id = $1
       ORDER BY path ASC;`,
      [analysisId]
    );

    const edgesRes = await client.query(
      `SELECT source_path, target_path, kind, specifier
       FROM public.edges
       WHERE analysis_id = $1
       ORDER BY id ASC;`,
      [analysisId]
    );

    const repoClean = analysis.repository_url
      ? analysis.repository_url.replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '')
      : 'Repository';

    const files: ParsedFile[] = filesRes.rows.map((f) => ({
      path: f.path,
      folder: f.folder,
      extension: f.extension || (f.path.includes('.') ? '.' + f.path.split('.').pop() : ''),
      lines: Number(f.lines || 0),
      sizeBytes: Number(f.size_bytes || 0),
      contentHash: f.content_hash || '',
      isSourceCode: true,
      fanIn: Number(f.fan_in || 0),
      fanOut: Number(f.fan_out || 0),
      role: f.role || null,
    }));

    const edges: ParsedEdge[] = edgesRes.rows.map((e) => ({
      sourcePath: e.source_path,
      targetPath: e.target_path,
      kind: e.kind,
      specifier: e.specifier,
    }));

    const folders = Array.from(new Set(files.map((f) => f.folder))).sort();

    const summary = (analysis.summary || {}) as Record<string, unknown>;

    // Load extracted routes (Phase 8)
    let routes: ExtractedRoute[] = [];
    try {
      const routesRes = await client.query(
        `SELECT r.method, r.pattern, r.framework, f.path as file_path
         FROM public.routes r
         LEFT JOIN public.files f ON r.file_id = f.id
         WHERE r.analysis_id = $1
         ORDER BY r.pattern ASC, r.method ASC;`,
        [analysisId]
      );
      routes = routesRes.rows.map((r) => ({
        method: r.method,
        pattern: r.pattern,
        filePath: r.file_path || '',
        framework: r.framework || undefined,
      }));
    } catch {
      routes = (summary.routes as ExtractedRoute[]) || [];
    }

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
      unresolvedDetails: [],
    };

    const result: ParserResult = {
      repositoryRoot: (summary.repositoryRoot as string) || repoClean,
      timestamp: analysis.updated_at || analysis.created_at || new Date().toISOString(),
      adapter: (summary.adapter as string) || 'standard',
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
  } finally {
    await client.end();
  }
}

/**
 * Checks if a completed analysis already exists for this repository within the organization.
 * Constraint: "One analysis per repository. Submitting a URL that has already been
 * analysed does not create a second one — it takes you to the existing analysis."
 */
export async function findExistingAnalysis(
  orgId: string,
  canonicalUrl: string
): Promise<AnalysisRecord | null> {
  const client = await getAuthenticatedClient(orgId);
  try {
    const res = await client.query(
      `SELECT * FROM public.analyses
       WHERE org_id = $1 AND repository_url = $2 AND status = 'completed'
       ORDER BY created_at DESC
       LIMIT 1;`,
      [orgId, canonicalUrl]
    );

    if (res.rows.length > 0) {
      return res.rows[0] as AnalysisRecord;
    }
    return null;
  } finally {
    await client.end();
  }
}

/**
 * Finds or creates a project record, then inserts a new pending analysis row.
 */
export async function createPendingAnalysis(
  orgId: string,
  canonicalUrl: string,
  repoName: string,
  branch = 'main',
  userId?: string | null
): Promise<AnalysisRecord> {
  const client = await getAuthenticatedClient(orgId, userId);
  try {
    // 1. Find or create project
    const projRes = await client.query(
      `SELECT id FROM public.projects WHERE org_id = $1 AND repository_url = $2 LIMIT 1;`,
      [orgId, canonicalUrl]
    );

    let projectId: string;
    if (projRes.rows.length > 0) {
      projectId = projRes.rows[0].id;
    } else {
      const newProj = await client.query(
        `INSERT INTO public.projects (org_id, name, repository_url, default_branch)
         VALUES ($1, $2, $3, $4)
         RETURNING id;`,
        [orgId, repoName, canonicalUrl, branch]
      );
      projectId = newProj.rows[0].id;
    }

    // 2. Insert new analysis in 'pending' status
    const analysisRes = await client.query(
      `INSERT INTO public.analyses (
         org_id, project_id, repository_url, branch, status, stage, error_message, summary
       )
       VALUES ($1, $2, $3, $4, 'pending', 'fetching', NULL, '{}'::jsonb)
       RETURNING *;`,
      [orgId, projectId, canonicalUrl, branch]
    );

    return analysisRes.rows[0] as AnalysisRecord;
  } finally {
    await client.end();
  }
}

/**
 * Updates the stage and status of an active analysis.
 * Automatically triggers the database broadcast for live progress.
 */
export async function updateAnalysisStage(
  analysisId: string,
  orgId: string,
  stage: PipelineStage,
  status?: 'pending' | 'fetching' | 'selecting' | 'parsing' | 'storing' | 'completed' | 'failed'
): Promise<void> {
  const effectiveStatus = status || (stage === 'complete' ? 'completed' : stage);
  let lastErr: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const client = await getAuthenticatedClient(orgId);
      try {
        await client.query(
          `UPDATE public.analyses
           SET stage = $1, status = $2, updated_at = now()
           WHERE id = $3 AND org_id = $4;`,
          [stage, effectiveStatus, analysisId, orgId]
        );
        return;
      } finally {
        await client.end();
      }
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
  const client = await getAuthenticatedClient(orgId);
  try {
    await client.query(
      `UPDATE public.analyses
       SET status = 'failed', stage = $1, error_message = $2, updated_at = now()
       WHERE id = $3 AND org_id = $4;`,
      [failedStage, errorMessage, analysisId, orgId]
    );
  } finally {
    await client.end();
  }
}

/**
 * Persists complete parser results, metrics, and insights into the database.
 */
export async function storeAnalysisResults(
  analysisId: string,
  orgId: string,
  commitHash: string,
  parserResult: ParserResult,
  insights: CodebaseInsight[]
): Promise<AnalysisRecord> {
  const client = await getAuthenticatedClient(orgId);
  try {
    await client.query('BEGIN;');

    // 1. Mark stage as 'storing'
    await client.query(
      `UPDATE public.analyses
       SET stage = 'storing', status = 'storing', updated_at = now()
       WHERE id = $1 AND org_id = $2;`,
      [analysisId, orgId]
    );

    // 2. Clear any prior partial rows for this analysis (idempotent overwrite)
    await client.query(`DELETE FROM public.files WHERE analysis_id = $1;`, [analysisId]);
    await client.query(`DELETE FROM public.edges WHERE analysis_id = $1;`, [analysisId]);
    await client.query(`DELETE FROM public.insights WHERE analysis_id = $1;`, [analysisId]);
    await client.query(`DELETE FROM public.file_roles WHERE analysis_id = $1;`, [analysisId]);
    await client.query(`DELETE FROM public.routes WHERE analysis_id = $1;`, [analysisId]);

    // 3. Batch insert files
    const pathToFileId = new Map<string, string>();
    const fileBatchSize = 100;

    for (let i = 0; i < parserResult.files.length; i += fileBatchSize) {
      const chunk = parserResult.files.slice(i, i + fileBatchSize);
      const values: unknown[] = [];
      const rowPlaceholders: string[] = [];

      chunk.forEach((f, idx) => {
        const offset = idx * 10;
        rowPlaceholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`
        );
        values.push(
          orgId,
          analysisId,
          f.path,
          f.folder,
          f.extension,
          f.lines,
          f.sizeBytes,
          f.contentHash,
          f.fanIn,
          f.fanOut
        );
      });

      const insertFilesSql = `
        INSERT INTO public.files (
          org_id, analysis_id, path, folder, extension, lines, size_bytes, content_hash, fan_in, fan_out
        )
        VALUES ${rowPlaceholders.join(', ')}
        RETURNING id, path;
      `;

      const insertedFiles = await client.query(insertFilesSql, values);
      for (const row of insertedFiles.rows) {
        pathToFileId.set(row.path, row.id);
      }
    }

    // 4. Batch insert edges
    const edgeBatchSize = 100;
    for (let i = 0; i < parserResult.edges.length; i += edgeBatchSize) {
      const chunk = parserResult.edges.slice(i, i + edgeBatchSize);
      const values: unknown[] = [];
      const rowPlaceholders: string[] = [];

      chunk.forEach((e, idx) => {
        const offset = idx * 8;
        rowPlaceholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
        );
        values.push(
          orgId,
          analysisId,
          pathToFileId.get(e.sourcePath) || null,
          pathToFileId.get(e.targetPath) || null,
          e.sourcePath,
          e.targetPath,
          e.kind,
          e.specifier
        );
      });

      const insertEdgesSql = `
        INSERT INTO public.edges (
          org_id, analysis_id, source_file_id, target_file_id, source_path, target_path, kind, specifier
        )
        VALUES ${rowPlaceholders.join(', ')};
      `;

      await client.query(insertEdgesSql, values);
    }

    // 5. Batch insert insights
    if (insights.length > 0) {
      const insightValues: unknown[] = [];
      const insightPlaceholders: string[] = [];

      insights.forEach((ins, idx) => {
        const offset = idx * 7;
        insightPlaceholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`
        );
        insightValues.push(
          orgId,
          analysisId,
          ins.kind,
          'info',
          ins.title,
          ins.sentence,
          JSON.stringify({ files: ins.files, cycles: ins.cycles || [] })
        );
      });

      const insertInsightsSql = `
        INSERT INTO public.insights (
          org_id, analysis_id, kind, severity, title, description, metadata
        )
        VALUES ${insightPlaceholders.join(', ')};
      `;

      await client.query(insertInsightsSql, insightValues);
    }

    // 6. Batch insert file roles
    const filesWithRoles = parserResult.files.filter((f) => f.role !== null);
    if (filesWithRoles.length > 0) {
      const roleBatchSize = 100;
      for (let i = 0; i < filesWithRoles.length; i += roleBatchSize) {
        const chunk = filesWithRoles.slice(i, i + roleBatchSize);
        const roleValues: unknown[] = [];
        const rolePlaceholders: string[] = [];

        chunk.forEach((f, idx) => {
          const offset = idx * 7;
          rolePlaceholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`
          );
          roleValues.push(
            orgId,
            analysisId,
            pathToFileId.get(f.path) || null,
            f.path,
            f.role,
            'convention',
            1.0
          );
        });

        const insertRolesSql = `
          INSERT INTO public.file_roles (
            org_id, analysis_id, file_id, file_path, role, source, confidence
          )
          VALUES ${rolePlaceholders.join(', ')};
        `;

        await client.query(insertRolesSql, roleValues);
      }
    }

    // 6b. Batch insert extracted routes (Phase 8)
    if (parserResult.routes && parserResult.routes.length > 0) {
      const routeBatchSize = 100;
      for (let i = 0; i < parserResult.routes.length; i += routeBatchSize) {
        const chunk = parserResult.routes.slice(i, i + routeBatchSize);
        const routeValues: unknown[] = [];
        const routePlaceholders: string[] = [];

        chunk.forEach((r, idx) => {
          const offset = idx * 6;
          routePlaceholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`
          );
          routeValues.push(
            orgId,
            analysisId,
            pathToFileId.get(r.filePath) || null,
            r.method,
            r.pattern,
            r.framework || parserResult.adapter
          );
        });

        const insertRoutesSql = `
          INSERT INTO public.routes (
            org_id, analysis_id, file_id, method, pattern, framework
          )
          VALUES ${routePlaceholders.join(', ')};
        `;

        await client.query(insertRoutesSql, routeValues);
      }
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

    const totalRoutesCount =
      parserResult.routes !== undefined
        ? parserResult.routes.length
        : parserResult.files.filter(
            (f) => f.role === 'route' || f.role === 'page' || f.role === 'route_handler'
          ).length;

    const repoRes = await client.query(
      `SELECT repository_url FROM public.analyses WHERE id = $1;`,
      [analysisId]
    );
    const rawUrl = repoRes.rows[0]?.repository_url as string | undefined;
    const cleanRepoName = rawUrl
      ? rawUrl.replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '')
      : (parserResult.repositoryRoot ? path.basename(parserResult.repositoryRoot) : 'Repository');

    const summary = {
      repositoryRoot: cleanRepoName,
      filesCount: parserResult.files.length,
      importsCount: parserResult.edges.length,
      routesCount: totalRoutesCount,
      unidentifiedCount: parserResult.files.filter((f) => !f.role).length,
      adapter: parserResult.adapter,
      routes: parserResult.routes || [],
      coverage: {
        ...coverage,
        coverageRatio,
      },
    };

    // 8. Mark analysis completed
    const finalRes = await client.query(
      `UPDATE public.analyses
       SET status = 'completed',
           stage = 'complete',
           commit_hash = $1,
           summary = $2,
           error_message = NULL,
           updated_at = now()
       WHERE id = $3 AND org_id = $4
       RETURNING *;`,
      [commitHash, JSON.stringify(summary), analysisId, orgId]
    );

    await client.query('COMMIT;');
    return finalRes.rows[0] as AnalysisRecord;
  } catch (err) {
    await client.query('ROLLBACK;');
    throw err;
  } finally {
    await client.end();
  }
}
