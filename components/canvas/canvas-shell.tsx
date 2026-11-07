"use client";

/**
 * CodoGraph — Three-Column Canvas Shell (Phase 4).
 *
 * Implements the exact layout and behavior from the reference image and phase-04.md:
 * - Top-center circular close button (X) linking back to /workspace.
 * - Multi-analysis support for all 5 analyses in the organization.
 * - Three settled columns:
 *   1. Left Rail: Categories with swatches and file counts (.ts, .tsx, etc.).
 *   2. Middle Column: Interactive DAG canvas with folding and curved edges.
 *   3. Right Column: Fixed empty detail pane (not a modal or drawer).
 */
import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import type { ParserResult } from '@/lib/parser/types';
import { categorizeFiles } from '@/lib/canvas/taxonomy';
import { LeftRail } from './left-rail';
import { CanvasArea } from './canvas-area';
import { DetailPane } from './detail-pane';
import { X, ChevronDown, Clock, Loader2, AlertCircle } from 'lucide-react';

export interface AnalysisSummary {
  id: string;
  repository: string;
  branch: string;
  state: 'queued' | 'parsing' | 'complete' | 'failed';
  commit: string | null;
  result?: ParserResult;
}

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
  // Selected analysis among the 5 in the organization
  const [activeAnalysisId, setActiveAnalysisId] = useState<string>(initialAnalysisId);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

  // Default analyses catalog for the organization if not passed from server
  const analysesList: AnalysisSummary[] = useMemo(() => {
    if (orgAnalyses && orgAnalyses.length > 0) return orgAnalyses;
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
    ];
  }, [orgAnalyses, primaryAnalysis]);

  const currentAnalysis =
    analysesList.find((a) => a.id === activeAnalysisId) || analysesList[3];

  const activeResult: ParserResult = currentAnalysis.result || primaryAnalysis;

  // Pure derivation of categories for left rail
  const categories = useMemo(() => {
    return categorizeFiles(activeResult.files);
  }, [activeResult.files]);

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
                Organization Analyses (5)
              </div>
              <div className="py-1 space-y-0.5">
                {analysesList.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveAnalysisId(item.id);
                      setIsSwitcherOpen(false);
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
        {/* Column 1: Left Rail (Categories & Counts) */}
        <LeftRail
          categories={categories}
          totalFiles={activeResult.files.length}
        />

        {/* Column 2: Middle Canvas Graph */}
        {currentAnalysis.state === 'complete' ? (
          <CanvasArea
            files={activeResult.files}
            edges={activeResult.edges}
            repositoryName={currentAnalysis.repository}
          />
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
        <DetailPane />
      </div>
    </div>
  );
}
