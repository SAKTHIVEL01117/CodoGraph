/**
 * CodoGraph — Fallback Framework Adapter (Phase 3).
 *
 * Implements the baseline adapter that assumes no framework conventions at all.
 * Always activates if no specialized adapter claims the repository.
 */
import type { FrameworkAdapter } from './types.ts';
import type { DiscoveredFile } from '../types.ts';

export const fallbackAdapter: FrameworkAdapter = {
  name: 'none',

  detect(_root: string, _files: DiscoveredFile[]): boolean {
    // Universal baseline fallback
    return true;
  },

  classifyFile(_file: DiscoveredFile): string | null {
    // Fallback makes zero framework assumptions
    return null;
  },

  extractRoutes(): [] {
    // Generic repositories have no framework-derived routes
    return [];
  },
};
