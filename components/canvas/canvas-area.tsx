"use client";

/**
 * CodoGraph — Middle Canvas Column (Phase 4).
 *
 * Implements the full interactive canvas graph matching the reference image:
 * - Deterministic Left-to-Right hierarchical layout (dagre / Sugiyama principles).
 * - Smooth bezier dependency curves between nodes.
 * - Deepest-first folding: ~17 nodes under two dozen, every node > 1 file.
 * - Folded nodes carry fan-in height and label width.
 * - Clicking a folded node opens it into an in-place panel with file rows.
 * - Clicking header closes it back.
 * - Selection: Selecting either a node or a file row keeps it, its edges, and
 *   whatever those edges connect to bright, and dims everything else.
 * - Edges reconnect to rows when panels are opened.
 * - Full pan & zoom navigation.
 */
import React, { useState, useMemo, useRef, useCallback } from 'react';
import type { ParsedFile, ParsedEdge } from '@/lib/parser/types';
import { computeFoldedGraph, type FoldedNode } from '@/lib/canvas/folding';
import { Folder, FolderOpen, FileCode, ZoomIn, ZoomOut, Maximize2, GitCommit } from 'lucide-react';

interface CanvasAreaProps {
  files: ParsedFile[];
  edges: ParsedEdge[];
  repositoryName: string;
}

export function CanvasArea({ files, edges }: CanvasAreaProps) {
  // Set of opened folder IDs
  const [openNodeIds, setOpenNodeIds] = useState<Set<string>>(new Set());

  // Selected node ID or file path
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Pan and zoom state
  const [transform, setTransform] = useState({ x: 60, y: 40, scale: 0.85 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Compute folded graph
  const foldedGraph = useMemo(() => {
    return computeFoldedGraph(files, edges, openNodeIds);
  }, [files, edges, openNodeIds]);

  const { nodes, edges: foldedEdges } = foldedGraph;

  // Node lookup map
  const nodeMap = useMemo(() => {
    return new Map<string, FoldedNode>(nodes.map((n) => [n.id, n]));
  }, [nodes]);

  // Handle toggling folder open/close
  const toggleNodeOpen = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });

    // Invariant: "Refitting on open may only ever zoom out, never in."
    setTransform((prev) => ({
      ...prev,
      scale: Math.min(prev.scale, 0.8),
    }));
  }, []);

  // Connected nodes, files, and edges calculation for selection highlighting
  const activeSelection = useMemo(() => {
    if (!selectedId) return null;

    const connectedNodes = new Set<string>();
    const connectedEdges = new Set<string>();
    const connectedFiles = new Set<string>();

    const isNodeSelected = nodeMap.has(selectedId);

    if (isNodeSelected) {
      connectedNodes.add(selectedId);
      const selectedNode = nodeMap.get(selectedId)!;
      for (const f of selectedNode.files) {
        connectedFiles.add(f.path);
      }

      for (const edge of foldedEdges) {
        if (edge.sourceNodeId === selectedId) {
          connectedEdges.add(edge.id);
          connectedNodes.add(edge.targetNodeId);
          for (const pair of edge.filePairs) {
            connectedFiles.add(pair.sourcePath);
            connectedFiles.add(pair.targetPath);
          }
        } else if (edge.targetNodeId === selectedId) {
          connectedEdges.add(edge.id);
          connectedNodes.add(edge.sourceNodeId);
          for (const pair of edge.filePairs) {
            connectedFiles.add(pair.sourcePath);
            connectedFiles.add(pair.targetPath);
          }
        }
      }
    } else {
      // Selected is a file path: find its containing node
      connectedFiles.add(selectedId);
      let containingNodeId: string | null = null;
      for (const n of nodes) {
        if (n.files.some((f) => f.path === selectedId)) {
          containingNodeId = n.id;
          break;
        }
      }

      if (containingNodeId) {
        connectedNodes.add(containingNodeId);
      }

      // Check all folded edges and their concrete file pairs
      for (const edge of foldedEdges) {
        const matchesEdge = edge.filePairs.some(
          (pair) => pair.sourcePath === selectedId || pair.targetPath === selectedId
        );

        if (matchesEdge) {
          connectedEdges.add(edge.id);
          connectedNodes.add(edge.sourceNodeId);
          connectedNodes.add(edge.targetNodeId);

          for (const pair of edge.filePairs) {
            if (pair.sourcePath === selectedId) {
              connectedFiles.add(pair.targetPath);
            }
            if (pair.targetPath === selectedId) {
              connectedFiles.add(pair.sourcePath);
            }
          }
        }
      }
    }

    return {
      connectedNodes,
      connectedEdges,
      connectedFiles,
      selectedId,
      isNodeSelected,
    };
  }, [selectedId, nodeMap, foldedEdges, nodes]);

  // Helper to resolve the Y coordinate of a connection point on a node
  const getNodeConnectionY = useCallback(
    (node: FoldedNode, targetFile?: string): number => {
      if (!node.isOpen || !targetFile) {
        return node.y + node.height / 2;
      }

      const visibleFiles = node.files.slice(0, 10);
      const idx = visibleFiles.findIndex((f) => f.path === targetFile);
      if (idx >= 0) {
        // 32px panel header + 4px padding + idx * 24px row center
        return node.y + 32 + 4 + idx * 24 + 12;
      }

      return node.y + node.height / 2;
    },
    []
  );

  // Pan interactions
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, [data-interactive="true"]')) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    setTransform((prev) => ({
      ...prev,
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    }));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Zoom with mouse wheel
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setTransform((prev) => {
      const newScale = Math.min(2.0, Math.max(0.3, prev.scale * zoomFactor));
      return { ...prev, scale: newScale };
    });
  };

  // Canvas bounds computation for SVG viewBox
  const svgBounds = useMemo(() => {
    let maxX = 1200;
    let maxY = 800;
    for (const n of nodes) {
      maxX = Math.max(maxX, n.x + n.width + 200);
      maxY = Math.max(maxY, n.y + n.height + 200);
    }
    return { width: maxX, height: maxY };
  }, [nodes]);

  // Center & Fit View button
  const fitView = useCallback(() => {
    setTransform({ x: 60, y: 60, scale: 0.75 });
  }, []);

  return (
    <main
      ref={containerRef}
      className="flex-1 min-w-0 h-full relative overflow-hidden bg-[#06070a] select-none cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onClick={() => setSelectedId(null)}
      aria-label="Dependency Graph Canvas"
    >
      {/* Background Matrix Texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.15) 1px, transparent 1px)',
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
            <linearGradient id="edge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="edge-grad-active" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="1" />
              <stop offset="50%" stopColor="#60a5fa" stopOpacity="1" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="1" />
            </linearGradient>
            <filter id="edge-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#38bdf8" floodOpacity="0.9" />
            </filter>
          </defs>

          {/* Render Inactive / Dimmed Edges first */}
          {foldedEdges
            .filter((edge) => !activeSelection || !activeSelection.connectedEdges.has(edge.id))
            .map((edge) => {
              const src = nodeMap.get(edge.sourceNodeId);
              const tgt = nodeMap.get(edge.targetNodeId);
              if (!src || !tgt) return null;

              const x1 = src.x + src.width;
              const y1 = getNodeConnectionY(src);
              const x2 = tgt.x;
              const y2 = getNodeConnectionY(tgt);

              const dx = Math.max(40, (x2 - x1) * 0.5);
              const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

              return (
                <path
                  key={edge.id}
                  d={pathData}
                  fill="none"
                  stroke="url(#edge-grad)"
                  strokeWidth={activeSelection ? 1 : Math.min(2.5, Math.max(1, Math.log2(edge.count + 1)))}
                  opacity={activeSelection ? 0.03 : 0.35}
                  className="transition-opacity duration-200"
                />
              );
            })}

          {/* Render Active / Connected Edges on top with bright glow */}
          {foldedEdges
            .filter((edge) => activeSelection && activeSelection.connectedEdges.has(edge.id))
            .map((edge) => {
              const src = nodeMap.get(edge.sourceNodeId);
              const tgt = nodeMap.get(edge.targetNodeId);
              if (!src || !tgt) return null;

              // Find matching file pair to reconnect edge directly to row
              const activePair =
                activeSelection && !activeSelection.isNodeSelected
                  ? edge.filePairs.find(
                      (p) =>
                        p.sourcePath === activeSelection.selectedId ||
                        p.targetPath === activeSelection.selectedId
                    )
                  : null;

              const x1 = src.x + src.width;
              const y1 = activePair
                ? getNodeConnectionY(src, activePair.sourcePath)
                : getNodeConnectionY(src);

              const x2 = tgt.x;
              const y2 = activePair
                ? getNodeConnectionY(tgt, activePair.targetPath)
                : getNodeConnectionY(tgt);

              const dx = Math.max(40, (x2 - x1) * 0.5);
              const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

              return (
                <g key={edge.id} className="transition-all duration-200">
                  <path
                    d={pathData}
                    fill="none"
                    stroke="url(#edge-grad-active)"
                    strokeWidth={2.5}
                    filter="url(#edge-glow)"
                    opacity={1.0}
                  />
                </g>
              );
            })}
        </svg>

        {/* HTML Nodes Layer */}
        {nodes.map((node) => {
          const isDirectlySelected = selectedId === node.id;
          const isNodeConnected =
            activeSelection && activeSelection.connectedNodes.has(node.id);
          const isNodeActive = !activeSelection || isNodeConnected || isDirectlySelected;
          const isDimmed = activeSelection && !isNodeActive;

          return (
            <div
              key={node.id}
              data-interactive="true"
              onClick={(e) => {
                e.stopPropagation();
                // Toggle selection on repeat click
                setSelectedId((prev) => (prev === node.id ? null : node.id));
              }}
              style={{
                position: 'absolute',
                left: node.x,
                top: node.y,
                width: node.width,
                height: node.height,
              }}
              className={`rounded-lg border font-mono transition-all duration-200 shadow-xl ${
                isDimmed
                  ? 'opacity-15 border-white/5 bg-[#090a0f]/40 grayscale'
                  : isDirectlySelected
                  ? 'border-[#38bdf8] ring-2 ring-[#38bdf8]/60 bg-[#0d1527] shadow-[0_0_30px_rgba(56,189,248,0.35)] opacity-100 z-20'
                  : isNodeConnected
                  ? 'border-white/80 bg-[#121624] shadow-[0_0_18px_rgba(255,255,255,0.12)] opacity-100 z-10'
                  : 'border-white/15 hover:border-white/40 bg-[#0c0d14]/95 opacity-90'
              }`}
            >
              {/* Folded Box View */}
              {!node.isOpen ? (
                <div
                  className="h-full w-full p-2.5 flex flex-col justify-between cursor-pointer group"
                  onClick={(e) => toggleNodeOpen(node.id, e)}
                  title="Click to open folder panel"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Folder
                        className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                          isDimmed
                            ? 'text-white/20'
                            : isDirectlySelected || isNodeConnected
                            ? 'text-[#38bdf8]'
                            : 'text-white/50 group-hover:text-white'
                        }`}
                      />
                      <span
                        className={`text-[11px] font-semibold truncate tracking-tight ${
                          isDimmed ? 'text-white/25' : 'text-white'
                        }`}
                      >
                        {node.label}
                      </span>
                    </div>
                    <span
                      className={`text-[9px] px-1 py-0.5 rounded shrink-0 ${
                        isDimmed
                          ? 'bg-white/[0.02] text-white/20'
                          : isDirectlySelected
                          ? 'bg-[#38bdf8]/20 text-[#38bdf8] font-bold'
                          : 'bg-white/[0.08] text-white/60'
                      }`}
                    >
                      {node.files.length}
                    </span>
                  </div>

                  <div
                    className={`flex items-center justify-between text-[9px] pt-1 border-t ${
                      isDimmed
                        ? 'border-white/[0.02] text-white/15'
                        : isDirectlySelected || isNodeConnected
                        ? 'border-white/20 text-white/70'
                        : 'border-white/[0.06] text-white/40'
                    }`}
                  >
                    <span>in: {node.fanIn}</span>
                    <span>out: {node.fanOut}</span>
                  </div>
                </div>
              ) : (
                /* Opened Panel Box View */
                <div className="h-full w-full flex flex-col bg-[#0c0d14] rounded-lg overflow-hidden">
                  {/* Panel Header */}
                  <div
                    className={`h-8 shrink-0 border-b px-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                      isDirectlySelected
                        ? 'bg-[#38bdf8]/15 border-[#38bdf8]/40'
                        : 'bg-white/[0.04] border-white/15 hover:bg-white/[0.08]'
                    }`}
                    onClick={(e) => toggleNodeOpen(node.id, e)}
                    title="Click header to close panel"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FolderOpen className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
                      <span className="text-[11px] font-bold text-white truncate">
                        {node.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-white/50 shrink-0">
                      <span>{node.files.length} files</span>
                      <span className="text-white/20">·</span>
                      <span>in:{node.fanIn}</span>
                    </div>
                  </div>

                  {/* Panel Rows (Files) */}
                  <div className="flex-1 overflow-y-auto p-1 space-y-0.5 divide-y divide-white/[0.03]">
                    {node.files.slice(0, 10).map((file) => {
                      const isFileSelected = selectedId === file.path;
                      const isFileConnected =
                        activeSelection && activeSelection.connectedFiles.has(file.path);
                      const isRowDimmed =
                        activeSelection && !isFileSelected && !isFileConnected;
                      const fileName = file.path.split('/').pop() || file.path;

                      return (
                        <div
                          key={file.path}
                          data-interactive="true"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Toggle file selection on repeat click
                            setSelectedId((prev) => (prev === file.path ? null : file.path));
                          }}
                          className={`flex items-center justify-between px-2 py-1 rounded text-[10px] cursor-pointer transition-all ${
                            isFileSelected
                              ? 'bg-[#38bdf8]/30 text-white font-semibold ring-1 ring-[#38bdf8] shadow-[0_0_10px_rgba(56,189,248,0.4)]'
                              : isFileConnected
                              ? 'bg-white/10 text-[#38bdf8] font-medium ring-1 ring-white/20'
                              : isRowDimmed
                              ? 'opacity-20 text-white/25 hover:opacity-80'
                              : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 pr-1">
                            <FileCode
                              className={`w-2.5 h-2.5 shrink-0 ${
                                isFileSelected
                                  ? 'text-[#38bdf8]'
                                  : isFileConnected
                                  ? 'text-[#38bdf8]/80'
                                  : 'text-white/40'
                              }`}
                            />
                            <span className="truncate">{fileName}</span>
                          </div>
                          <span
                            className={`text-[9px] font-mono shrink-0 ${
                              isFileSelected || isFileConnected
                                ? 'text-white/60'
                                : 'text-white/30'
                            }`}
                          >
                            {file.lines}L
                          </span>
                        </div>
                      );
                    })}

                    {node.files.length > 10 && (
                      <div className="px-2 py-1 text-[9px] text-white/35 text-center italic">
                        +{node.files.length - 10} more files
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Canvas Zoom & Fit View Controls (Bottom Left) */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 bg-[#0c0d14]/90 border border-white/10 rounded-lg p-1 backdrop-blur-md font-mono shadow-xl">
        <button
          type="button"
          onClick={() =>
            setTransform((prev) => ({
              ...prev,
              scale: Math.min(2.0, prev.scale * 1.15),
            }))
          }
          className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() =>
            setTransform((prev) => ({
              ...prev,
              scale: Math.max(0.3, prev.scale * 0.85),
            }))
          }
          className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-3.5 bg-white/10 mx-0.5" />

        <button
          type="button"
          onClick={fitView}
          className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          title="Fit view"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <span className="text-[10px] text-white/40 px-1.5">
          {Math.round(transform.scale * 100)}%
        </span>
      </div>

      {/* Canvas Selection Legend / Status (Bottom Right) */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 bg-[#0c0d14]/90 border border-white/10 rounded-lg px-2.5 py-1 backdrop-blur-md font-mono text-[10px] text-white/50">
        <GitCommit className="w-3 h-3 text-[#38bdf8]" />
        {selectedId ? (
          <span className="text-white flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" />
            <span className="truncate max-w-[200px]">
              {selectedId.split('/').pop()}
            </span>
            <span className="text-white/40">
              ({activeSelection?.connectedNodes.size} nodes, {activeSelection?.connectedEdges.size} edges)
            </span>
          </span>
        ) : (
          <span>{nodes.length} nodes · {foldedEdges.length} edges</span>
        )}
      </div>
    </main>
  );
}
