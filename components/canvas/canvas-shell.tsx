"use client";

/**
 * CodoGraph — Three-Column Canvas Shell (Phase 4, 5 & 6).
 *
 * Implements the full canvas shell from docs/specs/phase-04.md, phase-05.md, and phase-06.md:
 * - Top-center circular close button (X) linking back to /workspace.
 * - Multi-analysis switcher for organization analyses.
 * - Three settled columns:
 *   1. Left Rail: Interactive category filtering with swatches and counts.
 *   2. Middle Column: Interactive DAG canvas with folding, bidirectional hover,
 *      category dimming, and transitive walk highlighting.
 *   3. Right Column: Detail Pane with repository summary, file/folder metrics,
 *      blast radius, dependency chain, insights, and Structure/Explanation tabs.
 */
import React, { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ParserResult } from '@/lib/parser/types';
import { categorizeFiles } from '@/lib/canvas/taxonomy';
import { computeFoldedGraph } from '@/lib/canvas/folding';
import { computeTransitiveWalk, type TransitiveWalkResult } from '@/lib/canvas/metrics';
import { LeftRail } from './left-rail';
import { CanvasArea } from './canvas-area';
import { DetailPane } from './detail-pane';
import { X, ChevronDown, ChevronUp, Clock, Loader2, AlertCircle, FileQuestion, ShieldAlert } from 'lucide-react';

export interface AnalysisSummary {
  id: string;
  repository: string;
  branch: string;
  state: 'queued' | 'parsing' | 'complete' | 'failed';
  commit: string | null;
  result?: ParserResult;
}

const nestjsAnalysisResult: ParserResult = {
  repositoryRoot: 'nestjs/nest',
  timestamp: new Date().toISOString(),
  adapter: 'nestjs',
  files: [
    {
      path: 'src/cats/cats.controller.ts',
      folder: 'src/cats',
      extension: '.ts',
      lines: 48,
      sizeBytes: 1200,
      contentHash: 'hash_cats_ctrl',
      isSourceCode: true,
      fanIn: 1,
      fanOut: 1,
      role: 'Controllers',
    },
    {
      path: 'src/users/users.controller.ts',
      folder: 'src/users',
      extension: '.ts',
      lines: 36,
      sizeBytes: 950,
      contentHash: 'hash_users_ctrl',
      isSourceCode: true,
      fanIn: 1,
      fanOut: 1,
      role: 'Controllers',
    },
    {
      path: 'src/app.controller.ts',
      folder: 'src',
      extension: '.ts',
      lines: 22,
      sizeBytes: 600,
      contentHash: 'hash_app_ctrl',
      isSourceCode: true,
      fanIn: 1,
      fanOut: 0,
      role: 'Controllers',
    },
    {
      path: 'src/cats/cats.service.ts',
      folder: 'src/cats',
      extension: '.ts',
      lines: 55,
      sizeBytes: 1400,
      contentHash: 'hash_cats_srv',
      isSourceCode: true,
      fanIn: 2,
      fanOut: 1,
      role: 'Services',
    },
    {
      path: 'src/users/users.service.ts',
      folder: 'src/users',
      extension: '.ts',
      lines: 42,
      sizeBytes: 1100,
      contentHash: 'hash_users_srv',
      isSourceCode: true,
      fanIn: 2,
      fanOut: 1,
      role: 'Services',
    },
    {
      path: 'src/cats/cats.module.ts',
      folder: 'src/cats',
      extension: '.ts',
      lines: 18,
      sizeBytes: 450,
      contentHash: 'hash_cats_mod',
      isSourceCode: true,
      fanIn: 1,
      fanOut: 2,
      role: 'Modules',
    },
    {
      path: 'src/users/users.module.ts',
      folder: 'src/users',
      extension: '.ts',
      lines: 18,
      sizeBytes: 450,
      contentHash: 'hash_users_mod',
      isSourceCode: true,
      fanIn: 1,
      fanOut: 2,
      role: 'Modules',
    },
    {
      path: 'src/app.module.ts',
      folder: 'src',
      extension: '.ts',
      lines: 25,
      sizeBytes: 650,
      contentHash: 'hash_app_mod',
      isSourceCode: true,
      fanIn: 0,
      fanOut: 3,
      role: 'Modules',
    },
    {
      path: 'src/cats/cat.entity.ts',
      folder: 'src/cats',
      extension: '.ts',
      lines: 30,
      sizeBytes: 700,
      contentHash: 'hash_cat_ent',
      isSourceCode: true,
      fanIn: 1,
      fanOut: 0,
      role: 'Entities',
    },
    {
      path: 'src/users/user.entity.ts',
      folder: 'src/users',
      extension: '.ts',
      lines: 28,
      sizeBytes: 680,
      contentHash: 'hash_user_ent',
      isSourceCode: true,
      fanIn: 1,
      fanOut: 0,
      role: 'Entities',
    },
  ],
  edges: [
    { sourcePath: 'src/cats/cats.controller.ts', targetPath: 'src/cats/cats.service.ts', kind: 'import', specifier: './cats.service' },
    { sourcePath: 'src/cats/cats.service.ts', targetPath: 'src/cats/cat.entity.ts', kind: 'import', specifier: './cat.entity' },
    { sourcePath: 'src/users/users.controller.ts', targetPath: 'src/users/users.service.ts', kind: 'import', specifier: './users.service' },
    { sourcePath: 'src/users/users.service.ts', targetPath: 'src/users/user.entity.ts', kind: 'import', specifier: './user.entity' },
    { sourcePath: 'src/app.module.ts', targetPath: 'src/cats/cats.module.ts', kind: 'import', specifier: './cats/cats.module' },
    { sourcePath: 'src/app.module.ts', targetPath: 'src/users/users.module.ts', kind: 'import', specifier: './users/users.module' },
    { sourcePath: 'src/app.module.ts', targetPath: 'src/app.controller.ts', kind: 'import', specifier: './app.controller' },
  ],
  folders: ['src', 'src/cats', 'src/users'],
  routes: [
    { method: 'GET', pattern: '/cats', filePath: 'src/cats/cats.controller.ts', framework: 'nestjs' },
    { method: 'GET', pattern: '/cats/:id', filePath: 'src/cats/cats.controller.ts', framework: 'nestjs' },
    { method: 'POST', pattern: '/cats', filePath: 'src/cats/cats.controller.ts', framework: 'nestjs' },
    { method: 'DELETE', pattern: '/cats/:id', filePath: 'src/cats/cats.controller.ts', framework: 'nestjs' },
    { method: 'GET', pattern: '/api/v1/users', filePath: 'src/users/users.controller.ts', framework: 'nestjs' },
    { method: 'PUT', pattern: '/api/v1/users/:id', filePath: 'src/users/users.controller.ts', framework: 'nestjs' },
    { method: 'GET', pattern: '/health', filePath: 'src/app.controller.ts', framework: 'nestjs' },
  ],
  coverage: {
    filesFound: 10,
    filesParsed: 10,
    filesSkipped: 0,
    skipReasons: {},
    skippedFiles: [],
    importsTotal: 7,
    importsResolvedInternal: 7,
    importsExternal: 5,
    importsExcluded: 0,
    importsUnresolved: 0,
    reExportsTotal: 0,
    reExportsResolvedInternal: 0,
    dynamicImportsTotal: 0,
    dynamicImportsResolvedInternal: 0,
    unresolvedDetails: [],
  },
};

interface CanvasShellProps {
  primaryAnalysis: ParserResult;
  orgAnalyses?: AnalysisSummary[];
  initialAnalysisId?: string;
}

export function CanvasShell({
  primaryAnalysis,
  orgAnalyses,
  initialAnalysisId = '4',
}: CanvasShellProps) {
  const router = useRouter();
  // Selected analysis among the organization catalog
  const [activeAnalysisId, setActiveAnalysisId] = useState<string>(initialAnalysisId);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isCoverageOpen, setIsCoverageOpen] = useState(false);

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

  // Default analyses catalog for the organization if not passed from server
  const analysesList: AnalysisSummary[] = useMemo(() => {
    if (orgAnalyses !== undefined) return orgAnalyses;
    return [
      {
        id: '1',
        repository: 'tailwindlabs/tailwindcss',
        branch: 'main',
        state: 'queued',
        commit: null,
      },
      {
        id: '2',
        repository: 'vercel/next.js',
        branch: 'canary',
        state: 'parsing',
        commit: 'a93be01',
      },
      {
        id: '3',
        repository: 'shadcn-ui/ui',
        branch: 'main',
        state: 'failed',
        commit: null,
      },
      {
        id: '4',
        repository: 'shadcn-ui/ui',
        branch: 'main',
        state: 'complete',
        commit: '0c7d9e2',
        result: primaryAnalysis,
      },
      {
        id: '5',
        repository: 'vercel/next.js',
        branch: 'canary',
        state: 'complete',
        commit: '4f1c2a9',
        result: primaryAnalysis,
      },
      {
        id: '6',
        repository: 'nestjs/nest',
        branch: 'master',
        state: 'complete',
        commit: 'e7b1a23',
        result: nestjsAnalysisResult,
      },
    ];
  }, [orgAnalyses, primaryAnalysis]);

  const currentAnalysis: AnalysisSummary =
    analysesList.find((a) => a.id === activeAnalysisId) ||
    analysesList.find((a) => a.id === initialAnalysisId) ||
    analysesList[0] || {
      id: initialAnalysisId || '1',
      repository: primaryAnalysis.repositoryRoot || 'Repository',
      branch: 'main',
      state: 'complete' as const,
      commit: null,
      result: primaryAnalysis,
    };

  const activeResult: ParserResult = currentAnalysis.result || primaryAnalysis;

  // Derive coverage ratio and partial status for Phase 7 coverage banner
  const coverage = activeResult.coverage;
  const coverageRatio =
    (coverage as { coverageRatio?: number })?.coverageRatio ??
    (coverage && coverage.filesFound > 0
      ? Number(((coverage.filesParsed / coverage.filesFound) * 100).toFixed(1))
      : 100);

  const isPartial = coverageRatio < 95 || (coverage?.filesSkipped && coverage.filesSkipped > 0);

  // Pure derivation of categories for left rail (reshaped per framework adapter)
  const categories = useMemo(() => {
    return categorizeFiles(activeResult.files, activeResult.adapter);
  }, [activeResult.files, activeResult.adapter]);

  // Pure computation of folded graph
  const foldedGraph = useMemo(() => {
    return computeFoldedGraph(
      activeResult.files,
      activeResult.edges,
      openNodeIds
    );
  }, [activeResult.files, activeResult.edges, openNodeIds]);

  // Selected file object lookup
  const selectedFile = useMemo(() => {
    if (!selectedId) return null;
    return activeResult.files.find((f) => f.path === selectedId) || null;
  }, [selectedId, activeResult.files]);

  // Pure derivation of transitive walk result (Phase 6)
  const walkResult: TransitiveWalkResult | null = useMemo(() => {
    if (!selectedFile || !activeWalkType) return null;
    const dir = activeWalkType === 'blast_radius' ? 'incoming' : 'outgoing';
    return computeTransitiveWalk(selectedFile.path, activeResult.edges, dir, 2);
  }, [selectedFile, activeWalkType, activeResult.edges]);

  // Pure derivation of highlighted paths for canvas (Phase 6)
  const highlightedPaths = useMemo(() => {
    if (!walkResult) return null;
    return new Set<string>(walkResult.all.map((w) => w.path));
  }, [walkResult]);

  // Handle toggling folder open/close
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

  // Handle selection (file or folder or deselect)
  const handleSelectId = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      setActiveWalkType(null);
      if (id) {
        // If selecting a file path, ensure containing folder is opened so row is visible
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

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#06070a] text-foreground font-jetbrains antialiased relative">
      {/* Top Center Floating Close Button (X) matching reference image */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3">
        {/* Analysis Switcher Pill for all 5 in the organization */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0c0d14]/90 border border-white/10 hover:border-white/25 text-xs font-mono text-white/80 backdrop-blur-md shadow-2xl transition-all"
            title="Switch analysis in organization"
          >
            {currentAnalysis.state === 'complete' && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            )}
            {currentAnalysis.state === 'parsing' && (
              <Loader2 className="w-2.5 h-2.5 text-cyan-400 animate-spin" />
            )}
            {currentAnalysis.state === 'queued' && (
              <Clock className="w-2.5 h-2.5 text-amber-400" />
            )}
            {currentAnalysis.state === 'failed' && (
              <AlertCircle className="w-2.5 h-2.5 text-rose-400" />
            )}

            <span className="font-semibold text-white">
              {currentAnalysis.repository}
            </span>
            {currentAnalysis.commit && (
              <span className="text-white/40 text-[10px]">
                ({currentAnalysis.commit})
              </span>
            )}
            <ChevronDown className="w-3 h-3 text-white/40" />
          </button>

          {/* Switcher Dropdown */}
          {isSwitcherOpen && (
            <div
              className="absolute top-full left-0 mt-2 w-72 bg-[#0c0d14] border border-white/15 rounded-xl shadow-2xl p-1.5 font-mono z-50 divide-y divide-white/[0.04]"
              onMouseLeave={() => setIsSwitcherOpen(false)}
            >
              <div className="px-2.5 py-1 text-[10px] text-white/40 uppercase tracking-wider">
                Organization Analyses ({analysesList.length})
              </div>
              <div className="py-1 space-y-0.5">
                {analysesList.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setIsSwitcherOpen(false);
                      if (item.id !== activeAnalysisId) {
                        setActiveAnalysisId(item.id);
                        router.push(`/preview?id=${item.id}`);
                      }
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs transition-colors ${
                      item.id === activeAnalysisId
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    <span className="truncate">{item.repository}</span>
                    <span className="text-[10px] text-white/40 uppercase">
                      {item.state}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Circular Close Button (X) */}
        <Link
          href="/workspace"
          className="w-8 h-8 rounded-full bg-[#181a24] hover:bg-[#252838] border border-white/15 hover:border-white/30 text-white/80 hover:text-white flex items-center justify-center shadow-2xl transition-all"
          title="Close map and return to workspace"
        >
          <X className="w-4 h-4" />
        </Link>
      </div>

      {/* Main Three-Column Settled Layout */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Column 1: Left Rail (Categories, Counts & Phase 6 Filtering) */}
        <LeftRail
          categories={categories}
          totalFiles={activeResult.files.length}
          activeCategory={activeCategory}
          onSelectCategory={setActiveCategory}
        />

        {/* Column 2: Middle Canvas Graph */}
        {currentAnalysis.state === 'complete' ? (
          <div className="relative flex-1 min-w-0 h-full overflow-hidden flex flex-col">
            {/* Coverage Banner (Phase 7 Invariant: single line when collapsed, never hidden) */}
            <div className="absolute top-4 right-4 z-20 font-mono">
              <div
                className={`rounded-xl border backdrop-blur-md shadow-2xl transition-all ${
                  isPartial
                    ? "bg-[#18120d]/90 border-amber-500/30 text-amber-200"
                    : "bg-[#0c0d14]/85 border-white/10 text-white/70"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setIsCoverageOpen(!isCoverageOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs hover:text-white transition-colors cursor-pointer"
                  title="Toggle coverage audit report"
                >
                  {isPartial ? (
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  )}
                  <span className="font-semibold">
                    Coverage: {coverageRatio}%
                  </span>
                  {coverage?.filesSkipped && coverage.filesSkipped > 0 && (
                    <span className="text-[10px] text-white/50">
                      · {coverage.filesSkipped} skipped
                    </span>
                  )}
                  {isCoverageOpen ? (
                    <ChevronUp className="w-3 h-3 text-white/40" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-white/40" />
                  )}
                </button>

                {isCoverageOpen && (
                  <div className="px-3 pb-3 pt-1 text-[11px] border-t border-white/10 space-y-1.5 max-w-xs">
                    <div className="flex justify-between text-white/60">
                      <span>Source files parsed:</span>
                      <span className="text-white font-semibold">
                        {coverage?.filesParsed ?? activeResult.files.length}
                      </span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>Total files found:</span>
                      <span>{coverage?.filesFound ?? activeResult.files.length}</span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>Imports resolved:</span>
                      <span>
                        {coverage?.importsResolvedInternal ?? activeResult.edges.length} /{" "}
                        {coverage?.importsTotal ?? activeResult.edges.length}
                      </span>
                    </div>
                    {coverage?.skipReasons && Object.keys(coverage.skipReasons).length > 0 && (
                      <div className="pt-1 border-t border-white/5">
                        <p className="text-[10px] text-white/40 uppercase mb-1">
                          Skip Breakdown:
                        </p>
                        <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                          {Object.entries(coverage.skipReasons).map(([reason, count]) => (
                            <div key={reason} className="flex justify-between text-[10px] text-white/50">
                              <span className="truncate max-w-[180px]">{reason}</span>
                              <span>{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {activeResult.files.length === 0 ? (
              <main className="flex-1 min-w-0 h-full flex flex-col items-center justify-center font-mono bg-[#06070a] text-center p-6 select-none relative">
                <div className="max-w-md p-8 rounded-2xl bg-[#0c0d14] border border-white/10 shadow-2xl">
                  <FileQuestion className="w-10 h-10 text-white/40 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-white mb-1">
                    No Source Modules Found
                  </h3>
                  <p className="text-xs text-white/50 leading-relaxed mb-4">
                    {currentAnalysis.repository} does not contain any TypeScript or JavaScript source files (.ts, .tsx, .js, .jsx, .mjs, .cjs).
                    {coverage?.filesSkipped
                      ? ` All ${coverage.filesSkipped} files were cataloged as non-source assets, styles, or markup.`
                      : ''}
                  </p>
                  <div className="text-[11px] font-mono text-white/40 bg-white/[0.02] p-2.5 rounded-lg border border-white/5 text-left mb-4">
                    Found: {coverage?.filesFound ?? 0} files | Parsed: 0 | Skipped: {coverage?.filesSkipped ?? 0}
                  </div>
                  <Link
                    href="/workspace"
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/10 text-xs font-mono text-white/80 transition-colors"
                  >
                    Return to Workspace
                  </Link>
                </div>
              </main>
            ) : (
              <CanvasArea
                nodes={foldedGraph.nodes}
                foldedEdges={foldedGraph.edges}
                selectedId={selectedId}
                hoveredId={hoveredId}
                activeCategory={activeCategory}
                categories={categories}
                highlightedPaths={highlightedPaths}
                onSelectId={handleSelectId}
                onHoverId={setHoveredId}
                onToggleNodeOpen={handleToggleNodeOpen}
              />
            )}
          </div>
        ) : (
          <main className="flex-1 min-w-0 h-full flex flex-col items-center justify-center font-mono bg-[#06070a] text-center p-6 select-none">
            <div className="max-w-md p-6 rounded-2xl bg-[#0c0d14] border border-white/10 shadow-2xl">
              {currentAnalysis.state === 'queued' && (
                <div className="flex flex-col items-center">
                  <Clock className="w-8 h-8 text-amber-400 mb-3" />
                  <h3 className="text-sm font-semibold text-white mb-1">
                    Analysis Queued
                  </h3>
                  <p className="text-xs text-white/40">
                    {currentAnalysis.repository} is waiting in the analysis pipeline queue.
                  </p>
                </div>
              )}
              {currentAnalysis.state === 'parsing' && (
                <div className="flex flex-col items-center">
                  <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
                  <h3 className="text-sm font-semibold text-white mb-1">
                    Parsing AST
                  </h3>
                  <p className="text-xs text-white/40">
                    AST walker is discovering files and resolving import specifiers...
                  </p>
                </div>
              )}
              {currentAnalysis.state === 'failed' && (
                <div className="flex flex-col items-center">
                  <AlertCircle className="w-8 h-8 text-rose-400 mb-3" />
                  <h3 className="text-sm font-semibold text-white mb-1">
                    Analysis Failed
                  </h3>
                  <p className="text-xs text-rose-300/80">
                    Repository archive download timed out.
                  </p>
                </div>
              )}
            </div>
          </main>
        )}

        {/* Column 3: Fixed Right Detail Pane */}
        <DetailPane
          repositoryName={currentAnalysis.repository}
          adapter={activeResult.adapter}
          files={activeResult.files}
          edges={activeResult.edges}
          nodes={foldedGraph.nodes}
          routes={activeResult.routes || []}
          selectedId={selectedId}
          hoveredId={hoveredId}
          activeTab={activeTab}
          activeWalkType={activeWalkType}
          walkResult={walkResult}
          onTabChange={setActiveTab}
          onSelect={handleSelectId}
          onHover={setHoveredId}
          onWalkTypeChange={setActiveWalkType}
        />
      </div>
    </div>
  );
}
