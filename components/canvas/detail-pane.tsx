"use client";

/**
 * CodoGraph — Canvas Detail Pane (Phase 4).
 *
 * Invariant from docs/specs/phase-04.md:
 * "The right pane exists as an empty column in this phase.
 * It is not a modal, a drawer, or an overlay, and it does not get rebuilt
 * or relocated later."
 */
import React from 'react';

export function DetailPane() {
  return (
    <aside
      className="w-72 shrink-0 h-full bg-[#0a0a0c]/90 border-l border-white/5 flex flex-col select-none z-10 font-mono"
      aria-label="File Detail Pane"
    >
      {/* Empty column resting state for Phase 4 */}
    </aside>
  );
}
