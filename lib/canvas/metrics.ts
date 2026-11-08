/**
 * CodoGraph — Phase 5 & 6: Pure Graph Metrics, Transitive Walks, & Insights.
 *
 * Invariant: Graph calculations are pure functions over a file list and an edge list.
 * Zero network requests, zero database calls, standalone and deterministic.
 */
import type { ParsedFile, ParsedEdge } from '../parser/types.ts';
import { categorizeFiles, type FileCategory } from './taxonomy.ts';

export interface RepositorySummary {
  repositoryName: string;
  frameworkDetected: string;
  filesCount: number;
  importsCount: number;
  routesCount: number;
  unidentifiedCount: number;
  mostDependedOn: ParsedFile[];
  readingStarts: ParsedFile[];
}

export interface FileNeighbours {
  filePath: string;
  dependencies: string[]; // Distinct outgoing target files
  dependents: string[];   // Distinct incoming source files
}

export interface FolderSummary {
  folderPath: string;
  totalFiles: number;
  fanIn: number;
  fanOut: number;
  categories: FileCategory[];
  roleCounts: Record<string, number>;
  files: ParsedFile[];
}

export type WalkDirection = 'incoming' | 'outgoing';

export interface TransitiveWalkNode {
  path: string;
  depth: number;
}

export interface TransitiveWalkResult {
  startPath: string;
  direction: WalkDirection;
  maxDepth: number;
  level1: string[];
  level2: string[];
  all: TransitiveWalkNode[];
}

export interface CycleResult {
  cycle: string[]; // e.g. [A, B, C, A]
  length: number;
}

export type InsightKind = 'unimported' | 'popular' | 'cycle' | 'oversized';

export interface CodebaseInsight {
  kind: InsightKind;
  title: string;
  sentence: string; // Exactly one of four fixed strings
  files: string[];  // Target file paths
  cycles?: CycleResult[];
}

const FRAMEWORK_DISPLAY_NAMES: Record<string, string> = {
  nextjs: 'Next.js',
  react: 'React',
  nestjs: 'NestJS',
  express: 'Express',
  none: 'None (Generic)',
};

/**
 * Formats framework adapter identifier into human-readable label.
 */
export function formatFrameworkName(adapter: string): string {
  const normalized = adapter.toLowerCase().trim();
  return FRAMEWORK_DISPLAY_NAMES[normalized] || adapter;
}

/**
 * Computes repository summary metrics when nothing is selected.
 */
export function computeRepositorySummary(
  repositoryName: string,
  adapter: string,
  files: ParsedFile[],
  edges: ParsedEdge[]
): RepositorySummary {
  const filesCount = files.length;
  const importsCount = edges.length;

  // Exact or absent convention: count files explicitly designated as routes or pages
  const routesCount = files.filter(
    (f) => f.role === 'route' || f.role === 'page' || f.role === 'route_handler'
  ).length;

  // Unidentified files: no convention could identify an architectural role
  const unidentifiedCount = files.filter(
    (f) => !f.role || f.role === 'module' || f.role === 'unknown'
  ).length;

  // Ranked list 1: What the rest of the repository leans on most (fanIn > 0, descending)
  const mostDependedOn = [...files]
    .filter((f) => f.fanIn > 0)
    .sort((a, b) => b.fanIn - a.fanIn);

  // Ranked list 2: Files nothing imports at all (fanIn === 0, where reading starts)
  const readingStarts = files
    .filter((f) => f.fanIn === 0)
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    repositoryName,
    frameworkDetected: formatFrameworkName(adapter),
    filesCount,
    importsCount,
    routesCount,
    unidentifiedCount,
    mostDependedOn,
    readingStarts,
  };
}

/**
 * Computes distinct incoming and outgoing neighbour file paths for a selected file.
 */
export function computeFileNeighbours(
  filePath: string,
  edges: ParsedEdge[]
): FileNeighbours {
  const outgoingTargets = new Set<string>();
  const incomingSources = new Set<string>();

  for (const edge of edges) {
    if (edge.sourcePath === filePath) {
      outgoingTargets.add(edge.targetPath);
    }
    if (edge.targetPath === filePath) {
      incomingSources.add(edge.sourcePath);
    }
  }

  return {
    filePath,
    dependencies: Array.from(outgoingTargets).sort(),
    dependents: Array.from(incomingSources).sort(),
  };
}

/**
 * Computes folder structure metrics listing what kind of files are inside and how many of each.
 */
export function computeFolderSummary(
  folderPath: string,
  folderFiles: ParsedFile[],
  fanIn: number,
  fanOut: number
): FolderSummary {
  const categories = categorizeFiles(folderFiles);

  const roleCounts: Record<string, number> = {};
  for (const f of folderFiles) {
    const roleKey = f.role || 'unclassified';
    roleCounts[roleKey] = (roleCounts[roleKey] || 0) + 1;
  }

  return {
    folderPath,
    totalFiles: folderFiles.length,
    fanIn,
    fanOut,
    categories,
    roleCounts,
    files: [...folderFiles].sort((a, b) => a.path.localeCompare(b.path)),
  };
}

/**
 * Phase 6: Blast Radius & Dependency Chain Transitive Walk.
 *
 * Implements the unified transitive walk over the edge list:
 * - Direction 'incoming': Blast radius (who breaks if this file changes)
 * - Direction 'outgoing': Dependency chain (everything this file needs)
 * - Two levels deep by default.
 */
export function computeTransitiveWalk(
  startPath: string,
  edges: ParsedEdge[],
  direction: WalkDirection,
  maxDepth = 2
): TransitiveWalkResult {
  const adj = new Map<string, Set<string>>();
  for (const edge of edges) {
    const from = direction === 'incoming' ? edge.targetPath : edge.sourcePath;
    const to = direction === 'incoming' ? edge.sourcePath : edge.targetPath;
    if (!adj.has(from)) adj.set(from, new Set());
    adj.get(from)!.add(to);
  }

  const visited = new Set<string>([startPath]);
  const level1Set = new Set<string>();
  const level2Set = new Set<string>();

  // Level 1: direct neighbours
  const l1Neighbors = adj.get(startPath) || new Set<string>();
  for (const n of l1Neighbors) {
    if (!visited.has(n)) {
      visited.add(n);
      level1Set.add(n);
    }
  }

  // Level 2: transitive neighbours
  if (maxDepth >= 2) {
    for (const l1 of level1Set) {
      const l2Neighbors = adj.get(l1) || new Set<string>();
      for (const n of l2Neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          level2Set.add(n);
        }
      }
    }
  }

  const level1 = Array.from(level1Set).sort();
  const level2 = Array.from(level2Set).sort();
  const all: TransitiveWalkNode[] = [
    ...level1.map((path) => ({ path, depth: 1 })),
    ...level2.map((path) => ({ path, depth: 2 })),
  ];

  return {
    startPath,
    direction,
    maxDepth,
    level1,
    level2,
    all,
  };
}

/**
 * Phase 6: Iterative Cycle Detection.
 *
 * Invariant: Must be iterative (zero recursion) to prevent call stack overflow on large repositories.
 */
export function detectCyclesIterative(
  files: ParsedFile[],
  edges: ParsedEdge[]
): CycleResult[] {
  const adj = new Map<string, string[]>();
  for (const f of files) {
    adj.set(f.path, []);
  }
  for (const e of edges) {
    if (adj.has(e.sourcePath)) {
      adj.get(e.sourcePath)!.push(e.targetPath);
    }
  }

  const visited = new Set<string>();
  const cycles: CycleResult[] = [];
  const seenCycleKeys = new Set<string>();

  const sortedFiles = [...files].map((f) => f.path).sort();

  for (const startNode of sortedFiles) {
    if (visited.has(startNode)) continue;

    // Explicit stack: [node, edgeIndex]
    const stack: Array<{ u: string; edgeIdx: number }> = [
      { u: startNode, edgeIdx: 0 },
    ];
    const path: string[] = [startNode];
    const inPath = new Map<string, number>();
    inPath.set(startNode, 0);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const neighbors = adj.get(frame.u) || [];

      if (frame.edgeIdx < neighbors.length) {
        const v = neighbors[frame.edgeIdx];
        frame.edgeIdx++;

        if (inPath.has(v)) {
          const cycleStartIdx = inPath.get(v)!;
          const cycleNodes = path.slice(cycleStartIdx).concat(v);

          // Canonical signature: rotate to lexicographically smallest node
          const uniqueNodes = path.slice(cycleStartIdx);
          const minElem = uniqueNodes.reduce(
            (min, cur) => (cur < min ? cur : min),
            uniqueNodes[0]
          );
          const minIdx = uniqueNodes.indexOf(minElem);
          const normalized = [
            ...uniqueNodes.slice(minIdx),
            ...uniqueNodes.slice(0, minIdx),
          ].join('->');

          if (!seenCycleKeys.has(normalized)) {
            seenCycleKeys.add(normalized);
            cycles.push({
              cycle: cycleNodes,
              length: uniqueNodes.length,
            });
          }
        } else if (!visited.has(v)) {
          visited.add(v);
          inPath.set(v, path.length);
          path.push(v);
          stack.push({ u: v, edgeIdx: 0 });
        }
      } else {
        stack.pop();
        const popped = path.pop();
        if (popped) {
          inPath.delete(popped);
        }
      }
    }
  }

  return cycles;
}

/**
 * Decides whether a file is reached via framework conventions (pages, routes, layouts, config, etc.)
 * rather than internal import statements.
 */
export function isFrameworkReachedFile(file: ParsedFile): boolean {
  if (
    file.role === 'page' ||
    file.role === 'route' ||
    file.role === 'route_handler' ||
    file.role === 'layout' ||
    file.role === 'middleware' ||
    file.role === 'config'
  ) {
    return true;
  }

  const p = file.path.toLowerCase();
  const base = p.split('/').pop() || '';

  // App / Pages Router conventions
  if (
    base === 'page.tsx' ||
    base === 'page.ts' ||
    base === 'page.jsx' ||
    base === 'page.js' ||
    base === 'route.ts' ||
    base === 'route.js' ||
    base === 'route.tsx'
  ) {
    return true;
  }

  // Layouts, error boundaries, middleware
  if (
    base === 'layout.tsx' ||
    base === 'layout.ts' ||
    base === 'layout.jsx' ||
    base === 'layout.js' ||
    base === 'middleware.ts' ||
    base === 'middleware.js' ||
    base === 'loading.tsx' ||
    base === 'error.tsx' ||
    base === 'not-found.tsx' ||
    base === 'template.tsx' ||
    base === 'default.tsx'
  ) {
    return true;
  }

  // Configuration files
  if (
    base.includes('config.') ||
    base === 'tsconfig.json' ||
    base.startsWith('tsconfig.') ||
    base === 'package.json'
  ) {
    return true;
  }

  return false;
}

/**
 * Phase 6: Computes all four kinds of codebase insights.
 *
 * Invariant: Exactly four fixed strings; files-nothing-imports leads the list;
 * pages, routes, layouts, config are excluded from unimported.
 */
export function computeCodebaseInsights(
  files: ParsedFile[],
  edges: ParsedEdge[]
): CodebaseInsight[] {
  // 1. Files nothing imports (excluding framework-reached files)
  const unimportedFiles = files
    .filter((f) => f.fanIn === 0 && !isFrameworkReachedFile(f))
    .map((f) => f.path)
    .sort();

  // 2. Files an unusual number of things import (fanIn >= 5 or top central hubs)
  const popularFiles = files
    .filter((f) => f.fanIn >= 5)
    .sort((a, b) => b.fanIn - a.fanIn)
    .map((f) => f.path);

  // 3. Import cycles (iterative detection)
  const cycles = detectCyclesIterative(files, edges);
  const cycleFiles = Array.from(
    new Set(cycles.flatMap((c) => c.cycle.slice(0, -1)))
  ).sort();

  // 4. Files that are simply too long (lines >= 300)
  const oversizedFiles = files
    .filter((f) => f.lines >= 300)
    .sort((a, b) => b.lines - a.lines)
    .map((f) => f.path);

  // Four fixed strings from spec constraints:
  return [
    {
      kind: 'unimported',
      title: 'Files nothing imports',
      sentence: 'Nothing in the repository imports these files.',
      files: unimportedFiles,
    },
    {
      kind: 'popular',
      title: 'Central modules',
      sentence: 'An unusual number of files depend on these modules.',
      files: popularFiles,
    },
    {
      kind: 'cycle',
      title: 'Import cycles',
      sentence: 'These files form an import cycle.',
      files: cycleFiles,
      cycles,
    },
    {
      kind: 'oversized',
      title: 'Oversized files',
      sentence: 'These files exceed the standard length threshold.',
      files: oversizedFiles,
    },
  ];
}
