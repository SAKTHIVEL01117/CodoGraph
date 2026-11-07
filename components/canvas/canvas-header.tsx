"use client";

/**
 * CodoGraph — Canvas Shell Header (Phase 4).
 *
 * Dense developer tool top bar displaying repository identity,
 * coverage indicators, and workspace navigation.
 */
import React from 'react';
import Link from 'next/link';
import { ArrowLeft, GitBranch, Terminal } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

interface CanvasHeaderProps {
  repositoryName: string;
  branch: string;
  filesCount: number;
  edgesCount: number;
}

export function CanvasHeader({
  repositoryName,
  branch,
  filesCount,
  edgesCount,
}: CanvasHeaderProps) {
  return (
    <header className="h-11 shrink-0 border-b border-white/10 px-4 flex items-center justify-between bg-[#0c0d14] text-white select-none">
      {/* Left: Navigation & Repository Context */}
      <div className="flex items-center gap-3">
        <Link
          href="/workspace"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>workspace</span>
        </Link>

        <span className="text-white/20">/</span>

        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-[#F64302]" />
          <span className="text-xs font-mono font-semibold tracking-tight text-white">
            {repositoryName}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-white/40 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/5">
            <GitBranch className="w-2.5 h-2.5 text-white/30" />
            {branch}
          </span>
        </div>
      </div>

      {/* Middle: Graph Overview Metrics */}
      <div className="hidden md:flex items-center gap-3 text-[11px] font-mono text-white/40">
        <span>
          <strong className="text-white/80 font-medium">{filesCount}</strong> files
        </span>
        <span className="text-white/15">·</span>
        <span>
          <strong className="text-white/80 font-medium">{edgesCount}</strong> edges
        </span>
        <span className="text-white/15">·</span>
        <span className="text-[10px] uppercase tracking-wider text-[#F64302]/90 bg-[#F64302]/10 border border-[#F64302]/20 px-1.5 py-0.5 rounded">
          Preview
        </span>
      </div>

      {/* Right: Theme Toggle */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}

