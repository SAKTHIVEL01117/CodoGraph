"use client";

/**
 * CodoGraph — Three-Column Canvas Shell (Phases 4, 5, 6, 7 & 8).
 *
 * Implements the docked architectural shell:
 * - Full-width Top Header Bar: repo owner/name + commit hash (with org switcher),
 *   theme toggle, Re-run trigger, and Workspace close button.
 * - Three settled columns:
 *   1. Left Rail: Framework-reshaped categories in fixed reading order.
 *   2. Middle Column: Map | Routes <N> tabs with single-line Coverage dropdown.
 *      - Map view: Interactive DAG canvas with folding, category dimming,
 *        and transitive walk highlighting.
 *      - Routes view: Dense Method | Pattern | Declared in (filePath:line) table
 *        with synced selection into the right Detail Pane.
 *   3. Right Column: Detail Pane with Structure | Explanation tabs.
 */
import React, { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import type { ParserResult } from '@/lib/parser/types';
import { categorizeFiles } from '@/lib/canvas/taxonomy';
import { computeFoldedGraph } from '@/lib/canvas/folding';
import { computeTransitiveWalk, type TransitiveWalkResult } from '@/lib/canvas/metrics';
import { LeftRail } from './left-rail';
import { CanvasArea } from './canvas-area';
import { DetailPane, type CachedExplanationData } from './detail-pane';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  AlertCircle,
  FileQuestion,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';

export interface AnalysisSummary {
  id: string;
  repository: string;
  branch: string;
  state: 'queued' | 'fetching' | 'selecting' | 'parsing' | 'storing' | 'complete' | 'failed';
  commit: string | null;
  errorMessage?: string | null;
  result?: ParserResult;
}

interface CanvasShellProps {
  primaryAnalysis: ParserResult;
  orgAnalyses?: AnalysisSummary[];
  initialAnalysisId: string;
}

function renderRepoName(name: string): React.ReactNode {
  const slashIdx = name.lastIndexOf('/');
  if (slashIdx === -1) {
    return <span className="font-semibold text-foreground">{name}</span>;
  }
  return (
    <>
      <span className="text-muted-foreground font-normal">
        {name.slice(0, slashIdx + 1)}
      </span>
      <span className="font-semibold text-foreground">
        {name.slice(slashIdx + 1)}
      </span>
    </>
  );
}

export function CanvasShell({
  primaryAnalysis,
  orgAnalyses,
  initialAnalysisId,
}: CanvasShellProps) {
  const router = useRouter();
  const { getToken } = useAuth({ treatPendingAsSignedOut: false });

  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isCoverageOpen, setIsCoverageOpen] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);

  // Middle column tab: Interactive Map vs Declared Routes table
  const [centerTab, setCenterTab] = useState<'map' | 'routes'>('map');

  // Phase 5 Detail Pane and Canvas selection/hover state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'structure' | 'explanation'>('structure');
  const [openNodeIds, setOpenNodeIds] = useState<Set<string>>(new Set());

  // Phase 6 Left Rail category filtering & Transitive walk highlighting
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeWalkType, setActiveWalkType] = useState<
    'blast_radius' | 'dependency_chain' | null
  >(null);

  const analysesList: AnalysisSummary[] = useMemo(() => {
    return orgAnalyses ?? [];
  }, [orgAnalyses]);

  const currentAnalysis: AnalysisSummary =
    analysesList.find((a) => a.id === initialAnalysisId) ||
    analysesList[0] || {
      id: initialAnalysisId,
      repository: primaryAnalysis.repositoryRoot || 'Repository',
      branch: 'main',
      state: 'complete' as const,
      commit: null,
      errorMessage: null,
      result: primaryAnalysis,
    };

  const activeResult: ParserResult = currentAnalysis.result || primaryAnalysis;

  // Phase 10: Persistent explanation cache & dynamic model role assignments
  const [explanationCache, setExplanationCache] = useState<
    Map<string, CachedExplanationData>
  >(new Map());

  const handleCacheExplanation = (id: string, data: CachedExplanationData) => {
    setExplanationCache((prev) => new Map(prev).set(id, data));
  };

  const [roleOverrides, setRoleOverrides] = useState<Map<string, string>>(new Map());

  const handleRoleUpdate = (filePath: string, newRole: string) => {
    setRoleOverrides((prev) => new Map(prev).set(filePath, newRole));
  };

  const mergedFiles = useMemo(() => {
    if (roleOverrides.size === 0) return activeResult.files;
    return activeResult.files.map((f) => {
      const override = roleOverrides.get(f.path);
      return override ? { ...f, role: override } : f;
    });
  }, [activeResult.files, roleOverrides]);

  const sortedRoutes = useMemo(() => {
    return [...(activeResult.routes || [])].sort(
      (a, b) =>
        a.pattern.localeCompare(b.pattern) ||
        a.method.localeCompare(b.method) ||
        a.filePath.localeCompare(b.filePath) ||
        (a.line ?? 0) - (b.line ?? 0)
    );
  }, [activeResult.routes]);

  // Derive coverage ratio and partial status for Phase 7 coverage banner
  const coverage = activeResult.coverage;
  const totalImportsToResolve =
    (coverage?.importsResolvedInternal ?? 0) + (coverage?.importsUnresolved ?? 0);
  const computedRatio =
    coverage && coverage.filesFound > 0 && mergedFiles.length === 0
      ? 0
      : totalImportsToResolve > 0
        ? Number((((coverage?.importsResolvedInternal ?? 0) / totalImportsToResolve) * 100).toFixed(1))
        : 100;
  const coverageRatio =
    (coverage as { coverageRatio?: number })?.coverageRatio ?? computedRatio;

  const isPartial =
    coverageRatio < 95 ||
    (mergedFiles.length === 0 && (coverage?.filesFound ?? 0) > 0);

  // Pure derivation of categories for left rail (reshaped per framework adapter)
  const categories = useMemo(() => {
    return categorizeFiles(mergedFiles, activeResult.adapter);
  }, [mergedFiles, activeResult.adapter]);

  // Pure computation of folded graph
  const foldedGraph = useMemo(() => {
    return computeFoldedGraph(
      mergedFiles,
      activeResult.edges,
      openNodeIds
    );
  }, [mergedFiles, activeResult.edges, openNodeIds]);

  const selectedFile = useMemo(() => {
    if (!selectedId) return null;
    return mergedFiles.find((f) => f.path === selectedId) || null;
  }, [selectedId, mergedFiles]);

  const walkResult: TransitiveWalkResult | null = useMemo(() => {
    if (!selectedFile || !activeWalkType) return null;
    const dir = activeWalkType === 'blast_radius' ? 'incoming' : 'outgoing';
    return computeTransitiveWalk(selectedFile.path, activeResult.edges, dir, 2);
  }, [selectedFile, activeWalkType, activeResult.edges]);

  const highlightedPaths = useMemo(() => {
    if (!walkResult) return null;
    return new Set<string>(walkResult.all.map((w) => w.path));
  }, [walkResult]);

  const handleToggleNodeOpen = useCallback((nodeId: string) => {
    setOpenNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleSelectId = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      setActiveWalkType(null);
      if (id) {
        const containingNode = foldedGraph.nodes.find((n) =>
          n.files.some((f) => f.path === id)
        );
        if (containingNode && !openNodeIds.has(containingNode.id)) {
          setOpenNodeIds((prev) => {
            const next = new Set(prev);
            next.add(containingNode.id);
            return next;
          });
        }
      }
    },
    [foldedGraph.nodes, openNodeIds]
  );

  const handleRerunAnalysis = async () => {
    if (isRerunning) return;
    setIsRerunning(true);
    setRerunError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          rerunAnalysisId: currentAnalysis.id,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRerunError(data?.error || `Failed to re-run analysis (HTTP ${res.status}).`);
        setIsRerunning(false);
        return;
      }

      router.refresh();
    } catch (err) {
      setRerunError(err instanceof Error ? err.message : 'Network error initiating re-run.');
      setIsRerunning(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-background text-foreground font-jetbrains antialiased relative">
      {/* Docked Full-Width Top Header Bar */}
      <header className="h-11 shrink-0 border-b border-border bg-card px-4 flex items-center justify-between gap-4 z-30">
        {/* Left: Repo Name + Commit SHA (with Organization Analysis Switcher) */}
        <div className="relative flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              if (analysesList.length > 0) {
                setIsSwitcherOpen(!isSwitcherOpen);
              }
            }}
            className={`flex items-center gap-2 py-1 px-1.5 -ml-1.5 rounded-md text-xs font-mono transition-colors ${
              analysesList.length > 0
                ? 'hover:bg-secondary/70 cursor-pointer'
                : 'cursor-default'
            }`}
            title={
              analysesList.length > 0
                ? 'Switch analysis in organization'
                : currentAnalysis.repository
            }
          >
            {currentAnalysis.state !== 'complete' && (
              <>
                {(currentAnalysis.state === 'parsing' ||
                  currentAnalysis.state === 'fetching' ||
                  currentAnalysis.state === 'selecting' ||
                  currentAnalysis.state === 'storing') && (
                  <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
                )}
                {currentAnalysis.state === 'queued' && (
                  <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                )}
                {currentAnalysis.state === 'failed' && (
                  <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                )}
              </>
            )}

            <span className="text-xs font-sans truncate">
              {renderRepoName(currentAnalysis.repository)}
            </span>

            {currentAnalysis.commit && (
              <span className="text-muted-foreground text-xs font-mono shrink-0">
                {currentAnalysis.commit}
              </span>
            )}

            {analysesList.length > 1 && (
              <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
            )}
          </button>

          {/* Organization Analysis Switcher Dropdown */}
          {isSwitcherOpen && analysesList.length > 0 && (
            <div
              className="absolute top-full left-0 mt-1.5 w-80 bg-popover border border-border rounded-lg shadow-xl p-1.5 font-mono z-50 divide-y divide-border/60"
              onMouseLeave={() => setIsSwitcherOpen(false)}
            >
              <div className="px-2.5 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">
                Organization Analyses ({analysesList.length})
              </div>
              <div className="py-1 space-y-0.5 max-h-64 overflow-y-auto">
                {analysesList.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setIsSwitcherOpen(false);
                      if (item.id !== initialAnalysisId) {
                        router.push(`/analysis/${item.id}`);
                      }
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between text-xs transition-colors cursor-pointer ${
                      item.id === initialAnalysisId
                        ? 'bg-primary/15 text-foreground font-medium'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    <span className="truncate">{item.repository}</span>
                    <span className="text-[10px] text-muted-foreground uppercase shrink-0 ml-2">
                      {item.state}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Theme Toggle + Re-run + Close to Workspace */}
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />

          <button
            type="button"
            onClick={handleRerunAnalysis}
            disabled={isRerunning}
            className="h-7 px-2.5 rounded-md bg-background hover:bg-secondary disabled:opacity-50 border border-border text-foreground inline-flex items-center gap-1.5 text-xs font-sans font-medium transition-colors cursor-pointer"
            title="Re-run analysis from GitHub archive to refresh routes and categories"
          >
            {isRerunning && <RefreshCw className="w-3 h-3 text-primary animate-spin" />}
            <span>{isRerunning ? 'Starting...' : 'Re-run'}</span>
          </button>

          <Link
            href="/workspace"
            className="h-7 w-7 rounded-md bg-background hover:bg-secondary border border-border text-muted-foreground hover:text-foreground inline-flex items-center justify-center transition-colors"
            title="Close and return to workspace"
            aria-label="Close and return to workspace"
          >
            <X className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {rerunError && (
        <div className="px-4 py-1.5 bg-rose-500/10 border-b border-rose-500/30 text-rose-700 dark:text-rose-200 text-xs font-mono flex items-center justify-between gap-2 shrink-0 z-20">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{rerunError}</span>
          </div>
          <button
            type="button"
            onClick={() => setRerunError(null)}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Three-Column Settled Layout */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Column 1: Left Rail */}
        <LeftRail
          categories={categories}
          totalFiles={activeResult.files.length}
          activeCategory={activeCategory}
          onSelectCategory={setActiveCategory}
        />

        {/* Column 2: Middle Column (Map | Routes Tabs + View Body) */}
        {currentAnalysis.state === 'complete' ? (
          <div className="relative flex-1 min-w-0 h-full overflow-hidden flex flex-col bg-background">
            {/* Middle Tab Bar: Map | Routes <N> + Right-Aligned Single-Line Coverage */}
            <div className="h-10 shrink-0 border-b border-border bg-background px-5 flex items-center justify-between relative z-20">
              <div className="flex items-center gap-5 h-full">
                <button
                  type="button"
                  onClick={() => setCenterTab('map')}
                  className={`h-full px-0.5 inline-flex items-center text-xs font-sans font-medium border-b-2 transition-colors cursor-pointer ${
                    centerTab === 'map'
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Map
                </button>

                <button
                  type="button"
                  onClick={() => setCenterTab('routes')}
                  className={`h-full px-0.5 inline-flex items-center gap-1.5 text-xs font-sans font-medium border-b-2 transition-colors cursor-pointer ${
                    centerTab === 'routes'
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span>Routes</span>
                  <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
                    {sortedRoutes.length}
                  </span>
                </button>
              </div>

              {/* Coverage Indicator (Phase 7: single line when collapsed, never hidden) */}
              <div className="relative font-mono">
                <button
                  type="button"
                  onClick={() => setIsCoverageOpen(!isCoverageOpen)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] transition-colors cursor-pointer ${
                    isPartial
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-800 dark:text-amber-200'
                      : 'bg-card border-border text-muted-foreground hover:text-foreground'
                  }`}
                  title="Toggle coverage audit report"
                >
                  {isPartial ? (
                    <ShieldAlert className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  )}
                  <span className="font-medium text-foreground tabular-nums">
                    Coverage: {coverageRatio}%
                  </span>
                  {(coverage?.filesSkipped ?? 0) > 0 && (
                    <span className="text-[10px] text-muted-foreground hidden sm:inline tabular-nums">
                      · {coverage?.filesSkipped ?? 0} skipped
                    </span>
                  )}
                  {isCoverageOpen ? (
                    <ChevronUp className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  )}
                </button>

                {isCoverageOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-80 rounded-lg border border-border bg-popover p-3 text-[11px] shadow-xl space-y-1.5 z-40">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Source files parsed:</span>
                      <span className="text-foreground font-semibold tabular-nums">
                        {coverage?.filesParsed ?? activeResult.files.length}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Total files found:</span>
                      <span className="text-foreground tabular-nums">
                        {coverage?.filesFound ?? activeResult.files.length}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Imports resolved:</span>
                      <span className="text-foreground tabular-nums">
                        {coverage?.importsResolvedInternal ?? activeResult.edges.length} /{' '}
                        {coverage?.importsTotal ?? activeResult.edges.length}
                      </span>
                    </div>
                    {(coverage?.importsUnresolved ?? 0) > 0 && (
                      <div className="flex justify-between text-amber-700 dark:text-amber-300 font-medium">
                        <span>Imports unresolved:</span>
                        <span className="tabular-nums">{coverage?.importsUnresolved ?? 0}</span>
                      </div>
                    )}
                    {Array.isArray(coverage?.unresolvedDetails) && coverage.unresolvedDetails.length > 0 && (
                      <div className="pt-1.5 border-t border-border/60">
                        <p className="text-[10px] text-muted-foreground uppercase mb-1">
                          Unresolved Examples:
                        </p>
                        <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                          {coverage.unresolvedDetails.slice(0, 5).map((item, idx) => (
                            <div key={`${item.sourcePath}-${item.specifier}-${idx}`} className="text-[10px] text-muted-foreground leading-snug">
                              <span className="text-foreground font-medium">{item.sourcePath}</span>
                              {': '}
                              <span className="text-amber-700 dark:text-amber-300">{item.specifier}</span>
                              {' — '}
                              <span>{item.reason}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {coverage?.skipReasons && Object.keys(coverage.skipReasons).length > 0 && (
                      <div className="pt-1.5 border-t border-border/60">
                        <p className="text-[10px] text-muted-foreground uppercase mb-1">
                          Skip Breakdown:
                        </p>
                        <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                          {Object.entries(coverage.skipReasons).map(([reason, count]) => (
                            <div key={reason} className="flex justify-between text-[10px] text-muted-foreground">
                              <span className="truncate max-w-[180px]">{reason}</span>
                              <span className="tabular-nums">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Middle Body Content */}
            {centerTab === 'routes' ? (
              <div className="flex-1 min-h-0 flex flex-col bg-background overflow-hidden">
                <div className="px-5 py-2.5 text-xs font-sans text-muted-foreground border-b border-border/70 shrink-0">
                  Listed only where the method and the full path are both written in the code.
                </div>

                {sortedRoutes.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <div className="text-xs font-semibold text-foreground mb-1">
                      No routes declared
                    </div>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Route table is empty rather than inferred.
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <table className="w-full text-left border-collapse table-fixed">
                      <thead className="sticky top-0 bg-background z-10 border-b border-border">
                        <tr className="text-[11px] font-sans font-medium text-muted-foreground">
                          <th className="w-24 pl-5 pr-3 py-2 font-medium">Method</th>
                          <th className="w-[38%] px-3 py-2 font-medium">Pattern</th>
                          <th className="px-3 pr-5 py-2 font-medium">Declared in</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50 text-xs font-mono">
                        {sortedRoutes.map((route, idx) => {
                          const isSelected = selectedId === route.filePath;
                          const isHovered = hoveredId === route.filePath;
                          const declaredLocation =
                            typeof route.line === 'number'
                              ? `${route.filePath}:${route.line}`
                              : route.filePath;

                          return (
                            <tr
                              key={`${route.method}-${route.pattern}-${route.filePath}-${idx}`}
                              onClick={() => handleSelectId(route.filePath)}
                              onDoubleClick={() => {
                                handleSelectId(route.filePath);
                                setCenterTab('map');
                              }}
                              onMouseEnter={() => setHoveredId(route.filePath)}
                              onMouseLeave={() => setHoveredId(null)}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-primary/15 text-foreground'
                                  : isHovered
                                    ? 'bg-secondary/70 text-foreground'
                                    : 'text-foreground/90 hover:bg-secondary/45'
                              }`}
                              title="Click to inspect file details · Double-click to locate on Map"
                            >
                              <td
                                className={`pl-5 pr-3 py-2.5 align-top font-medium whitespace-nowrap border-l-2 ${
                                  isSelected ? 'border-l-primary' : 'border-l-transparent'
                                }`}
                              >
                                {route.method}
                              </td>
                              <td className="px-3 py-2.5 align-top break-words text-foreground">
                                {route.pattern}
                              </td>
                              <td className="px-3 pr-5 py-2.5 align-top break-all text-muted-foreground">
                                {declaredLocation}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : activeResult.files.length === 0 ? (
              <main className="flex-1 min-w-0 flex flex-col items-center justify-center font-mono bg-background text-center p-6 select-none relative">
                <div className="max-w-md p-8 rounded-2xl bg-card border border-border shadow-xl">
                  <FileQuestion className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    No Source Modules Found
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                    {currentAnalysis.repository} does not contain any TypeScript or JavaScript source files (.ts, .tsx, .js, .jsx, .mjs, .cjs).
                    {(coverage?.filesSkipped ?? 0) > 0
                      ? ` All ${coverage?.filesSkipped ?? 0} files were cataloged as non-source assets, styles, or markup.`
                      : ''}
                  </p>
                  <div className="text-[11px] font-mono text-muted-foreground bg-secondary/40 p-2.5 rounded-lg border border-border text-left mb-4">
                    Found: {coverage?.filesFound ?? 0} files | Parsed: 0 | Skipped: {coverage?.filesSkipped ?? 0}
                  </div>
                  <Link
                    href="/workspace"
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-xs font-mono text-foreground transition-colors"
                  >
                    Return to Workspace
                  </Link>
                </div>
              </main>
            ) : (
              <div className="flex-1 min-h-0 relative overflow-hidden flex">
                <CanvasArea
                  nodes={foldedGraph.nodes}
                  foldedEdges={foldedGraph.edges}
                  rawEdges={activeResult.edges}
                  selectedId={selectedId}
                  hoveredId={hoveredId}
                  activeCategory={activeCategory}
                  categories={categories}
                  highlightedPaths={highlightedPaths}
                  activeWalkType={activeWalkType}
                  onSelectId={handleSelectId}
                  onHoverId={setHoveredId}
                  onToggleNodeOpen={handleToggleNodeOpen}
                />
              </div>
            )}
          </div>
        ) : (
          <main className="flex-1 min-w-0 h-full flex flex-col items-center justify-center font-mono bg-background text-center p-6 select-none">
            <div className="max-w-md p-6 rounded-2xl bg-card border border-border shadow-xl">
              {currentAnalysis.state === 'queued' && (
                <div className="flex flex-col items-center">
                  <Clock className="w-8 h-8 text-amber-500 mb-3" />
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    Analysis Queued
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {currentAnalysis.repository} is waiting in the analysis pipeline queue.
                  </p>
                </div>
              )}
              {(currentAnalysis.state === 'fetching' ||
                currentAnalysis.state === 'selecting' ||
                currentAnalysis.state === 'parsing' ||
                currentAnalysis.state === 'storing') && (
                <div className="flex flex-col items-center">
                  <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
                  <h3 className="text-sm font-semibold text-foreground mb-1 capitalize">
                    {currentAnalysis.state}...
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Analysis pipeline is actively processing {currentAnalysis.repository}.
                  </p>
                </div>
              )}
              {currentAnalysis.state === 'failed' && (
                <div className="flex flex-col items-center">
                  <AlertCircle className="w-8 h-8 text-rose-500 mb-3" />
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    Analysis Failed
                  </h3>
                  <p className="text-xs text-rose-600 dark:text-rose-300">
                    {currentAnalysis.errorMessage || 'Analysis failed before completion.'}
                  </p>
                </div>
              )}
            </div>
          </main>
        )}

        {/* Column 3: Right Detail Pane */}
        <DetailPane
          analysisId={currentAnalysis.id}
          commitHash={currentAnalysis.commit}
          repositoryName={currentAnalysis.repository}
          adapter={activeResult.adapter}
          files={mergedFiles}
          edges={activeResult.edges}
          nodes={foldedGraph.nodes}
          routes={sortedRoutes}
          selectedId={selectedId}
          hoveredId={hoveredId}
          activeTab={activeTab}
          activeWalkType={activeWalkType}
          walkResult={walkResult}
          onTabChange={setActiveTab}
          onSelect={handleSelectId}
          onHover={setHoveredId}
          onWalkTypeChange={setActiveWalkType}
          onOpenRoutesTab={() => setCenterTab('routes')}
          explanationCache={explanationCache}
          onCacheExplanation={handleCacheExplanation}
          onRoleUpdate={handleRoleUpdate}
        />
      </div>
    </div>
  );
}
