/**
 * CodoGraph — Framework Adapter Contract.
 *
 * Invariant: The core parsing code contains zero framework-specific checks
 * (no `if (framework === 'next')`). Framework semantics live in pluggable adapters.
 */
import type { DiscoveredFile } from '../types.ts';

export interface FrameworkAdapter {
  /** Name of the framework adapter (e.g. 'none', 'nextjs'). */
  name: string;

  /**
   * Inspects the repository files and directory layout to decide whether
   * this adapter should activate.
   */
  detect(repositoryRoot: string, files: DiscoveredFile[]): boolean;

  /**
   * Optionally assigns an architectural role to a file (e.g. 'page', 'layout', 'route_handler', 'middleware').
   * Returns null if unclassified.
   */
  classifyFile?(file: DiscoveredFile): string | null;
}
