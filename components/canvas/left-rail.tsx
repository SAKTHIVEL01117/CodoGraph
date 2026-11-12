"use client";

/**
 * CodoGraph — Canvas Left Rail (Phase 4, 6 & 8).
 *
 * Implements framework-reshaped fixed-order category filtering:
 * - Displays `Categories · <N> files` header matching the dense tool shell.
 * - Fixed reading order with zero-count framework slots subtly muted.
 * - Colour swatch + category name + right-aligned tabular file count.
 * - Clicking a category dims everything on canvas that isn't in it.
 * - Clicking the active category again deselects it (returns to full visibility).
 */
import React from 'react';
import type { FileCategory } from '@/lib/canvas/taxonomy';
import { X } from 'lucide-react';

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
      className="w-56 shrink-0 h-full bg-card border-r border-border flex flex-col select-none z-10 font-mono text-foreground"
      aria-label="Repository Categories"
    >
      {/* Rail Header with total file count or clear action */}
      <div className="h-10 px-3.5 flex items-center justify-between text-[11px] text-muted-foreground border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <span className={activeCategory ? 'text-foreground font-medium' : ''}>
            Categories
          </span>
          <span className="opacity-50">·</span>
          <span className="tabular-nums">{totalFiles} files</span>
        </div>

        {activeCategory && (
          <button
            type="button"
            onClick={() => onSelectCategory(null)}
            className="flex items-center gap-0.5 text-[10px] text-primary hover:opacity-80 px-1.5 py-0.5 rounded bg-primary/10 border border-primary/25 transition-colors cursor-pointer shrink-0 ml-1"
            title="Clear category filter"
          >
            <span>clear</span>
            <X className="w-2.5 h-2.5" />
          </button>
        )}
      </div>

      {/* Category Rows */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {categories.map((cat) => {
          const isActive = activeCategory === cat.name;
          const isEmpty = cat.count === 0;

          return (
            <button
              key={cat.id}
              type="button"
              disabled={isEmpty}
              onClick={() => {
                if (isEmpty) return;
                onSelectCategory(isActive ? null : cat.name);
              }}
              className={`w-full flex items-center justify-between py-1.5 px-3.5 text-xs transition-colors text-left border-l-2 ${
                isActive
                  ? 'bg-primary/15 border-l-primary text-foreground font-medium cursor-pointer'
                  : isEmpty
                    ? 'border-l-transparent text-muted-foreground/45 cursor-default'
                    : 'border-l-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground cursor-pointer'
              }`}
              title={
                isEmpty
                  ? `${cat.name}: 0 files`
                  : `Click to dim everything except ${cat.name}`
              }
            >
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <span
                  className={`w-2 h-2 rounded-[2px] shrink-0 transition-opacity ${
                    isActive ? 'opacity-100' : isEmpty ? 'opacity-25' : 'opacity-80'
                  }`}
                  style={{ backgroundColor: cat.color }}
                  aria-hidden="true"
                />
                <span className="text-xs font-sans truncate">{cat.name}</span>
              </div>

              <span
                className={`text-xs tabular-nums font-mono shrink-0 ${
                  isActive
                    ? 'text-foreground font-semibold'
                    : isEmpty
                      ? 'text-muted-foreground/45'
                      : 'text-muted-foreground'
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
