"use client";

/**
 * CodoGraph — Middle Canvas Column (Phase 4, 5 & 6).
 *
 * Implements the full interactive dependency map canvas:
 * - Deterministic Left-to-Right Sugiyama layout with deepest-first folder folding.
 * - Direct file-to-file & file-to-node edge connections:
 *   - Closed folders aggregate edges smoothly between folder ports.
 *   - Open folders route edges directly to/from every individual connected file row
 *     (and overflow above/below indicators) including right-side intra-panel loops.
 * - Scrollable open panels (14-row window with above/below jump controls, mouse-wheel
 *   scrolling, and auto-scroll-into-view on selection).
 * - Category dimming from the left rail, selection isolation, bidirectional hover,
 *   and 2-level transitive walk highlighting (Blast radius / Dependency chain).
 * - Palette adherence: greyscale surfaces & resting graph; blue selection/hover,
 *   emerald incoming, amber outgoing, and category swatches for file kind dots.
 */
import React, { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import type { ParsedEdge } from '@/lib/parser/types';
import {
  type FoldedNode,
  type FoldedEdge,
  type VisualEdge,
  PANEL_HEADER_H,
  PANEL_PADDING_Y,
  PANEL_ROW_H,
  PANEL_ROW_GAP,
  PANEL_NOTICE_H,
  PANEL_MAX_VISIBLE_ROWS,
  computeOpenPanelWindow,
  getRelativeFileName,
  resolveVisualEdges,
} from '@/lib/canvas/folding';
import type { FileCategory } from '@/lib/canvas/taxonomy';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  GitCommit,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

export interface CanvasAreaProps {
  nodes: FoldedNode[];
  foldedEdges: FoldedEdge[];
  rawEdges?: ParsedEdge[];
  selectedId: string | null;
  hoveredId: string | null;
  activeCategory?: string | null;
  categories?: FileCategory[];
  highlightedPaths?: Set<string> | null;
  activeWalkType?: 'blast_radius' | 'dependency_chain' | null;
  onSelectId: (id: string | null) => void;
  onHoverId: (id: string | null) => void;
  onToggleNodeOpen: (nodeId: string) => void;
}

function computeFitTransform(
  nodesToFit: FoldedNode[],
  viewportW: number,
  viewportH: number
): { x: number; y: number; scale: number } {
  if (nodesToFit.length === 0 || viewportW <= 0 || viewportH <= 0) {
    return { x: 48, y: 40, scale: 0.85 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of nodesToFit) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }

  const bboxW = Math.max(1, maxX - minX);
  const bboxH = Math.max(1, maxY - minY);

  const padX = 48;
  const padTop = 36;
  const padBottom = 56;
  const availW = Math.max(120, viewportW - padX * 2);
  const availH = Math.max(120, viewportH - padTop - padBottom);

  const scale = Math.min(
    1.0,
    Math.max(0.2, Math.min(availW / bboxW, availH / bboxH))
  );
  const x = (viewportW - bboxW * scale) / 2 - minX * scale;
  const y = padTop + (availH - bboxH * scale) / 2 - minY * scale;

  return { x, y, scale };
}

export function CanvasArea({
  nodes,
  foldedEdges,
  rawEdges,
  selectedId,
  hoveredId,
  activeCategory = null,
  categories = [],
  highlightedPaths = null,
  activeWalkType = null,
  onSelectId,
  onHoverId,
  onToggleNodeOpen,
}: CanvasAreaProps) {
  // Manual per-panel scroll overrides; combined with selection-aware auto-centering below
  const [manualOffsets, setManualOffsets] = useState<
    Record<string, { offset: number; lastSelectedId: string | null; topologyKey: string }>
  >({});

  // Category lookup and file -> swatch color map
  const activeCategoryObj = useMemo(() => {
    if (!activeCategory || categories.length === 0) return null;
    return categories.find((c) => c.name === activeCategory) || null;
  }, [activeCategory, categories]);

  const activeCategoryFiles = useMemo(() => {
    if (!activeCategoryObj) return null;
    return new Set<string>(activeCategoryObj.files);
  }, [activeCategoryObj]);

  const fileColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      for (const filePath of cat.files) {
        map.set(filePath, cat.color);
      }
    }
    return map;
  }, [categories]);

  const fileMatchesActiveCategory = useCallback(
    (file: { path: string; extension: string }) => {
      if (!activeCategory) return true;
      if (activeCategoryFiles) {
        return activeCategoryFiles.has(file.path);
      }
      return file.extension === activeCategory;
    },
    [activeCategory, activeCategoryFiles]
  );

  // Fallback synthesis if a caller supplies only foldedEdges without rawEdges
  const effectiveRawEdges: ParsedEdge[] = useMemo(() => {
    if (rawEdges) return rawEdges;
    const seen = new Set<string>();
    const synthesized: ParsedEdge[] = [];
    for (const fe of foldedEdges) {
      for (const pair of fe.filePairs) {
        const key = `${pair.sourcePath}->${pair.targetPath}`;
        if (!seen.has(key)) {
          seen.add(key);
          synthesized.push({
            sourcePath: pair.sourcePath,
            targetPath: pair.targetPath,
            kind: 'import',
            specifier: pair.targetPath,
          });
        }
      }
    }
    return synthesized;
  }, [rawEdges, foldedEdges]);

  // Pan and zoom state
  const [transform, setTransform] = useState({ x: 48, y: 76, scale: 0.85 });
  const isDraggingRef = useRef(false);
  const didDragRef = useRef(false);
  const dragOriginRef = useRef({ clientX: 0, clientY: 0, startX: 0, startY: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fittedTopologyKeyRef = useRef<string | null>(null);
  const prevOpenIdsRef = useRef<Set<string>>(new Set());

  // Node lookup maps
  const nodeMap = useMemo(() => {
    return new Map<string, FoldedNode>(nodes.map((n) => [n.id, n]));
  }, [nodes]);

  const fileCountMap = useMemo(() => {
    return new Map<string, number>(nodes.map((n) => [n.id, n.files.length]));
  }, [nodes]);

  const topologyKey = useMemo(
    () => nodes.map((n) => n.id).sort().join('|'),
    [nodes]
  );

  const openIdsKey = useMemo(
    () =>
      nodes
        .filter((n) => n.isOpen)
        .map((n) => n.id)
        .sort()
        .join('|'),
    [nodes]
  );

  // Derive active row offsets per open panel without triggering synchronous effect setState
  const panelOffsets = useMemo<Record<string, number>>(() => {
    const result: Record<string, number> = {};
    for (const node of nodes) {
      if (!node.isOpen || node.files.length <= PANEL_MAX_VISIBLE_ROWS) {
        result[node.id] = 0;
        continue;
      }
      const maxOffset = node.files.length - PANEL_MAX_VISIBLE_ROWS;
      const entry = manualOffsets[node.id];
      const baseOffset =
        entry && entry.topologyKey === topologyKey
          ? Math.min(maxOffset, Math.max(0, entry.offset))
          : 0;

      if (
        selectedId &&
        (!entry ||
          entry.lastSelectedId !== selectedId ||
          entry.topologyKey !== topologyKey)
      ) {
        const idx = node.files.findIndex((f) => f.path === selectedId);
        if (
          idx >= 0 &&
          (idx < baseOffset || idx >= baseOffset + PANEL_MAX_VISIBLE_ROWS)
        ) {
          result[node.id] = Math.min(
            maxOffset,
            Math.max(0, idx - Math.floor(PANEL_MAX_VISIBLE_ROWS / 2))
          );
          continue;
        }
      }

      result[node.id] = baseOffset;
    }
    return result;
  }, [nodes, manualOffsets, topologyKey, selectedId]);

  const latestOffsetsRef = useRef<Record<string, number>>({});
  const selectedIdRef = useRef<string | null>(selectedId);
  const topologyKeyRef = useRef<string>(topologyKey);

  useEffect(() => {
    latestOffsetsRef.current = panelOffsets;
    selectedIdRef.current = selectedId;
    topologyKeyRef.current = topologyKey;
  }, [panelOffsets, selectedId, topologyKey]);

  // Initial fit + zoom-out-only post-expansion refit (docs/specs/phase-04.md)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || nodes.length === 0) return;

    const currentOpenIds = new Set(
      nodes.filter((n) => n.isOpen).map((n) => n.id)
    );
    const newlyOpenedNodes = nodes.filter(
      (n) => n.isOpen && !prevOpenIdsRef.current.has(n.id)
    );
    prevOpenIdsRef.current = currentOpenIds;

    const isNewTopology = fittedTopologyKeyRef.current !== topologyKey;
    if (!isNewTopology && newlyOpenedNodes.length === 0) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      const vw = el.clientWidth;
      const vh = el.clientHeight;
      if (vw <= 0 || vh <= 0) return;

      const fit = computeFitTransform(nodes, vw, vh);
      if (isNewTopology) {
        fittedTopologyKeyRef.current = topologyKey;
        setTransform(fit);
        return;
      }

      setTransform((prev) => {
        const nextScale = Math.min(prev.scale, fit.scale);
        if (nextScale < prev.scale) {
          return { x: fit.x, y: fit.y, scale: nextScale };
        }

        let nextX = prev.x;
        let nextY = prev.y;
        const padX = 48;
        const padTop = 36;
        const padBottom = 56;

        for (const opened of newlyOpenedNodes) {
          const left = opened.x * nextScale + nextX;
          const right = (opened.x + opened.width) * nextScale + nextX;
          const top = opened.y * nextScale + nextY;
          const bottom = (opened.y + opened.height) * nextScale + nextY;

          if (right > vw - padX) {
            nextX -= right - (vw - padX);
          }
          if (left < padX) {
            nextX += padX - left;
          }
          if (bottom > vh - padBottom) {
            nextY -= bottom - (vh - padBottom);
          }
          if (top < padTop) {
            nextY += padTop - top;
          }
        }

        if (nextX === prev.x && nextY === prev.y && nextScale === prev.scale) {
          return prev;
        }
        return { x: nextX, y: nextY, scale: nextScale };
      });
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [nodes, topologyKey, openIdsKey]);

  // Non-passive wheel: scrolls overflowed open panels or zooms canvas anchored on cursor
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      const panelEl = (e.target as HTMLElement | null)?.closest(
        '[data-scrollable-panel]'
      ) as HTMLElement | null;

      if (panelEl) {
        const panelId = panelEl.getAttribute('data-scrollable-panel');
        const total = panelId ? fileCountMap.get(panelId) ?? 0 : 0;
        if (panelId && total > PANEL_MAX_VISIBLE_ROWS) {
          const maxOffset = total - PANEL_MAX_VISIBLE_ROWS;
          const step = e.deltaY > 0 ? 3 : -3;
          const curVisible = latestOffsetsRef.current[panelId] ?? 0;
          const topo = topologyKeyRef.current;
          const curSel = selectedIdRef.current;
          setManualOffsets((prev) => {
            const existing = prev[panelId];
            const base =
              existing && existing.topologyKey === topo
                ? existing.offset
                : curVisible;
            const next = Math.min(maxOffset, Math.max(0, base + step));
            return {
              ...prev,
              [panelId]: {
                offset: next,
                lastSelectedId: curSel,
                topologyKey: topo,
              },
            };
          });
          return;
        }
      }

      const rect = el.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;

      setTransform((prev) => {
        const nextScale = Math.min(2.0, Math.max(0.2, prev.scale * zoomFactor));
        if (nextScale === prev.scale) return prev;
        const ratio = nextScale / prev.scale;
        return {
          scale: nextScale,
          x: pointerX - (pointerX - prev.x) * ratio,
          y: pointerY - (pointerY - prev.y) * ratio,
        };
      });
    };

    const onWindowMouseUp = () => {
      isDraggingRef.current = false;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [fileCountMap]);

  // Resolve file-level & panel-level visual edges + attached row port sides
  const { visualEdges, portSides } = useMemo(
    () => resolveVisualEdges(nodes, effectiveRawEdges, panelOffsets),
    [nodes, effectiveRawEdges, panelOffsets]
  );

  // Hover state helpers
  const hoveredNodeId = hoveredId && nodeMap.has(hoveredId) ? hoveredId : null;
  const hoveredContainingNodeId = useMemo(() => {
    if (!hoveredId) return null;
    if (nodeMap.has(hoveredId)) return hoveredId;
    const node = nodes.find((n) => n.files.some((f) => f.path === hoveredId));
    return node ? node.id : null;
  }, [hoveredId, nodeMap, nodes]);

  const isEdgeHovered = useCallback(
    (edge: VisualEdge): boolean => {
      if (!hoveredId) return false;
      if (hoveredNodeId) {
        return (
          edge.sourceNodeId === hoveredNodeId ||
          edge.targetNodeId === hoveredNodeId
        );
      }
      return edge.filePairs.some(
        (p) => p.sourcePath === hoveredId || p.targetPath === hoveredId
      );
    },
    [hoveredId, hoveredNodeId]
  );

  // Selection isolation & directional classification over visualEdges
  const activeSelection = useMemo(() => {
    if (!selectedId && !highlightedPaths) return null;

    const connectedNodes = new Set<string>();
    const connectedEdges = new Map<string, 'in' | 'out' | 'active'>();
    const connectedFiles = new Set<string>();

    if (highlightedPaths && selectedId) {
      connectedFiles.add(selectedId);
      for (const p of highlightedPaths) {
        connectedFiles.add(p);
      }

      for (const n of nodes) {
        if (n.files.some((f) => connectedFiles.has(f.path))) {
          connectedNodes.add(n.id);
        }
      }

      const walkDir: 'in' | 'out' | 'active' =
        activeWalkType === 'blast_radius'
          ? 'in'
          : activeWalkType === 'dependency_chain'
          ? 'out'
          : 'active';

      for (const edge of visualEdges) {
        const matches = edge.filePairs.some(
          (pair) =>
            connectedFiles.has(pair.sourcePath) &&
            connectedFiles.has(pair.targetPath)
        );
        if (matches) {
          connectedEdges.set(edge.id, walkDir);
        }
      }

      return {
        connectedNodes,
        connectedEdges,
        connectedFiles,
        selectedId,
        isNodeSelected: false,
      };
    }

    if (!selectedId) return null;

    const isNodeSelected = nodeMap.has(selectedId);

    if (isNodeSelected) {
      connectedNodes.add(selectedId);
      const selectedNode = nodeMap.get(selectedId)!;
      for (const f of selectedNode.files) {
        connectedFiles.add(f.path);
      }

      for (const edge of visualEdges) {
        if (edge.isIntraNode && edge.sourceNodeId === selectedId) {
          connectedEdges.set(edge.id, 'active');
          for (const pair of edge.filePairs) {
            connectedFiles.add(pair.sourcePath);
            connectedFiles.add(pair.targetPath);
          }
        } else if (edge.sourceNodeId === selectedId) {
          connectedEdges.set(edge.id, 'out');
          connectedNodes.add(edge.targetNodeId);
          for (const pair of edge.filePairs) {
            connectedFiles.add(pair.sourcePath);
            connectedFiles.add(pair.targetPath);
          }
        } else if (edge.targetNodeId === selectedId) {
          connectedEdges.set(edge.id, 'in');
          connectedNodes.add(edge.sourceNodeId);
          for (const pair of edge.filePairs) {
            connectedFiles.add(pair.sourcePath);
            connectedFiles.add(pair.targetPath);
          }
        }
      }
    } else {
      connectedFiles.add(selectedId);
      for (const n of nodes) {
        if (n.files.some((f) => f.path === selectedId)) {
          connectedNodes.add(n.id);
          break;
        }
      }

      for (const edge of visualEdges) {
        const matchingPairs: Array<{ sourcePath: string; targetPath: string }> =
          edge.filePairs.filter(
            (pair: { sourcePath: string; targetPath: string }) =>
              pair.sourcePath === selectedId || pair.targetPath === selectedId
          );
        if (matchingPairs.length === 0) continue;

        connectedNodes.add(edge.sourceNodeId);
        connectedNodes.add(edge.targetNodeId);

        let hasOut = false;
        let hasIn = false;
        for (const pair of matchingPairs) {
          if (pair.sourcePath === selectedId) {
            hasOut = true;
            connectedFiles.add(pair.targetPath);
          }
          if (pair.targetPath === selectedId) {
            hasIn = true;
            connectedFiles.add(pair.sourcePath);
          }
        }

        const dir: 'in' | 'out' | 'active' =
          hasIn && hasOut ? 'active' : hasIn ? 'in' : 'out';
        connectedEdges.set(edge.id, dir);
      }
    }

    return {
      connectedNodes,
      connectedEdges,
      connectedFiles,
      selectedId,
      isNodeSelected,
    };
  }, [selectedId, highlightedPaths, activeWalkType, nodeMap, visualEdges, nodes]);

  const edgeMatchesCategory = useCallback(
    (edge: VisualEdge): boolean => {
      if (!activeCategoryFiles) return true;
      return edge.filePairs.some(
        (p) =>
          activeCategoryFiles.has(p.sourcePath) ||
          activeCategoryFiles.has(p.targetPath)
      );
    },
    [activeCategoryFiles]
  );

  // Pan interactions
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, [data-interactive="true"]'))
      return;
    isDraggingRef.current = true;
    didDragRef.current = false;
    dragOriginRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: transform.x,
      startY: transform.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragOriginRef.current.clientX;
    const dy = e.clientY - dragOriginRef.current.clientY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      didDragRef.current = true;
    }
    setTransform((prev) => ({
      ...prev,
      x: dragOriginRef.current.startX + dx,
      y: dragOriginRef.current.startY + dy,
    }));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Canvas bounds computation for SVG viewBox (accommodates right-side intra-panel loops)
  const svgBounds = useMemo(() => {
    let maxX = 1200;
    let maxY = 800;
    for (const n of nodes) {
      maxX = Math.max(maxX, n.x + n.width + 260);
      maxY = Math.max(maxY, n.y + n.height + 220);
    }
    return { width: maxX, height: maxY };
  }, [nodes]);

  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el || nodes.length === 0) return;
    setTransform(computeFitTransform(nodes, el.clientWidth, el.clientHeight));
  }, [nodes]);

  const scrollPanel = useCallback(
    (nodeId: string, totalFiles: number, delta: number) => {
      const maxOffset = Math.max(0, totalFiles - PANEL_MAX_VISIBLE_ROWS);
      const curVisible = latestOffsetsRef.current[nodeId] ?? 0;
      const topo = topologyKey;
      const curSel = selectedId;
      setManualOffsets((prev) => {
        const existing = prev[nodeId];
        const base =
          existing && existing.topologyKey === topo
            ? Math.min(maxOffset, Math.max(0, existing.offset))
            : curVisible;
        const next = Math.min(maxOffset, Math.max(0, base + delta));
        return {
          ...prev,
          [nodeId]: {
            offset: next,
            lastSelectedId: curSel,
            topologyKey: topo,
          },
        };
      });
    },
    [topologyKey, selectedId]
  );

  // Split background vs foreground SVG edges cleanly
  const backgroundEdges: VisualEdge[] = [];
  const foregroundEdges: Array<{ edge: VisualEdge; dir: 'in' | 'out' | 'active'; hovered: boolean }> = [];

  for (const edge of visualEdges) {
    const hovered = isEdgeHovered(edge);
    const activeDir = activeSelection?.connectedEdges.get(edge.id);
    if (hovered || activeDir) {
      foregroundEdges.push({
        edge,
        dir: hovered ? 'active' : activeDir!,
        hovered,
      });
    } else {
      backgroundEdges.push(edge);
    }
  }

  return (
    <main
      ref={containerRef}
      className="flex-1 min-w-0 h-full relative overflow-hidden bg-[#f8f9fb] dark:bg-[#090a0e] select-none cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={() => {
        if (didDragRef.current) {
          didDragRef.current = false;
          return;
        }
        onSelectId(null);
        onHoverId(null);
      }}
      aria-label="Dependency Graph Canvas"
    >
      {/* Subtle Background Matrix Texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-20 text-slate-300 dark:text-white/20"
        style={{
          backgroundImage:
            'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Canvas Transform Stage */}
      <div
        className="absolute inset-0 origin-top-left transition-transform duration-75 ease-out"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          width: svgBounds.width,
          height: svgBounds.height,
        }}
      >
        {/* SVG Edges Layer */}
        <svg
          className="absolute inset-0 pointer-events-none overflow-visible"
          width={svgBounds.width}
          height={svgBounds.height}
        >
          <defs>
            <filter
              id="edge-glow"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="2.2"
                floodColor="#38bdf8"
                floodOpacity="0.55"
              />
            </filter>
          </defs>

          {/* Pass 1: Resting / Dimmed Monochrome Edges */}
          {backgroundEdges.map((edge) => {
            const catMatch = edgeMatchesCategory(edge);
            const isDim = Boolean(activeSelection) || !catMatch;
            const restingOpacity = isDim
              ? 0.09
              : Math.min(0.76, 0.34 + Math.log2(edge.weight + 1) * 0.11);
            const restingWidth = isDim
              ? 1
              : Math.min(2.1, Math.max(1.05, 0.85 + Math.log2(edge.weight + 1) * 0.28));

            return (
              <path
                key={edge.id}
                d={edge.pathData}
                fill="none"
                stroke="currentColor"
                strokeWidth={restingWidth}
                opacity={restingOpacity}
                className={
                  isDim
                    ? 'text-slate-400 dark:text-slate-600'
                    : 'text-slate-600 dark:text-slate-200'
                }
              />
            );
          })}

          {/* Pass 2: Active / Selected / Hovered Edges on Top */}
          {foregroundEdges.map(({ edge, dir, hovered }) => {
            const colorClass = hovered
              ? 'text-sky-600 dark:text-sky-400'
              : dir === 'in'
              ? 'text-emerald-600 dark:text-emerald-400'
              : dir === 'out'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-sky-600 dark:text-sky-400';

            return (
              <path
                key={edge.id}
                d={edge.pathData}
                fill="none"
                stroke="currentColor"
                strokeWidth={hovered ? 2.6 : 2.0}
                filter={hovered ? 'url(#edge-glow)' : undefined}
                opacity={hovered ? 1.0 : 0.92}
                className={colorClass}
              />
            );
          })}
        </svg>

        {/* HTML Nodes & Open Panel Cards Layer */}
        {nodes.map((node) => {
          const isDirectlySelected = selectedId === node.id;
          const isNodeConnected = Boolean(
            activeSelection && activeSelection.connectedNodes.has(node.id)
          );
          const isNodeActive =
            !activeSelection || isNodeConnected || isDirectlySelected;

          const matchingCategoryCount = activeCategory
            ? node.files.filter(fileMatchesActiveCategory).length
            : node.files.length;
          const isCategoryDimmed = Boolean(
            activeCategory && matchingCategoryCount === 0
          );

          const isDimmed =
            (activeSelection && !isNodeActive) || isCategoryDimmed;

          const isHovered =
            hoveredId === node.id ||
            (!node.isOpen && hoveredContainingNodeId === node.id);

          const directCount = node.files.reduce(
            (acc, f) => acc + (f.folder === node.id ? 1 : 0),
            0
          );
          const displayNumerator = activeCategory
            ? matchingCategoryCount
            : directCount;

          if (!node.isOpen) {
            return (
              <div
                key={node.id}
                data-interactive="true"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectId(node.id);
                  onToggleNodeOpen(node.id);
                }}
                onMouseEnter={() => onHoverId(node.id)}
                onMouseLeave={() => onHoverId(null)}
                style={{
                  position: 'absolute',
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height,
                }}
                className={`rounded-md border font-mono transition-colors duration-150 ${
                  isHovered
                    ? 'border-primary ring-1 ring-primary/70 bg-accent/80 shadow-lg opacity-100 z-30'
                    : isDirectlySelected
                    ? 'border-primary ring-1 ring-primary/60 bg-accent/60 shadow-md opacity-100 z-20'
                    : isNodeConnected
                    ? 'border-foreground/50 bg-card shadow-sm opacity-100 z-10'
                    : isDimmed
                    ? 'opacity-20 border-border/50 bg-card/60'
                    : 'border-border/90 hover:border-foreground/50 bg-card shadow-sm'
                }`}
                title="Click to open folder into its files"
              >
                <div className="h-full w-full px-2.5 py-2 flex flex-col justify-center gap-1 cursor-pointer">
                  <div
                    className={`text-[11px] font-semibold truncate tracking-tight leading-tight ${
                      isDimmed ? 'text-muted-foreground' : 'text-foreground'
                    }`}
                  >
                    {node.label}
                  </div>

                  <div
                    className={`flex items-center justify-between gap-2 text-[9px] tabular-nums leading-none ${
                      isDimmed
                        ? 'text-muted-foreground/60'
                        : activeCategory && matchingCategoryCount > 0
                        ? 'text-primary font-medium'
                        : 'text-muted-foreground'
                    }`}
                  >
                    <span className="truncate">
                      {displayNumerator}/{node.files.length} files
                    </span>
                    <span className="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap text-muted-foreground">
                      <span>→ {node.fanIn}</span>
                      <span>{node.fanOut} →</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          }

          // Open Folder Panel View
          const openOffset = panelOffsets[node.id] ?? 0;
          const openWin = computeOpenPanelWindow(node.files.length, openOffset);
          const visibleFiles = node.files.slice(
            openWin.offset,
            openWin.offset + openWin.visibleCount
          );

          const aboveKey = `above:${node.id}`;
          const belowKey = `below:${node.id}`;
          const abovePorts = portSides.get(aboveKey);
          const belowPorts = portSides.get(belowKey);

          const hasAboveHighlight =
            Boolean(
              hoveredId &&
                node.files
                  .slice(0, openWin.offset)
                  .some((f) => f.path === hoveredId)
            ) ||
            Boolean(
              selectedId &&
                node.files
                  .slice(0, openWin.offset)
                  .some((f) => f.path === selectedId)
            );

          const hasBelowHighlight =
            Boolean(
              hoveredId &&
                node.files
                  .slice(openWin.offset + openWin.visibleCount)
                  .some((f) => f.path === hoveredId)
            ) ||
            Boolean(
              selectedId &&
                node.files
                  .slice(openWin.offset + openWin.visibleCount)
                  .some((f) => f.path === selectedId)
            );

          return (
            <div
              key={node.id}
              data-interactive="true"
              data-scrollable-panel={node.id}
              onClick={(e) => {
                // Keep click inside open panel from clearing canvas selection
                e.stopPropagation();
              }}
              style={{
                position: 'absolute',
                left: node.x,
                top: node.y,
                width: node.width,
                height: openWin.height,
              }}
              className={`rounded-md border font-mono transition-colors duration-150 shadow-xl ${
                isHovered
                  ? 'border-primary ring-1 ring-primary/60 bg-card z-30 opacity-100'
                  : isDirectlySelected
                  ? 'border-foreground/50 bg-card z-20 opacity-100'
                  : isNodeConnected
                  ? 'border-foreground/40 bg-card z-20 opacity-100'
                  : isDimmed
                  ? 'opacity-25 border-border/50 bg-card/70'
                  : 'border-border/90 bg-card z-20'
              }`}
            >
              <div className="h-full w-full flex flex-col">
                {/* Panel Header (click closes panel back to single box & preserves selection) */}
                <div
                  style={{ height: PANEL_HEADER_H }}
                  className={`shrink-0 border-b px-2.5 flex flex-col justify-center gap-0.5 cursor-pointer rounded-t-md transition-colors ${
                    isDirectlySelected || isHovered
                      ? 'bg-secondary/90 border-border'
                      : 'bg-secondary/50 border-border/80 hover:bg-secondary/80'
                  }`}
                  onMouseEnter={() => onHoverId(node.id)}
                  onMouseLeave={() => onHoverId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleNodeOpen(node.id);
                    onSelectId(node.id);
                  }}
                  title="Click header to fold folder back"
                >
                  <div className="text-[11px] font-semibold text-foreground truncate leading-tight">
                    {node.label}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[9px] tabular-nums leading-none">
                    <span
                      className={
                        activeCategory && matchingCategoryCount > 0
                          ? 'text-primary font-semibold'
                          : 'text-muted-foreground'
                      }
                    >
                      {activeCategory
                        ? `${matchingCategoryCount}/${node.files.length} matched`
                        : `${directCount}/${node.files.length} files`}
                    </span>
                    <span className="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap text-muted-foreground">
                      <span>→ {node.fanIn}</span>
                      <span>{node.fanOut} →</span>
                    </span>
                  </div>
                </div>

                {/* Exact-stride rows + optional overflow above/below bars */}
                <div
                  style={{
                    paddingTop: PANEL_PADDING_Y,
                    paddingBottom: PANEL_PADDING_Y,
                    gap: PANEL_ROW_GAP,
                  }}
                  className="flex flex-col px-1.5"
                >
                  {openWin.hasAbove && (
                    <button
                      type="button"
                      style={{ height: PANEL_NOTICE_H }}
                      onClick={(e) => {
                        e.stopPropagation();
                        scrollPanel(node.id, node.files.length, -7);
                      }}
                      className={`relative shrink-0 w-full px-2 rounded flex items-center justify-between text-[9.5px] transition-colors cursor-pointer ${
                        hasAboveHighlight
                          ? 'bg-primary/15 text-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                      }`}
                      title="Scroll up to view previous files"
                    >
                      {abovePorts?.left && (
                        <span className="absolute -left-[7px] top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-500/85 dark:bg-slate-300/85 pointer-events-none" />
                      )}
                      <span>{openWin.aboveCount} files above</span>
                      <ChevronUp className="w-3 h-3 opacity-60 shrink-0" />
                      {abovePorts?.right && (
                        <span className="absolute -right-[7px] top-1/2 translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-500/85 dark:bg-slate-300/85 pointer-events-none" />
                      )}
                    </button>
                  )}

                  {visibleFiles.map((file) => {
                    const isFileSelected = selectedId === file.path;
                    const isFileConnected = Boolean(
                      activeSelection &&
                        activeSelection.connectedFiles.has(file.path)
                    );
                    const isFileHovered = hoveredId === file.path;
                    const matchesCategory = fileMatchesActiveCategory(file);

                    const isRowDimmed =
                      (activeSelection &&
                        !isFileSelected &&
                        !isFileConnected &&
                        !isFileHovered) ||
                      !matchesCategory;

                    const displayName = getRelativeFileName(node.id, file.path);
                    const dotColor = fileColorMap.get(file.path) || '#64748b';
                    const rowPorts = portSides.get(`file:${file.path}`);

                    return (
                      <div
                        key={file.path}
                        data-interactive="true"
                        style={{ height: PANEL_ROW_H }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectId(
                            selectedId === file.path ? null : file.path
                          );
                        }}
                        onMouseEnter={(e) => {
                          e.stopPropagation();
                          onHoverId(file.path);
                        }}
                        onMouseLeave={() => onHoverId(null)}
                        title={file.path}
                        className={`relative shrink-0 flex items-center justify-between gap-2 px-1.5 rounded text-[10px] cursor-pointer transition-colors ${
                          isFileHovered || isFileSelected
                            ? 'bg-primary/20 text-foreground font-semibold ring-1 ring-primary'
                            : isFileConnected
                            ? 'bg-secondary/90 text-foreground font-medium ring-1 ring-border'
                            : isRowDimmed
                            ? 'opacity-25 text-muted-foreground hover:opacity-80'
                            : 'text-foreground/90 hover:bg-secondary/75 hover:text-foreground'
                        }`}
                      >
                        {rowPorts?.left && (
                          <span
                            className={`absolute -left-[7px] top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full pointer-events-none ${
                              isFileSelected || isFileHovered
                                ? 'bg-primary'
                                : 'bg-slate-500/85 dark:bg-slate-300/85'
                            }`}
                          />
                        )}

                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-1.5 h-1.5 rounded-[2px] shrink-0"
                            style={{ backgroundColor: dotColor }}
                            aria-hidden="true"
                          />
                          <span className="truncate">{displayName}</span>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1.5 text-[9px] tabular-nums shrink-0 whitespace-nowrap ${
                            isFileHovered || isFileSelected || isFileConnected
                              ? 'text-foreground/85'
                              : 'text-muted-foreground'
                          }`}
                        >
                          <span>→ {file.fanIn}</span>
                          <span>{file.fanOut} →</span>
                        </span>

                        {rowPorts?.right && (
                          <span
                            className={`absolute -right-[7px] top-1/2 translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full pointer-events-none ${
                              isFileSelected || isFileHovered
                                ? 'bg-primary'
                                : 'bg-slate-500/85 dark:bg-slate-300/85'
                            }`}
                          />
                        )}
                      </div>
                    );
                  })}

                  {openWin.hasBelow && (
                    <button
                      type="button"
                      style={{ height: PANEL_NOTICE_H }}
                      onClick={(e) => {
                        e.stopPropagation();
                        scrollPanel(node.id, node.files.length, 7);
                      }}
                      className={`relative shrink-0 w-full px-2 rounded flex items-center justify-between text-[9.5px] transition-colors cursor-pointer ${
                        hasBelowHighlight
                          ? 'bg-primary/15 text-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                      }`}
                      title="Scroll down to view more files"
                    >
                      {belowPorts?.left && (
                        <span className="absolute -left-[7px] top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-500/85 dark:bg-slate-300/85 pointer-events-none" />
                      )}
                      <span>{openWin.belowCount} files below</span>
                      <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
                      {belowPorts?.right && (
                        <span className="absolute -right-[7px] top-1/2 translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-500/85 dark:bg-slate-300/85 pointer-events-none" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Canvas Zoom & Fit View Controls (Bottom Left) */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 bg-card/90 border border-border rounded-lg p-1 backdrop-blur-md font-mono shadow-lg">
        <button
          type="button"
          onClick={() =>
            setTransform((prev) => ({
              ...prev,
              scale: Math.min(2.0, prev.scale * 1.15),
            }))
          }
          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Zoom in"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() =>
            setTransform((prev) => ({
              ...prev,
              scale: Math.max(0.2, prev.scale * 0.85),
            }))
          }
          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Zoom out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-3.5 bg-border mx-0.5" />

        <button
          type="button"
          onClick={fitView}
          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Fit view"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <span className="text-[10px] text-muted-foreground px-1.5 tabular-nums">
          {Math.round(transform.scale * 100)}%
        </span>
      </div>

      {/* Canvas Selection Legend / Status (Bottom Right) */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2.5 bg-card/90 border border-border rounded-lg px-2.5 py-1 backdrop-blur-md font-mono text-[10px] text-muted-foreground shadow-lg">
        <GitCommit className="w-3 h-3 text-primary" />
        {selectedId ? (
          <span className="text-foreground flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="truncate max-w-[180px]">
                {selectedId.split('/').pop()}
              </span>
            </span>
            <span className="text-muted-foreground">
              ({activeSelection?.connectedNodes.size ?? 0} nodes,{' '}
              {activeSelection?.connectedEdges.size ?? 0} edges)
            </span>
            <span className="hidden sm:inline-flex items-center gap-2 pl-1.5 border-l border-border text-[9px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                in
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                out
              </span>
            </span>
          </span>
        ) : (
          <span>
            {nodes.length} nodes · {visualEdges.length} edges
          </span>
        )}
      </div>
    </main>
  );
}
