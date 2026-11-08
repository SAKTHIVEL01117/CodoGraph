/**
 * CodoGraph — Framework Adapter Contract.
 *
 * Invariant: The core parsing code contains zero framework-specific checks
 * (no `if (framework === 'next')`). Framework semantics live in pluggable adapters.
 */
import type { DiscoveredFile, ExtractedRoute } from '../types.ts';
import type { Project } from 'ts-morph';

export interface ClassifyContext {
  repositoryRoot: string;
  readFile?: (filePath: string) => string;
}

export interface FrameworkAdapter {
  /** Name of the framework adapter (e.g. 'none', 'nextjs', 'nestjs', 'react'). */
  name: string;

  /**
   * Inspects the repository files and directory layout to decide whether
   * this adapter should activate.
   */
  detect(repositoryRoot: string, files: DiscoveredFile[]): boolean;

  /**
   * Optionally assigns an architectural role to a file.
   * Returns null if unclassified.
   */
  classifyFile?(file: DiscoveredFile, context?: ClassifyContext): string | null;

  /**
   * Extracts exact HTTP routes from the repository files.
   * Constraint: Routes are exact or absent. Emit a route only when the method
   * and the full pattern are both recoverable from the parsed syntax with no inference.
   */
  extractRoutes?(
    repositoryRoot: string,
    files: DiscoveredFile[],
    project?: Project
  ): ExtractedRoute[];
}
