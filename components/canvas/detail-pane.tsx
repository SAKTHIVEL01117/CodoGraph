"use client";

/**
 * CodoGraph — Detail Pane (Phase 5 & 6).
 *
 * Implements the right-hand inspection column:
 * - Compact context header: kind label ("file" / "folder" / "repository"),
 *   full path (parent muted + basename emphasized), optional deselect button,
 *   and clean Structure | Explanation tabs.
 * - Explanation tab: Empty state ("No explanation yet." / "Explanations come from a model call, and nothing makes one yet.")
 * - Structure tab:
 *   - Resting state (nothing selected): Repository summary with name, framework,
 *     counts of files, imports and routes, two ranked lists, and collapsed insights.
 *   - File selected: Path, kind, length, blast radius & dependency chain buttons,
 *     declared routes, and depended-on / depends-on lists.
 *   - Folder selected: Breakdown and file list.
 * - Zero network requests; bidirectional hover & selection.
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
  ArrowDownLeft,
  ArrowUpRight,
  X,
  FileQuestion,
  CornerDownRight,
  ShieldAlert,
  GitFork,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Lightbulb,
} from 'lucide-react';

function renderSplitPath(fullPath: string): React.ReactNode {
  const idx = fullPath.lastIndexOf('/');
  if (idx === -1) {
    return <span className="font-semibold text-foreground">{fullPath}</span>;
  }
  const prefix = fullPath.slice(0, idx + 1);
  const tail = fullPath.slice(idx + 1);
  return (
    <>
      <span className="text-muted-foreground font-normal">{prefix}</span>
      <span className="font-semibold text-foreground">{tail}</span>
    </>
  );
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
  onOpenRoutesTab?: () => void;
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
  onOpenRoutesTab,
}: DetailPaneProps) {
  const [isInsightsExpanded, setIsInsightsExpanded] = useState<boolean>(false);

  const fileMap = useMemo(() => {
    return new Map<string, ParsedFile>(files.map((f) => [f.path, f]));
  }, [files]);

  const nodeMap = useMemo(() => {
    return new Map<string, FoldedNode>(nodes.map((n) => [n.id, n]));
  }, [nodes]);

  const selectedFile = selectedId ? fileMap.get(selectedId) || null : null;
  const selectedNode =
    selectedId && !selectedFile ? nodeMap.get(selectedId) || null : null;

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

  const repoSummary = useMemo(() => {
    return computeRepositorySummary(repositoryName, adapter, files, edges, routes);
  }, [repositoryName, adapter, files, edges, routes]);

  const fileNeighbours = useMemo(() => {
    if (!selectedFile) return null;
    return computeFileNeighbours(selectedFile.path, edges);
  }, [selectedFile, edges]);

  const selectedFileRoutes = useMemo(() => {
    if (!selectedFile) return [];
    return routes.filter((r) => r.filePath === selectedFile.path);
  }, [selectedFile, routes]);

  const folderSummary = useMemo(() => {
    if (!selectedNode) return null;
    return computeFolderSummary(
      selectedNode.id,
      selectedNode.files,
      selectedNode.fanIn,
      selectedNode.fanOut
    );
  }, [selectedNode]);

  const insights = useMemo(() => {
    return computeCodebaseInsights(files, edges);
  }, [files, edges]);

  const formatFileKind = (file: ParsedFile): string => {
    if (file.role && file.role !== 'module') {
      const capitalized =
        file.role.charAt(0).toUpperCase() + file.role.slice(1);
      return `${capitalized} (${file.extension})`;
    }
    return `${file.extension} file`;
  };

  const contextKind = selectedFile
    ? 'file'
    : selectedNode
      ? 'folder'
      : 'repository';

  const contextPath = selectedFile
    ? selectedFile.path
    : selectedNode
      ? selectedNode.id
      : repositoryName;

  return (
    <aside
      className="w-80 shrink-0 h-full bg-card border-l border-border flex flex-col select-none z-10 font-mono text-foreground"
      aria-label="Detail Pane"
    >
      {/* Top Context Header + Persistent Structure | Explanation Tabs */}
      <div className="shrink-0 border-b border-border bg-card">
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-[11px] font-sans text-muted-foreground">
              {contextKind}
            </span>
            {selectedId && (
              <button
                type="button"
                onClick={() => {
                  onWalkTypeChange(null);
                  onSelect(null);
                }}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                title="Deselect to view repository summary"
                aria-label="Deselect"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="text-xs font-mono leading-snug break-all">
            {renderSplitPath(contextPath)}
          </div>
        </div>

        {/* Clean underline tabs */}
        <div className="flex items-center gap-5 px-4">
          <button
            type="button"
            onClick={() => onTabChange('structure')}
            className={`py-2 text-xs font-sans font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'structure'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Structure
          </button>

          <button
            type="button"
            onClick={() => onTabChange('explanation')}
            className={`py-2 text-xs font-sans font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'explanation'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Explanation
          </button>
        </div>
      </div>

      {/* Pane Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/60">
        {activeTab === 'explanation' ? (
          /* Tab: Explanation (Empty State until AI layer) */
          <div className="p-4 space-y-1.5 font-sans">
            <p className="text-xs font-semibold text-foreground">
              No explanation yet.
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Explanations come from a model call, and nothing makes one yet.
            </p>
          </div>
        ) : selectedFile && fileNeighbours ? (
          /* Tab: Structure — File Selected */
          <>
            <div className="p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded bg-secondary/40 border border-border">
                  <div className="text-[9px] text-muted-foreground uppercase">Kind</div>
                  <div className="text-foreground truncate">
                    {formatFileKind(selectedFile)}
                  </div>
                </div>

                <div className="p-2 rounded bg-secondary/40 border border-border">
                  <div className="text-[9px] text-muted-foreground uppercase">Length</div>
                  <div className="text-foreground tabular-nums">
                    {selectedFile.lines} lines
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 text-[11px]">
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>Depended on by:</span>
                  <strong className="text-foreground font-semibold tabular-nums">
                    {fileNeighbours.dependents.length}
                  </strong>
                </div>

                <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Depends on:</span>
                  <strong className="text-foreground font-semibold tabular-nums">
                    {fileNeighbours.dependencies.length}
                  </strong>
                </div>
              </div>

              {/* Phase 6: Blast radius (incoming = green) & Dependency chain (outgoing = amber) */}
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onWalkTypeChange(
                      activeWalkType === 'blast_radius' ? null : 'blast_radius'
                    );
                  }}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    activeWalkType === 'blast_radius'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/50'
                      : 'bg-secondary/60 text-foreground hover:bg-secondary border border-border'
                  }`}
                  title="Compute transitive incoming impact (everything that breaks if this file changes)"
                >
                  <ShieldAlert className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
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
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    activeWalkType === 'dependency_chain'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/50'
                      : 'bg-secondary/60 text-foreground hover:bg-secondary border border-border'
                  }`}
                  title="Compute transitive outgoing requirements (everything this file needs)"
                >
                  <GitFork className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Dependency chain</span>
                </button>
              </div>

              {/* Phase 8: Routes declared in this file */}
              {selectedFileRoutes.length > 0 && (
                <div className="pt-2 border-t border-border/60 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    <span>Declared Routes</span>
                    <span className="tabular-nums">({selectedFileRoutes.length})</span>
                  </div>
                  <div className="space-y-1">
                    {selectedFileRoutes.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 text-xs font-mono py-1 px-2 rounded bg-secondary/40 border border-border"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-bold uppercase text-primary shrink-0">
                            {r.method}
                          </span>
                          <span className="text-foreground truncate">{r.pattern}</span>
                        </div>
                        {typeof r.line === 'number' && (
                          <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                            :{r.line}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {walkResult ? (
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-border/60">
                  <div className="flex items-center gap-1.5">
                    {walkResult.direction === 'incoming' ? (
                      <ShieldAlert className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <GitFork className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    )}
                    <span className="text-xs font-semibold text-foreground">
                      {walkResult.direction === 'incoming'
                        ? 'Blast radius (2 levels)'
                        : 'Dependency chain (2 levels)'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onWalkTypeChange(null)}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    close
                  </button>
                </div>

                <div className="text-[10px] text-muted-foreground italic">
                  {walkResult.direction === 'incoming'
                    ? 'Everything that breaks if this file changes'
                    : 'Everything this file needs transitively'}
                </div>

                {/* Level 1 */}
                <div className="space-y-1 pt-1">
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                    Level 1 — Direct ({walkResult.level1.length})
                  </div>
                  {walkResult.level1.length === 0 ? (
                    <div className="text-[10px] text-muted-foreground italic py-1">
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
                            className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors flex items-center justify-between group cursor-pointer ${
                              isHovered
                                ? 'bg-primary/15 text-foreground ring-1 ring-primary/50'
                                : 'text-foreground/80 hover:bg-secondary/70 hover:text-foreground'
                            }`}
                            title={`Select ${p}`}
                          >
                            <span className="truncate pr-1">{fileName}</span>
                            <span className="text-[9px] text-muted-foreground truncate max-w-[80px]">
                              {p.split('/').slice(0, -1).join('/') || '.'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Level 2 */}
                <div className="space-y-1 pt-2">
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                    Level 2 — Transitive ({walkResult.level2.length})
                  </div>
                  {walkResult.level2.length === 0 ? (
                    <div className="text-[10px] text-muted-foreground italic py-1">
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
                            className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors flex items-center justify-between group cursor-pointer ${
                              isHovered
                                ? 'bg-primary/15 text-foreground ring-1 ring-primary/50'
                                : 'text-foreground/80 hover:bg-secondary/70 hover:text-foreground'
                            }`}
                            title={`Select ${p}`}
                          >
                            <span className="truncate pr-1">{fileName}</span>
                            <span className="text-[9px] text-muted-foreground truncate max-w-[80px]">
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
              <>
                {/* Depended on by */}
                <div className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <div className="flex items-center gap-1.5">
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      <span>Depended on by</span>
                    </div>
                    <span className="text-muted-foreground text-[10px] tabular-nums">
                      ({fileNeighbours.dependents.length})
                    </span>
                  </div>

                  {fileNeighbours.dependents.length === 0 ? (
                    <div className="text-[10px] text-muted-foreground italic py-1 px-1.5">
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
                            className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors flex items-center justify-between group cursor-pointer ${
                              isHovered
                                ? 'bg-primary/15 text-foreground ring-1 ring-primary/50'
                                : 'text-foreground/80 hover:bg-secondary/70 hover:text-foreground'
                            }`}
                            title={`Select ${depPath}`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 pr-1">
                              <CornerDownRight
                                className={`w-2.5 h-2.5 shrink-0 ${
                                  isHovered
                                    ? 'text-primary'
                                    : 'text-emerald-600/70 dark:text-emerald-400/70'
                                }`}
                              />
                              <span className="truncate">{fileName}</span>
                            </div>
                            <span className="text-[9px] text-muted-foreground truncate max-w-[90px] text-right">
                              {depPath.split('/').slice(0, -1).join('/') || '.'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Depends on */}
                <div className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                    <div className="flex items-center gap-1.5">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>Depends on</span>
                    </div>
                    <span className="text-muted-foreground text-[10px] tabular-nums">
                      ({fileNeighbours.dependencies.length})
                    </span>
                  </div>

                  {fileNeighbours.dependencies.length === 0 ? (
                    <div className="text-[10px] text-muted-foreground italic py-1 px-1.5">
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
                            className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors flex items-center justify-between group cursor-pointer ${
                              isHovered
                                ? 'bg-primary/15 text-foreground ring-1 ring-primary/50'
                                : 'text-foreground/80 hover:bg-secondary/70 hover:text-foreground'
                            }`}
                            title={`Select ${targetPath}`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 pr-1">
                              <CornerDownRight
                                className={`w-2.5 h-2.5 shrink-0 ${
                                  isHovered
                                    ? 'text-primary'
                                    : 'text-amber-600/70 dark:text-amber-400/70'
                                }`}
                              />
                              <span className="truncate">{fileName}</span>
                            </div>
                            <span className="text-[9px] text-muted-foreground truncate max-w-[90px] text-right">
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
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-semibold text-foreground break-all">
                  {selectedNode.id}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[11px] pt-1">
                <div className="p-2 rounded bg-secondary/40 border border-border text-center">
                  <div className="text-[9px] text-muted-foreground uppercase">Files</div>
                  <div className="text-foreground font-semibold tabular-nums">
                    {folderSummary.totalFiles}
                  </div>
                </div>

                <div className="p-2 rounded bg-secondary/40 border border-border text-center">
                  <div className="text-[9px] text-emerald-700 dark:text-emerald-400/80 uppercase">In</div>
                  <div className="text-foreground font-semibold tabular-nums">
                    {folderSummary.fanIn}
                  </div>
                </div>

                <div className="p-2 rounded bg-secondary/40 border border-border text-center">
                  <div className="text-[9px] text-amber-700 dark:text-amber-400/80 uppercase">Out</div>
                  <div className="text-foreground font-semibold tabular-nums">
                    {folderSummary.fanOut}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 space-y-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                File Breakdown
              </div>

              <div className="space-y-1.5">
                {folderSummary.categories
                  .filter((cat) => cat.count > 0)
                  .map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between text-xs py-1 px-1.5 rounded bg-secondary/40"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-[2px] shrink-0"
                          style={{ backgroundColor: cat.color }}
                          aria-hidden="true"
                        />
                        <span className="text-foreground">{cat.name}</span>
                      </div>
                      <span className="text-muted-foreground tabular-nums">
                        {cat.count} files
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                <span>Contained Files</span>
                <span className="tabular-nums">({folderSummary.files.length})</span>
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
                      className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors flex items-center justify-between group cursor-pointer ${
                        isHovered
                          ? 'bg-primary/15 text-foreground ring-1 ring-primary/50'
                          : 'text-foreground/80 hover:bg-secondary/70 hover:text-foreground'
                      }`}
                      title={`Select ${file.path}`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 pr-1">
                        <FileCode className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{fileName}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {file.lines}L
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          /* Tab: Structure — Resting State (Nothing Selected: Repository Summary) */
          <>
            <div className="p-3 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] p-2 rounded bg-secondary/40 border border-border">
                <span className="text-muted-foreground">Framework</span>
                <span className="font-semibold text-primary">
                  {repoSummary.frameworkDetected}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="p-2 rounded bg-secondary/40 border border-border">
                  <div className="text-[9px] text-muted-foreground uppercase">Files</div>
                  <div className="text-xs font-semibold text-foreground tabular-nums">
                    {repoSummary.filesCount}
                  </div>
                </div>

                <div className="p-2 rounded bg-secondary/40 border border-border">
                  <div className="text-[9px] text-muted-foreground uppercase">Imports</div>
                  <div className="text-xs font-semibold text-foreground tabular-nums">
                    {repoSummary.importsCount}
                  </div>
                </div>

                {onOpenRoutesTab ? (
                  <button
                    type="button"
                    onClick={onOpenRoutesTab}
                    className="p-2 rounded bg-secondary/40 hover:bg-secondary border border-border hover:border-primary/40 transition-colors cursor-pointer"
                    title="Open extracted routes table"
                  >
                    <div className="text-[9px] text-muted-foreground uppercase">Routes</div>
                    <div className="text-xs font-semibold text-foreground tabular-nums">
                      {repoSummary.routesCount}
                    </div>
                  </button>
                ) : (
                  <div className="p-2 rounded bg-secondary/40 border border-border">
                    <div className="text-[9px] text-muted-foreground uppercase">Routes</div>
                    <div className="text-xs font-semibold text-foreground tabular-nums">
                      {repoSummary.routesCount}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground px-1 pt-0.5">
                <FileQuestion className="w-3 h-3 opacity-70 shrink-0" />
                <span>
                  <strong className="text-foreground font-medium tabular-nums">
                    {repoSummary.unidentifiedCount}
                  </strong>{' '}
                  files without convention role
                </span>
              </div>
            </div>

            {/* Ranked List 1: Leaned on most */}
            <div className="p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                <span>Leaned on most</span>
                <span>by imports</span>
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
                      className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors flex items-center justify-between group cursor-pointer ${
                        isHovered
                          ? 'bg-primary/15 text-foreground ring-1 ring-primary/50'
                          : 'text-foreground/80 hover:bg-secondary/70 hover:text-foreground'
                      }`}
                      title={`Select ${file.path} (${file.fanIn} imports)`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 pr-1">
                        <span className="text-[9px] text-muted-foreground font-mono w-4 shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="truncate">{fileName}</span>
                      </div>
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums shrink-0">
                        {file.fanIn} in
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ranked List 2: Where reading starts */}
            <div className="p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                <span>Where reading starts</span>
                <span className="tabular-nums">
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
                      className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors flex items-center justify-between group cursor-pointer ${
                        isHovered
                          ? 'bg-primary/15 text-foreground ring-1 ring-primary/50'
                          : 'text-foreground/80 hover:bg-secondary/70 hover:text-foreground'
                      }`}
                      title={`Select ${file.path}`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 pr-1">
                        <FileCode className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{fileName}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {file.lines}L
                      </span>
                    </button>
                  );
                })}

                {repoSummary.readingStarts.length > 15 && (
                  <div className="px-2 py-1 text-[9px] text-muted-foreground text-center italic">
                    +{repoSummary.readingStarts.length - 15} more entrypoint files
                  </div>
                )}
              </div>
            </div>

            {/* Phase 6: Codebase Insights Panel (collapsed by default) */}
            <div className="p-3 space-y-2 border-t border-border/60">
              <button
                type="button"
                onClick={() => setIsInsightsExpanded(!isInsightsExpanded)}
                className="w-full flex items-center justify-between py-1.5 px-2 rounded bg-secondary/50 hover:bg-secondary border border-border transition-colors text-left cursor-pointer"
                title="Toggle Codebase Insights"
              >
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-foreground">
                    Codebase Insights
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    ({insights.reduce((acc, cur) => acc + (cur.files.length > 0 ? 1 : 0), 0)})
                  </span>
                </div>
                {isInsightsExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>

              {isInsightsExpanded && (
                <div className="space-y-3 pt-1">
                  {insights.map((insight) => {
                    if (insight.files.length === 0) return null;

                    return (
                      <div
                        key={insight.kind}
                        className="p-2.5 rounded bg-secondary/30 border border-border space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {insight.kind === 'cycle' && (
                              <RefreshCw className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                            )}
                            {insight.kind === 'unimported' && (
                              <FileQuestion className="w-3 h-3 text-primary" />
                            )}
                            {insight.kind === 'popular' && (
                              <ArrowDownLeft className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            )}
                            {insight.kind === 'oversized' && (
                              <Layers className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            )}
                            <span className="text-xs font-semibold text-foreground">
                              {insight.title}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {insight.kind === 'cycle' && insight.cycles
                              ? `${insight.cycles.length} cycle`
                              : `${insight.files.length} files`}
                          </span>
                        </div>

                        <div className="text-[10px] text-muted-foreground italic leading-snug">
                          {insight.sentence}
                        </div>

                        {insight.kind === 'cycle' && insight.cycles && (
                          <div className="space-y-2 pt-1">
                            {insight.cycles.map((cyc, cIdx) => (
                              <div
                                key={cIdx}
                                className="p-2 rounded bg-card border border-rose-500/25 text-[10px] space-y-1"
                              >
                                <div className="text-rose-700 dark:text-rose-300 font-semibold text-[9px] uppercase">
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
                                        className={`w-full text-left truncate block py-0.5 px-1 rounded transition-colors cursor-pointer ${
                                          isHovered
                                            ? 'bg-rose-500/20 text-foreground font-semibold'
                                            : 'text-foreground/80 hover:text-foreground hover:bg-secondary'
                                        }`}
                                        title={`Hop ${hIdx + 1}: ${hop}`}
                                      >
                                        <span className="text-rose-600 dark:text-rose-400 mr-1">
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
                                  className={`w-full text-left px-1.5 py-1 rounded text-[10px] transition-colors flex items-center justify-between group cursor-pointer ${
                                    isHovered
                                      ? 'bg-primary/15 text-foreground ring-1 ring-primary/50'
                                      : 'text-foreground/80 hover:bg-secondary/70 hover:text-foreground'
                                  }`}
                                  title={`Select ${p}`}
                                >
                                  <span className="truncate pr-1">
                                    {fileName}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground truncate max-w-[80px]">
                                    {p.split('/').slice(0, -1).join('/') || '.'}
                                  </span>
                                </button>
                              );
                            })}
                            {insight.files.length > 8 && (
                              <div className="text-[9px] text-muted-foreground text-center italic py-0.5">
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
