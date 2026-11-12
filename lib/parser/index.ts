/**
 * CodoGraph — Phase 3: The Parser Orchestrator.
 *
 * Turns a repository on disk into a typed list of file nodes and the real
 * connections between them.
 *
 * Invariants:
 * 1. Imports no web framework, UI library, or database client. Takes a path, returns data.
 * 2. Framework knowledge lives strictly in an adapter (default is fallbackAdapter 'none').
 * 3. Never decides that two files are connected without a real resolved import.
 * 4. Never drops unresolved imports; records the exact diagnostic reason for every failure.
 * 5. Structural file selection; exact coverage math: found = parsed + skipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Project } from 'ts-morph';
import type {
  ParserResult,
  ParsedEdge,
  UnresolvedImport,
  CoverageReport,
} from './types.ts';
import { walkRepository } from './walker.ts';
import { loadTsConfigPaths, resolveModuleSpecifier, type TsConfigPaths } from './resolver.ts';
import { extractModuleSyntaxFromSource } from './ast.ts';
import { deduplicateEdges, computeGraphMetrics, extractDistinctFolders } from './graph.ts';
import type { FrameworkAdapter } from './adapters/types.ts';
import { detectAdapter } from './adapters/index.ts';

export interface ParserOptions {
  /** Optional custom framework adapter. Defaults to fallbackAdapter ('none'). */
  adapter?: FrameworkAdapter;
  /** Optional custom tsconfig paths override. */
  tsConfig?: TsConfigPaths;
  /** Optional progress callback during AST traversal. */
  onProgress?: (current: number, total: number, file: string) => void;
}

/**
 * Parses a repository on disk and returns its typed graph contract and coverage report.
 *
 * @param directoryPath Absolute or relative path to the repository directory.
 * @param options Configuration options for parsing and adapter resolution.
 */
export function parseRepository(
  directoryPath: string,
  options: ParserOptions = {}
): ParserResult {
  const absRoot = path.resolve(directoryPath);
  if (!fs.existsSync(absRoot)) {
    throw new Error(`[CodoGraph Parser] Target directory not found: ${absRoot}`);
  }

  // 1. Walk directory and catalog all source files and skipped files
  const walkResult = walkRepository(absRoot);
  const { sourceFiles, skippedFiles, totalFound } = walkResult;

  // 2. Load TypeScript configuration paths (aliases)
  const tsConfig = options.tsConfig ?? loadTsConfigPaths(absRoot);

  // 3. Resolve framework adapter (evaluates registered adapters in fixed order, falls back to 'none')
  const adapter = options.adapter ?? detectAdapter(absRoot, sourceFiles);

  // 4. Initialize ts-morph project for AST parsing
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: true,
      jsx: 1, // Preserve / React
    },
  });

  // Fast lookup set for known internal source modules
  const knownFiles = new Set<string>(sourceFiles.map((f) => f.path));

  // Graph and coverage accumulators
  const rawEdges: ParsedEdge[] = [];
  const unresolvedDetails: UnresolvedImport[] = [];

  let importsTotal = 0;
  let importsResolvedInternal = 0;
  let importsExternal = 0;
  let importsExcluded = 0;
  let importsUnresolved = 0;

  let reExportsTotal = 0;
  let reExportsResolvedInternal = 0;

  let dynamicImportsTotal = 0;
  let dynamicImportsResolvedInternal = 0;

  let requiresTotal = 0;
  let requiresResolvedInternal = 0;

  const fileExportsMap = new Map<string, string[]>();

  // 5. Parse every discovered source code file
  for (let i = 0; i < sourceFiles.length; i++) {
    const file = sourceFiles[i];
    if (options.onProgress) {
      options.onProgress(i + 1, sourceFiles.length, file.path);
    }

    const fullPath = path.join(absRoot, file.path);
    let content = '';
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      // If unreadable, skip
      continue;
    }

    const { specifiers, exports: cjsExports } = extractModuleSyntaxFromSource(
      file.path,
      content,
      project
    );

    if (cjsExports.length > 0) {
      fileExportsMap.set(file.path, cjsExports);
    }

    for (const item of specifiers) {
      importsTotal++;

      if (item.kind === 're-export') {
        reExportsTotal++;
      } else if (item.kind === 'dynamic_import') {
        dynamicImportsTotal++;
      } else if (item.kind === 'require') {
        requiresTotal++;
      }

      // Non-literal dynamic import or require() (e.g. import(variable), require(variable))
      if (!item.isLiteral) {
        importsUnresolved++;
        const kindLabel = item.kind === 'require' ? 'CommonJS require()' : 'Dynamic import';
        unresolvedDetails.push({
          sourcePath: file.path,
          specifier: item.specifier,
          kind: item.kind,
          reason: `${kindLabel} has non-literal expression: '${item.rawExpression || item.specifier}'`,
        });
        continue;
      }

      // Resolve module specifier
      const res = resolveModuleSpecifier(
        item.specifier,
        file.path,
        absRoot,
        knownFiles,
        tsConfig
      );

      switch (res.type) {
        case 'internal': {
          importsResolvedInternal++;
          if (item.kind === 're-export') {
            reExportsResolvedInternal++;
          } else if (item.kind === 'dynamic_import') {
            dynamicImportsResolvedInternal++;
          } else if (item.kind === 'require') {
            requiresResolvedInternal++;
          }

          rawEdges.push({
            sourcePath: file.path,
            targetPath: res.targetPath,
            kind: item.kind,
            specifier: item.specifier,
          });
          break;
        }

        case 'external': {
          importsExternal++;
          break;
        }

        case 'excluded': {
          importsExcluded++;
          break;
        }

        case 'unresolved': {
          importsUnresolved++;
          unresolvedDetails.push({
            sourcePath: file.path,
            specifier: item.specifier,
            kind: item.kind,
            reason: res.reason,
          });
          break;
        }
      }
    }
  }

  // 6. Deduplicate edges
  const edges = deduplicateEdges(rawEdges);

  // 7. Calculate pure graph metrics (fan-in, fan-out, role classification)
  const files = computeGraphMetrics(sourceFiles, edges, (f) =>
    adapter.classifyFile ? adapter.classifyFile(f, { repositoryRoot: absRoot }) : null
  ).map((f) => {
    const exportedNames = fileExportsMap.get(f.path);
    return exportedNames && exportedNames.length > 0
      ? { ...f, exports: exportedNames }
      : f;
  });

  // 7b. Extract exact routes via the selected framework adapter
  const routes = adapter.extractRoutes
    ? adapter.extractRoutes(absRoot, sourceFiles, project)
    : [];

  // 8. Extract distinct folders
  const folders = extractDistinctFolders(files);

  // 9. Aggregate skip reasons for coverage report
  const skipReasons: Record<string, number> = {};
  for (const skipped of skippedFiles) {
    skipReasons[skipped.reason] = (skipReasons[skipped.reason] || 0) + 1;
  }

  const coverage: CoverageReport = {
    filesFound: totalFound,
    filesParsed: files.length,
    filesSkipped: skippedFiles.length,
    skipReasons,
    skippedFiles,

    importsTotal,
    importsResolvedInternal,
    importsExternal,
    importsExcluded,
    importsUnresolved,

    reExportsTotal,
    reExportsResolvedInternal,

    dynamicImportsTotal,
    dynamicImportsResolvedInternal,

    requiresTotal,
    requiresResolvedInternal,

    unresolvedDetails,
  };

  return {
    repositoryRoot: absRoot,
    timestamp: new Date().toISOString(),
    adapter: adapter.name,
    files,
    edges,
    folders,
    coverage,
    routes,
  };
}

export * from './types.ts';
export * from './walker.ts';
export * from './resolver.ts';
export * from './ast.ts';
export * from './graph.ts';
export * from './adapters/index.ts';
