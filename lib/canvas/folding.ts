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
 * 5. Every node holds more than one file (whenever the repository has > 1 file).
 * 6. Shortest unique labels among what's on screen.
 * 7. Node height carries fan-in (how many things depend on it). Width comes from label.
 * 8. Deterministic layout: Left-to-right rank distribution.
 */
import type { ParsedFile, ParsedEdge } from '@/lib/parser/types';

export const PANEL_HEADER_H = 44;
export const PANEL_PADDING_Y = 6;
export const PANEL_ROW_H = 24;
export const PANEL_ROW_GAP = 2;
export const PANEL_NOTICE_H = 22;
export const PANEL_MAX_VISIBLE_ROWS = 14;

export function getRelativeFileName(nodeId: string, filePath: string): string {
  if (nodeId !== '.' && nodeId !== '' && filePath.startsWith(`${nodeId}/`)) {
    return filePath.slice(nodeId.length + 1);
  }
  return filePath.split('/').pop() || filePath;
}

export function computeOpenPanelWindow(
  totalFiles: number,
  rawOffset: number = 0
): {
  offset: number;
  visibleCount: number;
  aboveCount: number;
  belowCount: number;
  hasAbove: boolean;
  hasBelow: boolean;
  height: number;
} {
  if (totalFiles <= 0) {
    return {
      offset: 0,
      visibleCount: 0,
      aboveCount: 0,
      belowCount: 0,
      hasAbove: false,
      hasBelow: false,
      height: PANEL_HEADER_H + PANEL_PADDING_Y * 2 + 2,
    };
  }

  const maxOffset = Math.max(0, totalFiles - PANEL_MAX_VISIBLE_ROWS);
  const offset = Math.min(Math.max(0, Math.floor(rawOffset)), maxOffset);
  const visibleCount = Math.min(PANEL_MAX_VISIBLE_ROWS, totalFiles - offset);
  const aboveCount = offset;
  const belowCount = Math.max(0, totalFiles - (offset + visibleCount));
  const hasAbove = aboveCount > 0;
  const hasBelow = belowCount > 0;

  const itemCount = visibleCount + (hasAbove ? 1 : 0) + (hasBelow ? 1 : 0);
  const contentHeight =
    visibleCount * PANEL_ROW_H +
    (hasAbove ? PANEL_NOTICE_H : 0) +
    (hasBelow ? PANEL_NOTICE_H : 0) +
    Math.max(0, itemCount - 1) * PANEL_ROW_GAP;

  // +2 for top/bottom 1px card border
  const height = PANEL_HEADER_H + PANEL_PADDING_Y * 2 + contentHeight + 2;

  return {
    offset,
    visibleCount,
    aboveCount,
    belowCount,
    hasAbove,
    hasBelow,
    height,
  };
}

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

  // Run fresh depth-by-depth folding passes starting at threshold 2
  const maxThreshold = files.length + 1;
  let targetThreshold = 2;
  let finalNodeMap: Map<string, ParsedFile[]> | null = null;
  let lastDirMap = new Map<string, ParsedFile[]>();

  while (targetThreshold <= maxThreshold) {
    const dirMap = new Map<string, ParsedFile[]>();
    for (const f of files) {
      if (!dirMap.has(f.folder)) dirMap.set(f.folder, []);
      dirMap.get(f.folder)!.push(f);
    }

    let maxDepth = 0;
    for (const dir of dirMap.keys()) {
      const d = getDepth(dir);
      if (d > maxDepth) maxDepth = d;
    }

    // Bottom-up level-by-level folding guarantees children fold into parents
    // before those parent directories are evaluated at depth - 1.
    for (let depth = maxDepth; depth >= 1; depth--) {
      const dirsAtDepth = Array.from(dirMap.keys()).filter((d) => getDepth(d) === depth);
      for (const dir of dirsAtDepth) {
        const dirFiles = dirMap.get(dir) || [];
        if (dirFiles.length < targetThreshold) {
          const parent = getParent(dir);
          if (!dirMap.has(parent)) dirMap.set(parent, []);
          dirMap.get(parent)!.push(...dirFiles);
          dirMap.delete(dir);
        }
      }
    }

    // Ensure root '.' does not remain a single-file node when other folders exist
    if (dirMap.has('.') && dirMap.get('.')!.length <= 1 && dirMap.size > 1) {
      const rootFiles = dirMap.get('.')!;
      const candidates = Array.from(dirMap.keys()).filter((d) => d !== '.');
      candidates.sort(
        (a, b) =>
          getDepth(a) - getDepth(b) ||
          dirMap.get(b)!.length - dirMap.get(a)!.length ||
          a.localeCompare(b)
      );
      if (candidates.length > 0) {
        dirMap.get(candidates[0])!.push(...rootFiles);
        dirMap.delete('.');
      }
    }

    lastDirMap = dirMap;

    if (dirMap.size <= 24) {
      finalNodeMap = dirMap;
      break;
    }

    targetThreshold++;
  }

  if (!finalNodeMap) {
    finalNodeMap = lastDirMap;
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
    const sortedFiles = [...nodeFiles].sort((a, b) => a.path.localeCompare(b.path));
    const label = labelMap.get(nodeId) || nodeId;
    const fanIn = inDegree.get(nodeId) || 0;
    const fanOut = outDegree.get(nodeId) || 0;

    const isOpen = openNodeIds.has(nodeId);

    const hasOverflow = sortedFiles.length > PANEL_MAX_VISIBLE_ROWS;
    const panelWindowHeight = computeOpenPanelWindow(
      sortedFiles.length,
      hasOverflow ? 1 : 0
    ).height;
    const maxDisplayNameLen = sortedFiles.reduce((max, f) => {
      return Math.max(max, getRelativeFileName(nodeId, f.path).length);
    }, 0);
    const panelWidth = Math.min(
      360,
      Math.max(264, label.length * 7.5 + 48, maxDisplayNameLen * 6.5 + 108)
    );

    const directCount = sortedFiles.reduce(
      (acc, f) => acc + (f.folder === nodeId ? 1 : 0),
      0
    );
    const foldedSubLen =
      `${directCount}/${sortedFiles.length} files`.length +
      `${fanIn}${fanOut}`.length +
      8;

    // Height proportional to dependencies (fan-in) when folded, panel window height when open
    const height = isOpen
      ? panelWindowHeight
      : Math.min(130, Math.max(46, 46 + Math.round(fanIn * 1.5)));
    const width = isOpen
      ? panelWidth
      : Math.min(260, Math.max(146, label.length * 7.6 + 32, foldedSubLen * 5.6 + 24));

    rawNodes.push({
      id: nodeId,
      label,
      folder: nodeId,
      files: sortedFiles,
      fanIn,
      fanOut,
      width,
      height,
      x: 0,
      y: 0,
      isOpen,
    });
  }

  // Deterministic Hierarchical Layout (Sugiyama RankDir: LR)
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
    if (depth > 20) return 0;
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

  // Position nodes horizontally by cumulative column max width and vertically within layer
  const COLUMN_GAP_X = 130;
  const NODE_SPACING_Y = 26;
  const START_X = 48;
  const START_Y = 60;

  let currentX = START_X;
  for (let lIdx = 0; lIdx < sortedLayerIndices.length; lIdx++) {
    const layerNum = sortedLayerIndices[lIdx];
    const columnNodes = layerBuckets.get(layerNum)!;

    // Deterministic sort within column: by fanIn descending, then label
    columnNodes.sort((a, b) => b.fanIn - a.fanIn || a.label.localeCompare(b.label));

    let currentY = START_Y;
    let colMaxWidth = 0;

    for (const node of columnNodes) {
      node.x = currentX;
      node.y = currentY;
      currentY += node.height + NODE_SPACING_Y;
      if (node.width > colMaxWidth) {
        colMaxWidth = node.width;
      }
    }

    currentX += colMaxWidth + COLUMN_GAP_X;
  }

  return {
    nodes: rawNodes,
    edges: Array.from(rolledEdges.values()),
    thresholdUsed: targetThreshold,
  };
}

export type AnchorKind = 'node' | 'file' | 'above' | 'below';
export type PortSide = 'left' | 'right';

export interface ResolvedAnchor {
  key: string;
  kind: AnchorKind;
  nodeId: string;
  filePath?: string;
  y: number;
}

export interface VisualEdge {
  id: string;
  sourceAnchor: ResolvedAnchor;
  targetAnchor: ResolvedAnchor;
  sourceNodeId: string;
  targetNodeId: string;
  filePairs: Array<{ sourcePath: string; targetPath: string }>;
  weight: number;
  isIntraNode: boolean;
  hasReciprocal: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  srcSide: PortSide;
  tgtSide: PortSide;
  pathData: string;
}

export interface ResolvedVisualGraph {
  visualEdges: VisualEdge[];
  portSides: Map<string, { left: boolean; right: boolean }>;
}

/**
 * Resolves exact anchor key and vertical coordinate Y for a node (or a file row inside an open panel).
 * Shares exact geometry constants with the open panel renderer so edges attach directly to rows.
 */
export function resolveAnchorForFile(
  node: FoldedNode,
  filePath?: string,
  panelOffset: number = 0,
  fileIndexLookup?: Map<string, number>
): ResolvedAnchor {
  if (!node.isOpen || !filePath) {
    return {
      key: `node:${node.id}`,
      kind: 'node',
      nodeId: node.id,
      y: node.y + node.height / 2,
    };
  }

  const idx = fileIndexLookup
    ? fileIndexLookup.get(filePath) ?? -1
    : node.files.findIndex((f) => f.path === filePath);

  const win = computeOpenPanelWindow(node.files.length, panelOffset);
  if (idx < 0) {
    return {
      key: `node:${node.id}`,
      kind: 'node',
      nodeId: node.id,
      y: node.y + win.height / 2,
    };
  }

  // Matches outer 1px border + 44px header + 6px top padding
  const contentTopY = node.y + 1 + PANEL_HEADER_H + PANEL_PADDING_Y;

  if (idx < win.offset) {
    return {
      key: `above:${node.id}`,
      kind: 'above',
      nodeId: node.id,
      y: contentTopY + PANEL_NOTICE_H / 2,
    };
  }

  const rowsStartY =
    contentTopY + (win.hasAbove ? PANEL_NOTICE_H + PANEL_ROW_GAP : 0);

  if (idx < win.offset + win.visibleCount) {
    const localIdx = idx - win.offset;
    return {
      key: `file:${filePath}`,
      kind: 'file',
      nodeId: node.id,
      filePath,
      y:
        rowsStartY +
        localIdx * (PANEL_ROW_H + PANEL_ROW_GAP) +
        PANEL_ROW_H / 2,
    };
  }

  const belowTopY =
    rowsStartY + win.visibleCount * (PANEL_ROW_H + PANEL_ROW_GAP);

  return {
    key: `below:${node.id}`,
    kind: 'below',
    nodeId: node.id,
    y: belowTopY + PANEL_NOTICE_H / 2,
  };
}

/**
 * Builds facing-port cubic Bezier geometry handling L->R, R->L, same-column stacking,
 * reciprocal separation, and intra-panel right-side loops.
 */
export function buildVisualEdgeGeometry(
  srcNode: FoldedNode,
  tgtNode: FoldedNode,
  y1: number,
  y2: number,
  hasReciprocal: boolean = false
): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  srcSide: PortSide;
  tgtSide: PortSide;
  pathData: string;
} {
  // Case 1: Intra-panel right-edge loop connecting visible rows/banners inside one open folder
  if (srcNode.id === tgtNode.id) {
    const x1 = srcNode.x + srcNode.width;
    const x2 = tgtNode.x + tgtNode.width;
    const dy = Math.abs(y2 - y1);
    const bulge = Math.min(72, Math.max(22, 18 + dy * 0.28));
    return {
      x1,
      y1,
      x2,
      y2,
      srcSide: 'right',
      tgtSide: 'right',
      pathData: `M ${x1} ${y1} C ${x1 + bulge} ${y1}, ${x2 + bulge} ${y2}, ${x2} ${y2}`,
    };
  }

  // Case 2: Target sits cleanly to the right of Source (exit right -> enter left)
  if (tgtNode.x >= srcNode.x + srcNode.width - 8) {
    const x1 = srcNode.x + srcNode.width;
    const x2 = tgtNode.x;
    const dx = Math.max(44, Math.min(200, (x2 - x1) * 0.48));
    const bow = hasReciprocal ? -18 : 0;
    return {
      x1,
      y1,
      x2,
      y2,
      srcSide: 'right',
      tgtSide: 'left',
      pathData: `M ${x1} ${y1} C ${x1 + dx} ${y1 + bow}, ${x2 - dx} ${y2 + bow}, ${x2} ${y2}`,
    };
  }

  // Case 3: Target sits cleanly to the left of Source (exit facing left -> enter facing right)
  if (tgtNode.x + tgtNode.width <= srcNode.x + 8) {
    const x1 = srcNode.x;
    const x2 = tgtNode.x + tgtNode.width;
    const dx = Math.max(44, Math.min(200, (x1 - x2) * 0.48));
    const bow = hasReciprocal ? 18 : 0;
    return {
      x1,
      y1,
      x2,
      y2,
      srcSide: 'left',
      tgtSide: 'right',
      pathData: `M ${x1} ${y1} C ${x1 - dx} ${y1 + bow}, ${x2 + dx} ${y2 + bow}, ${x2} ${y2}`,
    };
  }

  // Case 4: Same column / horizontally overlapping boxes (route cleanly around right edge)
  const x1 = srcNode.x + srcNode.width;
  const x2 = tgtNode.x + tgtNode.width;
  const dy = Math.abs(y2 - y1);
  const extraShift = hasReciprocal && srcNode.id > tgtNode.id ? 14 : 0;
  const outerX =
    Math.max(x1, x2) + Math.min(96, Math.max(36, 26 + dy * 0.16)) + extraShift;

  return {
    x1,
    y1,
    x2,
    y2,
    srcSide: 'right',
    tgtSide: 'right',
    pathData: `M ${x1} ${y1} C ${outerX} ${y1}, ${outerX} ${y2}, ${x2} ${y2}`,
  };
}

/**
 * Resolves all concrete visual edges from raw file-to-file imports:
 * - Closed folders attach at folder midpoint.
 * - Open folders attach directly to every connected visible file row (or above/below overflow bar).
 * - Intra-folder file imports render as individual row-to-row arcs when their panel is open.
 */
export function resolveVisualEdges(
  nodes: FoldedNode[],
  rawEdges: ParsedEdge[],
  panelOffsets: Record<string, number> = {}
): ResolvedVisualGraph {
  const nodeMap = new Map<string, FoldedNode>(nodes.map((n) => [n.id, n]));
  const fileIndexLookup = new Map<string, Map<string, number>>();
  const fileToNode = new Map<string, FoldedNode>();

  for (const node of nodes) {
    const idxMap = new Map<string, number>();
    for (let i = 0; i < node.files.length; i++) {
      const f = node.files[i];
      fileToNode.set(f.path, node);
      idxMap.set(f.path, i);
    }
    fileIndexLookup.set(node.id, idxMap);
  }

  interface GroupedEdge {
    id: string;
    sourceAnchor: ResolvedAnchor;
    targetAnchor: ResolvedAnchor;
    sourceNodeId: string;
    targetNodeId: string;
    filePairs: Array<{ sourcePath: string; targetPath: string }>;
    isIntraNode: boolean;
  }

  const grouped = new Map<string, GroupedEdge>();

  for (const rawEdge of rawEdges) {
    if (rawEdge.sourcePath === rawEdge.targetPath) continue;

    const srcNode = fileToNode.get(rawEdge.sourcePath);
    const tgtNode = fileToNode.get(rawEdge.targetPath);
    if (!srcNode || !tgtNode) continue;

    const isIntraNode = srcNode.id === tgtNode.id;
    // Closed folders do not draw self-loops; internal links appear when opened into file rows
    if (isIntraNode && !srcNode.isOpen) continue;

    const srcOffset = panelOffsets[srcNode.id] ?? 0;
    const tgtOffset = panelOffsets[tgtNode.id] ?? 0;

    const sourceAnchor = resolveAnchorForFile(
      srcNode,
      rawEdge.sourcePath,
      srcOffset,
      fileIndexLookup.get(srcNode.id)
    );
    const targetAnchor = resolveAnchorForFile(
      tgtNode,
      rawEdge.targetPath,
      tgtOffset,
      fileIndexLookup.get(tgtNode.id)
    );

    // Skip degenerate self-loops inside the same collapsed 'above' / 'below' bucket
    if (sourceAnchor.key === targetAnchor.key) continue;

    const key = `${sourceAnchor.key}->${targetAnchor.key}`;
    let entry = grouped.get(key);
    if (!entry) {
      entry = {
        id: key,
        sourceAnchor,
        targetAnchor,
        sourceNodeId: srcNode.id,
        targetNodeId: tgtNode.id,
        filePairs: [],
        isIntraNode,
      };
      grouped.set(key, entry);
    }
    entry.filePairs.push({
      sourcePath: rawEdge.sourcePath,
      targetPath: rawEdge.targetPath,
    });
  }

  const visualEdges: VisualEdge[] = [];
  const portSides = new Map<string, { left: boolean; right: boolean }>();

  const recordPort = (anchorKey: string, side: PortSide) => {
    let entry = portSides.get(anchorKey);
    if (!entry) {
      entry = { left: false, right: false };
      portSides.set(anchorKey, entry);
    }
    entry[side] = true;
  };

  for (const entry of grouped.values()) {
    const srcNode = nodeMap.get(entry.sourceNodeId);
    const tgtNode = nodeMap.get(entry.targetNodeId);
    if (!srcNode || !tgtNode) continue;

    const reverseKey = `${entry.targetAnchor.key}->${entry.sourceAnchor.key}`;
    const hasReciprocal = grouped.has(reverseKey);

    const geom = buildVisualEdgeGeometry(
      srcNode,
      tgtNode,
      entry.sourceAnchor.y,
      entry.targetAnchor.y,
      hasReciprocal
    );

    recordPort(entry.sourceAnchor.key, geom.srcSide);
    recordPort(entry.targetAnchor.key, geom.tgtSide);

    visualEdges.push({
      id: entry.id,
      sourceAnchor: entry.sourceAnchor,
      targetAnchor: entry.targetAnchor,
      sourceNodeId: entry.sourceNodeId,
      targetNodeId: entry.targetNodeId,
      filePairs: entry.filePairs,
      weight: entry.filePairs.length,
      isIntraNode: entry.isIntraNode,
      hasReciprocal,
      ...geom,
    });
  }

  return { visualEdges, portSides };
}
