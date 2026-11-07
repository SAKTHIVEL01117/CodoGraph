/**
 * CodoGraph — Phase 4: Pure Directory Folding & Deterministic Graph Calculations.
 *
 * Invariant: Graph calculations are pure functions over a file list and an edge list.
 *
 * Folding Rules from docs/specs/phase-04.md:
 * 1. Every directory starts as its own node.
 * 2. Deepest first: Directories holding fewer than threshold files merge into their parent.
 * 3. If that still leaves more nodes than anyone can read (> 24), raise threshold and go again.
 * 4. Stop at lowest threshold that lands under roughly two dozen.
 * 5. Every node holds more than one file.
 * 6. Shortest unique labels among what's on screen.
 * 7. Node height carries fan-in (how many things depend on it). Width comes from label.
 * 8. Deterministic layout: Left-to-right rank distribution.
 */
import type { ParsedFile, ParsedEdge } from '@/lib/parser/types';

export interface FoldedNode {
  id: string; // Folder path (e.g. "packages/cli/src")
  label: string; // Shortest unique label (e.g. "cli/src")
  folder: string;
  files: ParsedFile[];
  fanIn: number;
  fanOut: number;
  width: number;
  height: number;
  x: number;
  y: number;
  isOpen: boolean;
}

export interface FoldedEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceFile: string;
  targetFile: string;
  filePairs: Array<{ sourcePath: string; targetPath: string }>;
  count: number;
}

export interface FoldedGraph {
  nodes: FoldedNode[];
  edges: FoldedEdge[];
  thresholdUsed: number;
}

/**
 * Computes shortest unique labels for a set of folder paths.
 * Suffix-based disambiguation: "packages/cli" -> "cli" if unique, else "packages/cli".
 */
export function computeShortestUniqueLabels(paths: string[]): Map<string, string> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;

  for (const p of paths) {
    if (p === '.' || p === '') {
      result.set(p, 'root');
      continue;
    }

    const segments = p.split('/').filter(Boolean);
    let label = segments[segments.length - 1];

    for (let depth = 1; depth <= segments.length; depth++) {
      const candidate = segments.slice(segments.length - depth).join('/');
      const collisions = paths.filter((other) => {
        if (other === p) return false;
        const otherSegments = other.split('/').filter(Boolean);
        const otherCandidate = otherSegments
          .slice(Math.max(0, otherSegments.length - depth))
          .join('/');
        return candidate === otherCandidate;
      });

      if (collisions.length === 0) {
        label = candidate;
        break;
      }
      label = candidate;
    }

    result.set(p, label);
  }

  return result;
}

/**
 * Executes deepest-first directory folding until active node count is under roughly two dozen.
 */
export function computeFoldedGraph(
  files: ParsedFile[],
  rawEdges: ParsedEdge[],
  openNodeIds: Set<string> = new Set()
): FoldedGraph {
  if (files.length === 0) {
    return { nodes: [], edges: [], thresholdUsed: 0 };
  }

  // All distinct directories from files
  const allDirectories = new Set<string>();
  for (const f of files) {
    allDirectories.add(f.folder);
  }

  // Parent resolution helper
  const getParent = (dir: string): string => {
    if (dir === '.' || dir === '') return '.';
    const parts = dir.split('/');
    if (parts.length <= 1) return '.';
    parts.pop();
    return parts.join('/');
  };

  const getDepth = (dir: string): number => {
    if (dir === '.' || dir === '') return 0;
    return dir.split('/').length;
  };

  // Run folding passes with increasing thresholds starting from 2
  let targetThreshold = 2;
  let finalNodeMap = new Map<string, ParsedFile[]>();

  while (targetThreshold <= 100) {
    // Fresh pass: start with every directory having its own files
    const dirMap = new Map<string, ParsedFile[]>();
    for (const f of files) {
      if (!dirMap.has(f.folder)) dirMap.set(f.folder, []);
      dirMap.get(f.folder)!.push(f);
    }

    // Sort distinct directories by depth descending (deepest first)
    const sortedDirs = Array.from(dirMap.keys()).sort(
      (a, b) => getDepth(b) - getDepth(a)
    );

    for (const dir of sortedDirs) {
      if (dir === '.') continue; // Root does not merge upward

      const dirFiles = dirMap.get(dir) || [];
      // If holding fewer than threshold files, merge into parent
      if (dirFiles.length < targetThreshold) {
        const parent = getParent(dir);
        if (!dirMap.has(parent)) dirMap.set(parent, []);
        dirMap.get(parent)!.push(...dirFiles);
        dirMap.delete(dir);
      }
    }

    // Filter to active directories with > 0 files
    const activeDirs = Array.from(dirMap.entries()).filter(
      ([, fl]) => fl.length > 0
    );

    // Enforce Invariant 2: Every node holds more than one file.
    // If any active node holds <= 1 file, merge into root or parent
    let hadSingleFile = false;
    for (const [dir, fl] of activeDirs) {
      if (fl.length <= 1 && dir !== '.') {
        const parent = getParent(dir);
        if (!dirMap.has(parent)) dirMap.set(parent, []);
        dirMap.get(parent)!.push(...fl);
        dirMap.delete(dir);
        hadSingleFile = true;
      }
    }

    const currentCount = dirMap.size;

    // Target: under roughly two dozen (<= 24) and each node > 1 file
    if (currentCount <= 24 && (!hadSingleFile || currentCount <= 18)) {
      finalNodeMap = dirMap;
      break;
    }

    targetThreshold++;
  }

  // File path to Node ID lookup
  const fileToNodeId = new Map<string, string>();
  for (const [nodeId, nodeFiles] of finalNodeMap.entries()) {
    for (const f of nodeFiles) {
      fileToNodeId.set(f.path, nodeId);
    }
  }

  // Calculate unique labels for active nodes
  const activePaths = Array.from(finalNodeMap.keys());
  const labelMap = computeShortestUniqueLabels(activePaths);

  // Roll up edges between active nodes
  const rolledEdges = new Map<string, FoldedEdge>();
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const p of activePaths) {
    inDegree.set(p, 0);
    outDegree.set(p, 0);
  }

  for (const edge of rawEdges) {
    const srcNode = fileToNodeId.get(edge.sourcePath);
    const tgtNode = fileToNodeId.get(edge.targetPath);

    if (srcNode && tgtNode && srcNode !== tgtNode) {
      const edgeKey = `${srcNode}->${tgtNode}`;
      if (!rolledEdges.has(edgeKey)) {
        rolledEdges.set(edgeKey, {
          id: edgeKey,
          sourceNodeId: srcNode,
          targetNodeId: tgtNode,
          sourceFile: edge.sourcePath,
          targetFile: edge.targetPath,
          filePairs: [{ sourcePath: edge.sourcePath, targetPath: edge.targetPath }],
          count: 1,
        });
      } else {
        const existing = rolledEdges.get(edgeKey)!;
        existing.count++;
        existing.filePairs.push({ sourcePath: edge.sourcePath, targetPath: edge.targetPath });
      }

      outDegree.set(srcNode, (outDegree.get(srcNode) || 0) + 1);
      inDegree.set(tgtNode, (inDegree.get(tgtNode) || 0) + 1);
    }
  }

  // Build folded node objects
  const rawNodes: FoldedNode[] = [];
  for (const [nodeId, nodeFiles] of finalNodeMap.entries()) {
    const label = labelMap.get(nodeId) || nodeId;
    const fanIn = inDegree.get(nodeId) || 0;
    const fanOut = outDegree.get(nodeId) || 0;

    const isOpen = openNodeIds.has(nodeId);

    // Height proportional to dependencies (fan-in), width from label
    const baseHeight = isOpen ? Math.min(260, 48 + nodeFiles.length * 20) : Math.min(130, Math.max(46, 44 + Math.round(fanIn * 1.5)));
    const width = isOpen ? 220 : Math.max(130, label.length * 8 + 36);

    rawNodes.push({
      id: nodeId,
      label,
      folder: nodeId,
      files: nodeFiles,
      fanIn,
      fanOut,
      width,
      height: baseHeight,
      x: 0,
      y: 0,
      isOpen,
    });
  }

  // Deterministic Hierarchical Layout (Sugiyama RankDir: LR)
  // Layer assignment based on topological distance / dependencies
  const adj = new Map<string, string[]>();
  const revAdj = new Map<string, string[]>();

  for (const n of rawNodes) {
    adj.set(n.id, []);
    revAdj.set(n.id, []);
  }

  for (const e of rolledEdges.values()) {
    adj.get(e.sourceNodeId)?.push(e.targetNodeId);
    revAdj.get(e.targetNodeId)?.push(e.sourceNodeId);
  }

  // Assign layers from longest paths from sources
  const layers = new Map<string, number>();
  const visited = new Set<string>();

  function getLayer(nodeId: string, depth = 0): number {
    if (depth > 20) return 0; // prevent cycle recursion
    if (layers.has(nodeId)) return layers.get(nodeId)!;

    const predecessors = revAdj.get(nodeId) || [];
    if (predecessors.length === 0) {
      layers.set(nodeId, 0);
      return 0;
    }

    let maxPredLayer = 0;
    for (const pred of predecessors) {
      if (!visited.has(pred)) {
        visited.add(pred);
        maxPredLayer = Math.max(maxPredLayer, getLayer(pred, depth + 1) + 1);
        visited.delete(pred);
      }
    }

    layers.set(nodeId, maxPredLayer);
    return maxPredLayer;
  }

  for (const n of rawNodes) {
    getLayer(n.id);
  }

  // Group nodes by layer
  const layerBuckets = new Map<number, FoldedNode[]>();
  for (const n of rawNodes) {
    const l = layers.get(n.id) || 0;
    if (!layerBuckets.has(l)) layerBuckets.set(l, []);
    layerBuckets.get(l)!.push(n);
  }

  const sortedLayerIndices = Array.from(layerBuckets.keys()).sort((a, b) => a - b);

  // Position nodes horizontally by layer and vertically within layer
  const LAYER_SPACING_X = 240;
  const NODE_SPACING_Y = 24;
  const START_X = 40;
  const START_Y = 60;

  for (let lIdx = 0; lIdx < sortedLayerIndices.length; lIdx++) {
    const layerNum = sortedLayerIndices[lIdx];
    const columnNodes = layerBuckets.get(layerNum)!;

    // Deterministic sort within column: by fanIn descending, then label
    columnNodes.sort((a, b) => b.fanIn - a.fanIn || a.label.localeCompare(b.label));

    let currentY = START_Y;
    const x = START_X + lIdx * LAYER_SPACING_X;

    for (const node of columnNodes) {
      node.x = x;
      node.y = currentY;
      currentY += node.height + NODE_SPACING_Y;
    }
  }

  return {
    nodes: rawNodes,
    edges: Array.from(rolledEdges.values()),
    thresholdUsed: targetThreshold,
  };
}
