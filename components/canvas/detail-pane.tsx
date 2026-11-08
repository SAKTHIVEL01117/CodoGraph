"use client";

/**
 * CodoGraph — Detail Pane (Phase 5 & 6).
 *
 * Implements the right-hand inspection column with Phase 6 graph maths:
 * - Blast radius & Dependency chain buttons: 2-level transitive walk returning instantly.
 * - Insights panel (collapsed by default): 4 kinds of insights with exact fixed strings,
 *   excluding framework-reached pages/routes/layouts/config from unimported.
 * - Left rail category integration.
 * - Resting state (nothing selected): Repository summary with name, framework,
 *   counts of files, imports and routes, two ranked lists, and insights.
 * - File selected: Path, kind, length, depends-on and depended-on counts with full lists.
 * - Folder selected: Structure breakdown and file list.
 * - Tabs: Structure and Explanation (Explanation is an empty state for now).
 * - Bidirectional hover: Pane to canvas and canvas to pane.
 * - Zero network requests. Pure arithmetic over already-loaded data.
 */
import React, { useState, useMemo } from 'react';
import type { ParsedFile, ParsedEdge, ExtractedRoute } from '@/lib/parser/types';
import type { FoldedNode } from '@/lib/canvas/folding';
import {
  computeRepositorySummary,
  computeFileNeighbours,
  computeFolderSummary,
  computeCodebaseInsights,
  type TransitiveWalkResult,
} from '@/lib/canvas/metrics';
import {
  FileCode,
  Folder,
  Layers,
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Compass,
  FileQuestion,
  CornerDownRight,
  ShieldAlert,
  GitFork,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Lightbulb,
  Route,
} from 'lucide-react';

function getMethodBadgeStyle(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    case 'POST':
      return 'text-[#38bdf8] bg-[#38bdf8]/10 border-[#38bdf8]/30';
    case 'PUT':
      return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    case 'PATCH':
      return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
    case 'DELETE':
      return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    default:
      return 'text-white/70 bg-white/5 border-white/20';
  }
}

export interface DetailPaneProps {
  repositoryName: string;
  adapter: string;
  files: ParsedFile[];
  edges: ParsedEdge[];
  nodes: FoldedNode[];
  routes?: ExtractedRoute[];
  selectedId: string | null;
  hoveredId: string | null;
  activeTab: 'structure' | 'explanation';
  activeWalkType: 'blast_radius' | 'dependency_chain' | null;
  walkResult: TransitiveWalkResult | null;
  onTabChange: (tab: 'structure' | 'explanation') => void;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onWalkTypeChange: (type: 'blast_radius' | 'dependency_chain' | null) => void;
}

export function DetailPane({
  repositoryName,
  adapter,
  files,
  edges,
  nodes,
  routes = [],
  selectedId,
  hoveredId,
  activeTab,
  activeWalkType,
  walkResult,
  onTabChange,
  onSelect,
  onHover,
  onWalkTypeChange,
}: DetailPaneProps) {
  // Phase 6 Insights Panel collapsed state (starts collapsed by default)
  const [isInsightsExpanded, setIsInsightsExpanded] = useState<boolean>(false);

  // Fast lookups
  const fileMap = useMemo(() => {
    return new Map<string, ParsedFile>(files.map((f) => [f.path, f]));
  }, [files]);

  const nodeMap = useMemo(() => {
    return new Map<string, FoldedNode>(nodes.map((n) => [n.id, n]));
  }, [nodes]);

  // Selected item resolution
  const selectedFile = selectedId ? fileMap.get(selectedId) || null : null;
  const selectedNode =
    selectedId && !selectedFile ? nodeMap.get(selectedId) || null : null;

  // Set of paths represented by the currently hovered node or item
  const hoveredPathsSet = useMemo(() => {
    const set = new Set<string>();
    if (!hoveredId) return set;
    set.add(hoveredId);
    if (nodeMap.has(hoveredId)) {
      const node = nodeMap.get(hoveredId)!;
      for (const f of node.files) {
        set.add(f.path);
      }
    }
    return set;
  }, [hoveredId, nodeMap]);

  // 1. Repository summary metrics (resting state)
  const repoSummary = useMemo(() => {
    return computeRepositorySummary(repositoryName, adapter, files, edges);
  }, [repositoryName, adapter, files, edges]);

  // 2. Selected file neighbours (dependencies and dependents)
  const fileNeighbours = useMemo(() => {
    if (!selectedFile) return null;
    return computeFileNeighbours(selectedFile.path, edges);
  }, [selectedFile, edges]);

  // 2b. Selected file routes (Phase 8)
  const selectedFileRoutes = useMemo(() => {
    if (!selectedFile) return [];
    return routes.filter((r) => r.filePath === selectedFile.path);
  }, [selectedFile, routes]);

  // 3. Selected folder summary
  const folderSummary = useMemo(() => {
    if (!selectedNode) return null;
    return computeFolderSummary(
      selectedNode.id,
      selectedNode.files,
      selectedNode.fanIn,
      selectedNode.fanOut
    );
  }, [selectedNode]);

  // 4. Phase 6: Codebase Insights (computed for repository resting state)
  const insights = useMemo(() => {
    return computeCodebaseInsights(files, edges);
  }, [files, edges]);

  // Format file kind label
  const formatFileKind = (file: ParsedFile): string => {
    if (file.role && file.role !== 'module') {
      const capitalized =
        file.role.charAt(0).toUpperCase() + file.role.slice(1);
      return `${capitalized} (${file.extension})`;
    }
    return `${file.extension} file`;
  };

  return (
    <aside
      className="w-80 shrink-0 h-full bg-[#0a0a0c]/95 border-l border-white/10 flex flex-col select-none z-10 font-mono text-white"
      aria-label="Detail Pane"
    >
      {/* Pane Top Header & Tab Navigation */}
      <div className="shrink-0 border-b border-white/10 bg-[#0c0d14]">
        {/* Context bar / Title */}
        <div className="h-10 px-3 flex items-center justify-between border-b border-white/[0.06]">
          <div className="flex items-center gap-2 min-w-0">
            {selectedFile ? (
              <>
                <FileCode className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
                <span className="text-xs font-semibold text-white truncate">
                  {selectedFile.path.split('/').pop()}
                </span>
              </>
            ) : selectedNode ? (
              <>
                <Folder className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
                <span className="text-xs font-semibold text-white truncate">
                  {selectedNode.label}
                </span>
              </>
            ) : (
              <>
                <Compass className="w-3.5 h-3.5 text-white/50 shrink-0" />
                <span className="text-xs font-semibold text-white truncate">
                  {repositoryName}
                </span>
              </>
            )}
          </div>

          {selectedId && (
            <button
              type="button"
              onClick={() => {
                onWalkTypeChange(null);
                onSelect(null);
              }}
              className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              title="Deselect to view repository summary"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Persistent Tabs: Structure and Explanation */}
        <div className="flex items-center px-2">
          <button
            type="button"
            onClick={() => onTabChange('structure')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'structure'
                ? 'border-[#38bdf8] text-white'
                : 'border-transparent text-white/40 hover:text-white/80'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Structure</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('explanation')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'explanation'
                ? 'border-[#38bdf8] text-white'
                : 'border-transparent text-white/40 hover:text-white/80'
            }`}
          >
            <Sparkles className="w-3 h-3 text-[#38bdf8]" />
            <span>Explanation</span>
          </button>
        </div>
      </div>

      {/* Pane Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/[0.06]">
        {activeTab === 'explanation' ? (
          /* Tab: Explanation (Empty State for Phase 5 & 6) */
          <div className="p-4 space-y-3 text-xs">
            <div className="flex items-center gap-2 text-white/80">
              <Sparkles className="w-4 h-4 text-[#38bdf8]" />
              <span className="font-semibold text-white">Explanation</span>
            </div>

            <p className="text-[11px] leading-relaxed text-white/50">
              No explanation generated yet. Explanations are produced by an AI
              model call in Phase 7.
            </p>

            <div className="p-2.5 rounded bg-white/[0.03] border border-white/5 space-y-1">
              <div className="text-[10px] text-white/30 uppercase tracking-wider">
                Target Element
              </div>
              <div className="text-[11px] text-white/90 break-all font-mono">
                {selectedFile
                  ? selectedFile.path
                  : selectedNode
                  ? selectedNode.id
                  : repositoryName}
              </div>
            </div>
          </div>
        ) : selectedFile && fileNeighbours ? (
          /* Tab: Structure — File Selected */
          <>
            {/* File Overview Card */}
            <div className="p-3 space-y-2">
              <div className="text-[11px] text-white/90 break-all font-semibold leading-tight">
                {selectedFile.path}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div className="p-2 rounded bg-white/[0.02] border border-white/5">
                  <div className="text-[9px] text-white/40 uppercase">Kind</div>
                  <div className="text-white/90 truncate">
                    {formatFileKind(selectedFile)}
                  </div>
                </div>

                <div className="p-2 rounded bg-white/[0.02] border border-white/5">
                  <div className="text-[9px] text-white/40 uppercase">Length</div>
                  <div className="text-white/90">
                    {selectedFile.lines} lines
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 text-[11px]">
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>Depended on by:</span>
                  <strong className="text-white font-semibold">
                    {fileNeighbours.dependents.length}
                  </strong>
                </div>

                <div className="flex items-center gap-1.5 text-amber-400">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Depends on:</span>
                  <strong className="text-white font-semibold">
                    {fileNeighbours.dependencies.length}
                  </strong>
                </div>
              </div>

              {/* Phase 6 Buttons: Blast radius & Dependency chain */}
              <div className="grid grid-cols-2 gap-1.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onWalkTypeChange(
                      activeWalkType === 'blast_radius' ? null : 'blast_radius'
                    );
                  }}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-[11px] font-medium transition-all ${
                    activeWalkType === 'blast_radius'
                      ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/60 shadow-[0_0_12px_rgba(244,63,94,0.25)]'
                      : 'bg-white/[0.04] text-white/80 hover:bg-white/[0.08] hover:text-white border border-white/10'
                  }`}
                  title="Compute transitive impact (everything that breaks if this file changes)"
                >
                  <ShieldAlert className="w-3 h-3 text-rose-400 shrink-0" />
                  <span>Blast radius</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onWalkTypeChange(
                      activeWalkType === 'dependency_chain'
                        ? null
                        : 'dependency_chain'
                    );
                  }}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-[11px] font-medium transition-all ${
                    activeWalkType === 'dependency_chain'
                      ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                      : 'bg-white/[0.04] text-white/80 hover:bg-white/[0.08] hover:text-white border border-white/10'
                  }`}
                  title="Compute transitive requirements (everything this file needs)"
                >
                  <GitFork className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>Dependency chain</span>
                </button>
              </div>

              {/* Phase 8: Routes declared in this file */}
              {selectedFileRoutes.length > 0 && (
                <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-white/40 uppercase tracking-wider font-semibold">
                    <span>Declared Routes</span>
                    <span className="tabular-nums">({selectedFileRoutes.length})</span>
                  </div>
                  <div className="space-y-1">
                    {selectedFileRoutes.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs font-mono py-1 px-1.5 rounded bg-white/[0.02] border border-white/5"
                      >
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${getMethodBadgeStyle(
                            r.method
                          )}`}
                        >
                          {r.method}
                        </span>
                        <span className="text-white/90 truncate">{r.pattern}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* If Blast Radius or Dependency Chain is active, display its 2-level list */}
            {walkResult ? (
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
                  <div className="flex items-center gap-1.5">
                    {walkResult.direction === 'incoming' ? (
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <GitFork className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    <span className="text-xs font-semibold text-white">
                      {walkResult.direction === 'incoming'
                        ? 'Blast radius (2 levels)'
                        : 'Dependency chain (2 levels)'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onWalkTypeChange(null)}
                    className="text-[10px] text-white/40 hover:text-white transition-colors"
                  >
                    close
                  </button>
                </div>

                <div className="text-[10px] text-white/40 italic">
                  {walkResult.direction === 'incoming'
                    ? 'Everything that breaks if this file changes'
                    : 'Everything this file needs transitively'}
                </div>

                {/* Level 1 List */}
                <div className="space-y-1 pt-1">
                  <div className="text-[10px] uppercase font-semibold text-white/50 tracking-wider">
                    Level 1 — Direct ({walkResult.level1.length})
                  </div>
                  {walkResult.level1.length === 0 ? (
                    <div className="text-[10px] text-white/30 italic py-1">
                      None
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {walkResult.level1.map((p) => {
                        const isHovered = hoveredPathsSet.has(p);
                        const fileName = p.split('/').pop() || p;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => onSelect(p)}
                            onMouseEnter={() => onHover(p)}
                            onMouseLeave={() => onHover(null)}
                            className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-all flex items-center justify-between group ${
                              isHovered
                                ? 'bg-[#38bdf8]/20 text-white ring-1 ring-[#38bdf8]/60 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                                : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                            }`}
                            title={`Select ${p}`}
                          >
                            <span className="truncate pr-1">{fileName}</span>
                            <span className="text-[9px] text-white/30 truncate max-w-[80px]">
                              {p.split('/').slice(0, -1).join('/') || '.'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Level 2 List */}
                <div className="space-y-1 pt-2">
                  <div className="text-[10px] uppercase font-semibold text-white/50 tracking-wider">
                    Level 2 — Transitive ({walkResult.level2.length})
                  </div>
                  {walkResult.level2.length === 0 ? (
                    <div className="text-[10px] text-white/30 italic py-1">
                      None
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {walkResult.level2.map((p) => {
                        const isHovered = hoveredPathsSet.has(p);
                        const fileName = p.split('/').pop() || p;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => onSelect(p)}
                            onMouseEnter={() => onHover(p)}
                            onMouseLeave={() => onHover(null)}
                            className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-all flex items-center justify-between group ${
                              isHovered
                                ? 'bg-[#38bdf8]/20 text-white ring-1 ring-[#38bdf8]/60 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                                : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                            }`}
                            title={`Select ${p}`}
                          >
                            <span className="truncate pr-1">{fileName}</span>
                            <span className="text-[9px] text-white/30 truncate max-w-[80px]">
                              {p.split('/').slice(0, -1).join('/') || '.'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Standard Depended On By & Depends On Lists */
              <>
                {/* List 1: Depended on by (fanIn) */}
                <div className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-400">
                    <div className="flex items-center gap-1.5">
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      <span>Depended on by</span>
                    </div>
                    <span className="text-white/40 text-[10px]">
                      ({fileNeighbours.dependents.length})
                    </span>
                  </div>

                  {fileNeighbours.dependents.length === 0 ? (
                    <div className="text-[10px] text-white/30 italic py-1 px-1.5">
                      No files depend on this file (entrypoint)
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {fileNeighbours.dependents.map((depPath) => {
                        const isHovered = hoveredPathsSet.has(depPath);
                        const fileName = depPath.split('/').pop() || depPath;

                        return (
                          <button
                            key={depPath}
                            type="button"
                            onClick={() => onSelect(depPath)}
                            onMouseEnter={() => onHover(depPath)}
                            onMouseLeave={() => onHover(null)}
                            className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-all flex items-center justify-between group ${
                              isHovered
                                ? 'bg-[#38bdf8]/20 text-white ring-1 ring-[#38bdf8]/60 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                                : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                            }`}
                            title={`Select ${depPath}`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 pr-1">
                              <CornerDownRight
                                className={`w-2.5 h-2.5 shrink-0 ${
                                  isHovered
                                    ? 'text-[#38bdf8]'
                                    : 'text-emerald-400/60'
                                }`}
                              />
                              <span className="truncate">{fileName}</span>
                            </div>
                            <span className="text-[9px] text-white/30 truncate max-w-[90px] text-right">
                              {depPath.split('/').slice(0, -1).join('/') || '.'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* List 2: Depends on (fanOut) */}
                <div className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-amber-400">
                    <div className="flex items-center gap-1.5">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>Depends on</span>
                    </div>
                    <span className="text-white/40 text-[10px]">
                      ({fileNeighbours.dependencies.length})
                    </span>
                  </div>

                  {fileNeighbours.dependencies.length === 0 ? (
                    <div className="text-[10px] text-white/30 italic py-1 px-1.5">
                      No internal dependencies
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {fileNeighbours.dependencies.map((targetPath) => {
                        const isHovered = hoveredPathsSet.has(targetPath);
                        const fileName =
                          targetPath.split('/').pop() || targetPath;

                        return (
                          <button
                            key={targetPath}
                            type="button"
                            onClick={() => onSelect(targetPath)}
                            onMouseEnter={() => onHover(targetPath)}
                            onMouseLeave={() => onHover(null)}
                            className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-all flex items-center justify-between group ${
                              isHovered
                                ? 'bg-[#38bdf8]/20 text-white ring-1 ring-[#38bdf8]/60 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                                : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                            }`}
                            title={`Select ${targetPath}`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 pr-1">
                              <CornerDownRight
                                className={`w-2.5 h-2.5 shrink-0 ${
                                  isHovered
                                    ? 'text-[#38bdf8]'
                                    : 'text-amber-400/60'
                                }`}
                              />
                              <span className="truncate">{fileName}</span>
                            </div>
                            <span className="text-[9px] text-white/30 truncate max-w-[90px] text-right">
                              {targetPath.split('/').slice(0, -1).join('/') ||
                                '.'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        ) : selectedNode && folderSummary ? (
          /* Tab: Structure — Folded Folder Selected */
          <>
            {/* Folder Overview Card */}
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-[#38bdf8] shrink-0" />
                <span className="text-xs font-semibold text-white break-all">
                  {selectedNode.id}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[11px] pt-1">
                <div className="p-2 rounded bg-white/[0.02] border border-white/5 text-center">
                  <div className="text-[9px] text-white/40 uppercase">Files</div>
                  <div className="text-white font-semibold">
                    {folderSummary.totalFiles}
                  </div>
                </div>

                <div className="p-2 rounded bg-white/[0.02] border border-white/5 text-center">
                  <div className="text-[9px] text-emerald-400/70 uppercase">In</div>
                  <div className="text-white font-semibold">
                    {folderSummary.fanIn}
                  </div>
                </div>

                <div className="p-2 rounded bg-white/[0.02] border border-white/5 text-center">
                  <div className="text-[9px] text-amber-400/70 uppercase">Out</div>
                  <div className="text-white font-semibold">
                    {folderSummary.fanOut}
                  </div>
                </div>
              </div>
            </div>

            {/* Folder Composition: What kind of files are inside and how many */}
            <div className="p-3 space-y-2">
              <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
                File Breakdown
              </div>

              <div className="space-y-1.5">
                {folderSummary.categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between text-xs py-1 px-1.5 rounded bg-white/[0.02]"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                        style={{ backgroundColor: cat.color }}
                        aria-hidden="true"
                      />
                      <span className="text-white/90">{cat.name}</span>
                    </div>
                    <span className="text-white/50 tabular-nums">
                      {cat.count} files
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Files List Inside Folder */}
            <div className="p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-white/40 uppercase tracking-wider font-semibold">
                <span>Contained Files</span>
                <span>({folderSummary.files.length})</span>
              </div>

              <div className="space-y-0.5">
                {folderSummary.files.map((file) => {
                  const isHovered = hoveredPathsSet.has(file.path);
                  const fileName = file.path.split('/').pop() || file.path;

                  return (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => onSelect(file.path)}
                      onMouseEnter={() => onHover(file.path)}
                      onMouseLeave={() => onHover(null)}
                      className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-all flex items-center justify-between group ${
                        isHovered
                          ? 'bg-[#38bdf8]/20 text-white ring-1 ring-[#38bdf8]/60 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                          : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                      }`}
                      title={`Select ${file.path}`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 pr-1">
                        <FileCode className="w-2.5 h-2.5 text-white/40 shrink-0" />
                        <span className="truncate">{fileName}</span>
                      </div>
                      <span className="text-[10px] text-white/35 tabular-nums shrink-0">
                        {file.lines}L
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          /* Tab: Structure — Resting State (Nothing Selected: Repository Summary & Insights) */
          <>
            {/* Repository Identity & Framework */}
            <div className="p-3 space-y-2.5">
              <div className="space-y-0.5">
                <div className="text-[10px] text-white/40 uppercase tracking-wider">
                  Repository
                </div>
                <div className="text-xs font-bold text-white break-all">
                  {repoSummary.repositoryName}
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] p-2 rounded bg-white/[0.02] border border-white/5">
                <span className="text-white/50">Framework</span>
                <span className="font-semibold text-[#38bdf8]">
                  {repoSummary.frameworkDetected}
                </span>
              </div>

              {/* Counts: Files, Imports, Routes */}
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="p-2 rounded bg-white/[0.02] border border-white/5">
                  <div className="text-[9px] text-white/40 uppercase">Files</div>
                  <div className="text-xs font-semibold text-white">
                    {repoSummary.filesCount}
                  </div>
                </div>

                <div className="p-2 rounded bg-white/[0.02] border border-white/5">
                  <div className="text-[9px] text-white/40 uppercase">Imports</div>
                  <div className="text-xs font-semibold text-white">
                    {repoSummary.importsCount}
                  </div>
                </div>

                <div className="p-2 rounded bg-white/[0.02] border border-white/5">
                  <div className="text-[9px] text-white/40 uppercase">Routes</div>
                  <div className="text-xs font-semibold text-white">
                    {routes.length > 0 ? routes.length : repoSummary.routesCount}
                  </div>
                </div>
              </div>

              {/* Unidentified count */}
              <div className="flex items-center gap-1.5 text-[10px] text-white/45 px-1 pt-0.5">
                <FileQuestion className="w-3 h-3 text-white/30 shrink-0" />
                <span>
                  <strong className="text-white/70 font-medium">
                    {repoSummary.unidentifiedCount}
                  </strong>{' '}
                  files without convention role
                </span>
              </div>
            </div>

            {/* Phase 8: Extracted Routes Table */}
            <div className="p-3 space-y-2 border-t border-white/[0.06]">
              <div className="flex items-center justify-between text-[10px] text-white/50 uppercase tracking-wider font-semibold">
                <div className="flex items-center gap-1.5">
                  <Route className="w-3.5 h-3.5 text-[#38bdf8]" />
                  <span>Route Table</span>
                </div>
                <span className="text-white/40 tabular-nums">
                  {routes.length} {routes.length === 1 ? 'route' : 'routes'}
                </span>
              </div>

              {routes.length > 0 ? (
                <div className="rounded border border-white/10 overflow-hidden bg-black/40 text-[11px] font-mono">
                  <div className="max-h-60 overflow-y-auto divide-y divide-white/[0.06]">
                    {routes.map((route, idx) => {
                      const methodColor = getMethodBadgeStyle(route.method);
                      const isSelected = selectedId === route.filePath;
                      const isHovered = hoveredPathsSet.has(route.filePath);

                      return (
                        <button
                          key={`${route.method}-${route.pattern}-${idx}`}
                          type="button"
                          onClick={() => onSelect(route.filePath)}
                          onMouseEnter={() => onHover(route.filePath)}
                          onMouseLeave={() => onHover(null)}
                          className={`w-full text-left p-2 transition-colors flex flex-col gap-1 group ${
                            isSelected
                              ? 'bg-[#38bdf8]/15 ring-1 ring-[#38bdf8]/40'
                              : isHovered
                                ? 'bg-white/[0.06]'
                                : 'hover:bg-white/[0.04]'
                          }`}
                          title={`Click to open ${route.filePath} on canvas`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 border ${methodColor}`}
                            >
                              {route.method}
                            </span>
                            <span className="font-semibold text-white/90 truncate">
                              {route.pattern}
                            </span>
                          </div>
                          <div className="text-[10px] text-white/40 group-hover:text-white/70 truncate pl-0.5">
                            {route.filePath}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded bg-white/[0.02] border border-white/5 text-center">
                  <div className="text-[11px] text-white/40">
                    No routes declared
                  </div>
                  <div className="text-[9px] text-white/25 mt-0.5">
                    Route table is empty rather than inferred
                  </div>
                </div>
              )}
            </div>

            {/* Ranked List 1: What the repository leans on most */}
            <div className="p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-white/50 uppercase tracking-wider font-semibold">
                <span>Leaned on most</span>
                <span className="text-white/30">by imports</span>
              </div>

              <div className="space-y-0.5">
                {repoSummary.mostDependedOn.slice(0, 10).map((file, idx) => {
                  const isHovered = hoveredPathsSet.has(file.path);
                  const fileName = file.path.split('/').pop() || file.path;

                  return (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => onSelect(file.path)}
                      onMouseEnter={() => onHover(file.path)}
                      onMouseLeave={() => onHover(null)}
                      className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-all flex items-center justify-between group ${
                        isHovered
                          ? 'bg-[#38bdf8]/20 text-white ring-1 ring-[#38bdf8]/60 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                          : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                      }`}
                      title={`Select ${file.path} (${file.fanIn} imports)`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 pr-1">
                        <span className="text-[9px] text-white/30 font-mono w-4 shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="truncate">{fileName}</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-semibold tabular-nums shrink-0">
                        {file.fanIn} in
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ranked List 2: Files nothing imports at all (reading starts) */}
            <div className="p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-white/50 uppercase tracking-wider font-semibold">
                <span>Where reading starts</span>
                <span className="text-white/30">
                  {repoSummary.readingStarts.length} files
                </span>
              </div>

              <div className="space-y-0.5">
                {repoSummary.readingStarts.slice(0, 15).map((file) => {
                  const isHovered = hoveredPathsSet.has(file.path);
                  const fileName = file.path.split('/').pop() || file.path;

                  return (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => onSelect(file.path)}
                      onMouseEnter={() => onHover(file.path)}
                      onMouseLeave={() => onHover(null)}
                      className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-all flex items-center justify-between group ${
                        isHovered
                          ? 'bg-[#38bdf8]/20 text-white ring-1 ring-[#38bdf8]/60 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                          : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                      }`}
                      title={`Select ${file.path}`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 pr-1">
                        <FileCode className="w-2.5 h-2.5 text-white/40 shrink-0" />
                        <span className="truncate">{fileName}</span>
                      </div>
                      <span className="text-[10px] text-white/35 tabular-nums shrink-0">
                        {file.lines}L
                      </span>
                    </button>
                  );
                })}

                {repoSummary.readingStarts.length > 15 && (
                  <div className="px-2 py-1 text-[9px] text-white/30 text-center italic">
                    +{repoSummary.readingStarts.length - 15} more entrypoint files
                  </div>
                )}
              </div>
            </div>

            {/* Phase 6: Codebase Insights Panel (starts collapsed, never first thing you see) */}
            <div className="p-3 space-y-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setIsInsightsExpanded(!isInsightsExpanded)}
                className="w-full flex items-center justify-between py-1.5 px-2 rounded bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-colors text-left"
                title="Toggle Codebase Insights"
              >
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-3.5 h-3.5 text-[#38bdf8]" />
                  <span className="text-xs font-semibold text-white">
                    Codebase Insights
                  </span>
                  <span className="text-[10px] text-white/40">
                    ({insights.reduce((acc, cur) => acc + (cur.files.length > 0 ? 1 : 0), 0)})
                  </span>
                </div>
                {isInsightsExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-white/40" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                )}
              </button>

              {/* Collapsed by default — expands on click */}
              {isInsightsExpanded && (
                <div className="space-y-3 pt-1">
                  {insights.map((insight) => {
                    if (insight.files.length === 0) return null;

                    return (
                      <div
                        key={insight.kind}
                        className="p-2.5 rounded bg-white/[0.02] border border-white/5 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {insight.kind === 'cycle' && (
                              <RefreshCw className="w-3 h-3 text-rose-400" />
                            )}
                            {insight.kind === 'unimported' && (
                              <FileQuestion className="w-3 h-3 text-cyan-400" />
                            )}
                            {insight.kind === 'popular' && (
                              <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
                            )}
                            {insight.kind === 'oversized' && (
                              <Layers className="w-3 h-3 text-amber-400" />
                            )}
                            <span className="text-xs font-semibold text-white">
                              {insight.title}
                            </span>
                          </div>
                          <span className="text-[10px] text-white/40">
                            {insight.kind === 'cycle' && insight.cycles
                              ? `${insight.cycles.length} cycle`
                              : `${insight.files.length} files`}
                          </span>
                        </div>

                        {/* Exact fixed sentence from spec */}
                        <div className="text-[10px] text-white/50 italic leading-snug">
                          {insight.sentence}
                        </div>

                        {/* Cycles display */}
                        {insight.kind === 'cycle' && insight.cycles && (
                          <div className="space-y-2 pt-1">
                            {insight.cycles.map((cyc, cIdx) => (
                              <div
                                key={cIdx}
                                className="p-2 rounded bg-black/40 border border-rose-500/20 text-[10px] space-y-1"
                              >
                                <div className="text-rose-300 font-semibold text-[9px] uppercase">
                                  Cycle #{cIdx + 1} ({cyc.length} files)
                                </div>
                                <div className="space-y-1 pl-1 border-l-2 border-rose-500/40">
                                  {cyc.cycle.map((hop, hIdx) => {
                                    const fileName =
                                      hop.split('/').pop() || hop;
                                    const isHovered =
                                      hoveredPathsSet.has(hop);

                                    return (
                                      <button
                                        key={`${hop}-${hIdx}`}
                                        type="button"
                                        onClick={() => onSelect(hop)}
                                        onMouseEnter={() => onHover(hop)}
                                        onMouseLeave={() => onHover(null)}
                                        className={`w-full text-left truncate block py-0.5 px-1 rounded transition-colors ${
                                          isHovered
                                            ? 'bg-rose-500/30 text-white font-semibold'
                                            : 'text-white/80 hover:text-white hover:bg-white/10'
                                        }`}
                                        title={`Hop ${hIdx + 1}: ${hop}`}
                                      >
                                        <span className="text-rose-400/80 mr-1">
                                          {hIdx === 0
                                            ? '•'
                                            : hIdx === cyc.cycle.length - 1
                                            ? '↺'
                                            : '↓'}
                                        </span>
                                        {fileName}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Non-cycle files list */}
                        {insight.kind !== 'cycle' && (
                          <div className="space-y-0.5 pt-1 max-h-36 overflow-y-auto">
                            {insight.files.slice(0, 8).map((p) => {
                              const isHovered = hoveredPathsSet.has(p);
                              const fileName = p.split('/').pop() || p;

                              return (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => onSelect(p)}
                                  onMouseEnter={() => onHover(p)}
                                  onMouseLeave={() => onHover(null)}
                                  className={`w-full text-left px-1.5 py-1 rounded text-[10px] transition-all flex items-center justify-between group ${
                                    isHovered
                                      ? 'bg-[#38bdf8]/20 text-white ring-1 ring-[#38bdf8]/60'
                                      : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                                  }`}
                                  title={`Select ${p}`}
                                >
                                  <span className="truncate pr-1">
                                    {fileName}
                                  </span>
                                  <span className="text-[9px] text-white/30 truncate max-w-[80px]">
                                    {p.split('/').slice(0, -1).join('/') || '.'}
                                  </span>
                                </button>
                              );
                            })}
                            {insight.files.length > 8 && (
                              <div className="text-[9px] text-white/30 text-center italic py-0.5">
                                +{insight.files.length - 8} more
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
