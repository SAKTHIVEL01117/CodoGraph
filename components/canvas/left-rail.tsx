"use client";

/**
 * CodoGraph — Canvas Left Rail (Phase 4).
 *
 * Implements the exact reference layout:
 * - Header: "Categories · N files"
 * - Monospace list of extensions with colored swatches and counts
 * - Deep dark background seamlessly integrating with the canvas
 *
 * Invariant: "Nothing happens when you click one yet."
 */
import React from 'react';
import type { FileCategory } from '@/lib/canvas/taxonomy';

interface LeftRailProps {
  categories: FileCategory[];
  totalFiles: number;
}

export function LeftRail({ categories, totalFiles }: LeftRailProps) {
  return (
    <aside
      className="w-56 shrink-0 h-full bg-[#0a0a0c]/90 border-r border-white/5 flex flex-col select-none z-10 font-mono"
      aria-label="Repository Categories"
    >
      {/* Rail Header matching reference */}
      <div className="pt-4 pb-3 px-4 flex items-center justify-between text-[11px] text-white/50 border-b border-white/[0.04]">
        <span>Categories</span>
        <span className="text-white/30">·</span>
        <span className="text-white/40">{totalFiles} files</span>
      </div>

      {/* Category Rows matching reference */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center justify-between py-1 px-1.5 rounded text-xs text-white/80 cursor-default hover:bg-white/[0.03] transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                style={{ backgroundColor: cat.color }}
                aria-hidden="true"
              />
              <span className="text-white/90 text-xs font-mono">
                {cat.name}
              </span>
            </div>

            <span className="text-xs text-white/45 tabular-nums font-mono">
              {cat.count}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}
