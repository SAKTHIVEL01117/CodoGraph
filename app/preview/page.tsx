/**
 * CodoGraph — Canvas Preview & Analysis Map Route (Phase 4, 5, 6 & 7).
 *
 * Renders the real repository analysis graph from PostgreSQL:
 * 1. Resolves active organization context.
 * 2. Fetches the exact parsed graph (files, edges, coverage, insights) from the database
 *    when an analysisId is specified.
 * 3. Falls back to static preview-analysis.json if no database record is found.
 * 4. Supplies all organization analyses to the multi-repository switcher dropdown.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import type { ParserResult } from '@/lib/parser/types';
import { resolveOrgContext } from '@/lib/auth/org-context';
import {
  getAnalysisGraph,
  getAllAnalysesForOrg,
  type AnalysisRecord,
} from '@/lib/pipeline/storage';
import { CanvasShell, type AnalysisSummary } from '@/components/canvas/canvas-shell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Repository Canvas — CodoGraph',
  description: 'Three-column architectural dependency canvas',
};

export default async function PreviewPage(props: {
  searchParams?: Promise<{ id?: string; repo?: string }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const ctx = await resolveOrgContext(false);
  const effectiveOrgId =
    ctx.orgId ||
    (process.env.NODE_ENV !== 'production' ? 'org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot' : undefined);

  // 1. Fetch organization analyses catalog
  let orgAnalysesRecords: AnalysisRecord[] = [];
  if (effectiveOrgId) {
    try {
      orgAnalysesRecords = await getAllAnalysesForOrg(effectiveOrgId);
    } catch {
      // Fallback handled below
    }
  }

  // 2. Determine target analysis ID
  let targetId = searchParams.id;
  if (!targetId && searchParams.repo) {
    const cleanSearch = searchParams.repo.toLowerCase().trim();
    const matched = orgAnalysesRecords.find((rec) =>
      rec.repository_url.toLowerCase().includes(cleanSearch)
    );
    if (matched) {
      targetId = matched.id;
    }
  }
  if (!targetId && orgAnalysesRecords.length > 0) {
    targetId = orgAnalysesRecords[0].id;
  }

  let activeResult: ParserResult | null = null;
  let activeRecord: AnalysisRecord | null = null;

  // 3. Attempt loading from database for real repository
  if (targetId && targetId !== 'preview') {
    try {
      let graphData = await getAnalysisGraph(targetId, effectiveOrgId);
      if (!graphData) {
        graphData = await getAnalysisGraph(targetId);
      }
      if (graphData && graphData.result) {
        activeResult = graphData.result;
        activeRecord = graphData.analysis;
      }
    } catch (err) {
      console.warn('[CodoGraph Preview] Failed to load graph from database:', err);
    }
  }

  // 4. Fallback to static scaffolding data ONLY for direct /preview exploration with no parameters
  if (!activeResult) {
    if (searchParams.id || searchParams.repo) {
      // Specific analysis requested but not found in DB
      activeResult = {
        repositoryRoot: searchParams.repo || 'Repository Not Found',
        timestamp: new Date().toISOString(),
        adapter: 'none',
        files: [],
        edges: [],
        folders: [],
        routes: [],
        coverage: {
          filesFound: 0,
          filesParsed: 0,
          filesSkipped: 0,
          skipReasons: {},
          skippedFiles: [],
          importsTotal: 0,
          importsResolvedInternal: 0,
          importsExternal: 0,
          importsExcluded: 0,
          importsUnresolved: 0,
          reExportsTotal: 0,
          reExportsResolvedInternal: 0,
          dynamicImportsTotal: 0,
          dynamicImportsResolvedInternal: 0,
          unresolvedDetails: [],
        },
      };
    } else {
      const dataPath = path.join(process.cwd(), 'data', 'preview-analysis.json');
      if (fs.existsSync(dataPath)) {
        const raw = fs.readFileSync(dataPath, 'utf-8');
        const fullResult = JSON.parse(raw) as ParserResult;
        activeResult = {
          ...fullResult,
          routes: fullResult.routes || [],
          coverage: {
            ...fullResult.coverage,
            skippedFiles: [],
          },
        };
      } else {
        activeResult = {
          repositoryRoot: '.',
          timestamp: new Date().toISOString(),
          adapter: 'none',
          files: [],
          edges: [],
          folders: [],
          routes: [],
          coverage: {
            filesFound: 0,
            filesParsed: 0,
            filesSkipped: 0,
            skipReasons: {},
            skippedFiles: [],
            importsTotal: 0,
            importsResolvedInternal: 0,
            importsExternal: 0,
            importsExcluded: 0,
            importsUnresolved: 0,
            reExportsTotal: 0,
            reExportsResolvedInternal: 0,
            dynamicImportsTotal: 0,
            dynamicImportsResolvedInternal: 0,
            unresolvedDetails: [],
          },
        };
      }
    }
  }

  // Auto-derive routes if missing on existing database record
  if (activeResult && (!activeResult.routes || activeResult.routes.length === 0)) {
    const derivedRoutes: ParserResult['routes'] = [];
    for (const f of activeResult.files) {
      const norm = f.path.replace(/\\/g, '/');
      if (/(?:^|\/)app\/(?:.*\/)?page\.(?:tsx|jsx|js|ts)$/.test(norm)) {
        let pattern = norm.replace(/^.*app\/?/, '').replace(/\/?page\.[a-z0-9]+$/, '');
        pattern = pattern
          .split('/')
          .filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@'))
          .join('/');
        derivedRoutes.push({
          method: 'GET',
          pattern: pattern ? '/' + pattern : '/',
          filePath: f.path,
          framework: 'nextjs',
        });
      } else if (/(?:^|\/)app\/(?:.*\/)?route\.(?:ts|js)$/.test(norm)) {
        let pattern = norm.replace(/^.*app\/?/, '').replace(/\/?route\.[a-z0-9]+$/, '');
        pattern = pattern
          .split('/')
          .filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@'))
          .join('/');
        derivedRoutes.push(
          {
            method: 'GET',
            pattern: pattern ? '/' + pattern : '/',
            filePath: f.path,
            framework: 'nextjs',
          },
          {
            method: 'POST',
            pattern: pattern ? '/' + pattern : '/',
            filePath: f.path,
            framework: 'nextjs',
          }
        );
      } else if (/\.controller\.(?:ts|js)$/.test(norm)) {
        const base = norm.split('/').pop()?.replace(/\.controller\.[a-z0-9]+$/, '') || '';
        const prefix = base === 'app' ? '' : '/' + base;
        derivedRoutes.push(
          { method: 'GET', pattern: prefix || '/', filePath: f.path, framework: 'nestjs' },
          { method: 'GET', pattern: `${prefix}/:id`, filePath: f.path, framework: 'nestjs' },
          { method: 'POST', pattern: prefix || '/', filePath: f.path, framework: 'nestjs' }
        );
      }
    }
    if (derivedRoutes.length > 0) {
      activeResult.routes = derivedRoutes;
    }
  }

  // 5. Build organization analyses list for the switcher dropdown
  let orgAnalyses: AnalysisSummary[] | undefined = undefined;
  if (orgAnalysesRecords.length > 0) {
    orgAnalyses = orgAnalysesRecords.map((rec) => {
      const repoClean = rec.repository_url
        ? rec.repository_url.replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '')
        : 'Repository';
      const isCurrent = rec.id === (activeRecord?.id || targetId);

      return {
        id: rec.id,
        repository: repoClean,
        branch: rec.branch || 'main',
        state: rec.status === 'completed' ? 'complete' : (rec.status as AnalysisSummary['state']),
        commit: rec.commit_hash ? rec.commit_hash.slice(0, 7) : null,
        result: isCurrent ? activeResult! : undefined,
      };
    });
  }

  const initialId = targetId || (searchParams.repo?.includes('next') ? '5' : '4');
  const resolvedAnalysis: ParserResult = activeResult || {
    repositoryRoot: 'Repository',
    timestamp: new Date().toISOString(),
    adapter: 'none',
    files: [],
    edges: [],
    folders: [],
    routes: [],
    coverage: {
      filesFound: 0,
      filesParsed: 0,
      filesSkipped: 0,
      skipReasons: {},
      skippedFiles: [],
      importsTotal: 0,
      importsResolvedInternal: 0,
      importsExternal: 0,
      importsExcluded: 0,
      importsUnresolved: 0,
      reExportsTotal: 0,
      reExportsResolvedInternal: 0,
      dynamicImportsTotal: 0,
      dynamicImportsResolvedInternal: 0,
      unresolvedDetails: [],
    },
  };

  return (
    <CanvasShell
      key={initialId}
      primaryAnalysis={resolvedAnalysis}
      orgAnalyses={orgAnalyses}
      initialAnalysisId={initialId}
    />
  );
}
