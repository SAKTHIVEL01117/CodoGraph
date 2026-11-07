/**
 * CodoGraph — Phase 3: Pure Graph Calculations.
 *
 * Invariant: Graph calculations are pure functions over a file list and an edge list.
 * Computes deduplicated edges, fan-in, fan-out, and distinct folder groupings.
 */
import type { DiscoveredFile, ParsedFile, ParsedEdge } from './types.ts';

/**
 * Deduplicates an edge list so each (sourcePath -> targetPath) connection is counted once per kind.
 */
export function deduplicateEdges(edges: ParsedEdge[]): ParsedEdge[] {
  const seen = new Set<string>();
  const uniqueEdges: ParsedEdge[] = [];

  for (const edge of edges) {
    const key = `${edge.sourcePath}|${edge.targetPath}|${edge.kind}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueEdges.push(edge);
    }
  }

  return uniqueEdges;
}

/**
 * Computes fan-in and fan-out for every file from the deduplicated edge list.
 *
 * - fan_out: Number of distinct internal files that a file depends on / imports.
 * - fan_in:  Number of distinct internal files that depend on / import this file.
 */
export function computeGraphMetrics(
  files: DiscoveredFile[],
  edges: ParsedEdge[],
  classifyFile?: (file: DiscoveredFile) => string | null
): ParsedFile[] {
  // Map of source -> Set of distinct target files
  const outMap = new Map<string, Set<string>>();
  // Map of target -> Set of distinct source files
  const inMap = new Map<string, Set<string>>();

  for (const file of files) {
    outMap.set(file.path, new Set());
    inMap.set(file.path, new Set());
  }

  for (const edge of edges) {
    // Only count internal-to-internal edges
    if (outMap.has(edge.sourcePath)) {
      outMap.get(edge.sourcePath)!.add(edge.targetPath);
    }
    if (inMap.has(edge.targetPath)) {
      inMap.get(edge.targetPath)!.add(edge.sourcePath);
    }
  }

  return files.map((file) => {
    const fanOut = outMap.get(file.path)?.size ?? 0;
    const fanIn = inMap.get(file.path)?.size ?? 0;
    const role = classifyFile ? classifyFile(file) : null;

    return {
      ...file,
      fanIn,
      fanOut,
      role,
    };
  });
}

/**
 * Extracts and sorts all distinct folder paths present in the file list.
 */
export function extractDistinctFolders(files: Array<{ folder: string }>): string[] {
  const folders = new Set<string>();
  for (const f of files) {
    folders.add(f.folder);
  }
  return Array.from(folders).sort();
}
