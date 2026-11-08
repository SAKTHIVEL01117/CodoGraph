"use client";

/**
 * CodoGraph — Canvas Left Rail (Phase 6).
 *
 * Implements category filtering from docs/specs/phase-06.md:
 * - Clicking a category dims everything on canvas that isn't in it, rather than removing it.
 * - Clicking the active category again deselects it (returns to full visibility).
 * - Monospace list of extensions with colored swatches and counts.
 */
import React from 'react';
import type { FileCategory } from '@/lib/canvas/taxonomy';
import { Filter, X } from 'lucide-react';

export interface LeftRailProps {
  categories: FileCategory[];
  totalFiles: number;
  activeCategory: string | null;
  onSelectCategory: (category: string | null) => void;
}

export function LeftRail({
  categories,
  totalFiles,
  activeCategory,
  onSelectCategory,
}: LeftRailProps) {
  return (
    <aside
      className="w-56 shrink-0 h-full bg-[#0a0a0c]/90 border-r border-white/5 flex flex-col select-none z-10 font-mono"
      aria-label="Repository Categories"
    >
      {/* Rail Header with active filter clear button */}
      <div className="pt-4 pb-3 px-4 flex items-center justify-between text-[11px] text-white/50 border-b border-white/[0.04]">
        <div className="flex items-center gap-1.5">
          {activeCategory && <Filter className="w-3 h-3 text-[#38bdf8]" />}
          <span className={activeCategory ? 'text-white font-semibold' : ''}>
            Categories
          </span>
        </div>

        {activeCategory ? (
          <button
            type="button"
            onClick={() => onSelectCategory(null)}
            className="flex items-center gap-1 text-[10px] text-[#38bdf8] hover:text-white px-1.5 py-0.5 rounded bg-[#38bdf8]/10 border border-[#38bdf8]/20 transition-colors"
            title="Clear category filter"
          >
            <span>clear</span>
            <X className="w-2.5 h-2.5" />
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-white/30">·</span>
            <span className="text-white/40">{totalFiles} files</span>
          </div>
        )}
      </div>

      {/* Category Rows: Clickable filter buttons */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {categories.map((cat) => {
          const isActive = activeCategory === cat.name;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() =>
                onSelectCategory(isActive ? null : cat.name)
              }
              className={`w-full flex items-center justify-between py-1.5 px-2 rounded text-xs transition-all text-left ${
                isActive
                  ? 'bg-white/10 ring-1 ring-[#38bdf8]/50 text-white font-medium shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                  : 'text-white/70 hover:bg-white/[0.04] hover:text-white'
              }`}
              title={`Click to dim everything except ${cat.name}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-[2px] shrink-0 transition-transform ${
                    isActive ? 'scale-125 ring-1 ring-white' : ''
                  }`}
                  style={{ backgroundColor: cat.color }}
                  aria-hidden="true"
                />
                <span className="text-xs font-mono truncate">
                  {cat.name}
                </span>
              </div>

              <span
                className={`text-xs tabular-nums font-mono ${
                  isActive ? 'text-[#38bdf8] font-bold' : 'text-white/45'
                }`}
              >
                {cat.count}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
