/**
 * CodoGraph — Phase 3: TypeScript AST Parser Types & Contract.
 *
 * This contract defines the data structures produced by the parser.
 * Downstream consumers (Phase 4 map visualization, Phase 5 graph metrics,
 * and database sync) consume this exact typed shape.
 */

export const PARSER_VERSION = '1.0.0';

export type EdgeKind = 'import' | 're-export' | 'dynamic_import' | 'require';

export interface DiscoveredFile {
  /** Relative POSIX path from the repository root (e.g. "src/lib/utils.ts"). */
  path: string;
  /** Directory path containing the file, POSIX normalized (e.g. "src/lib" or "." for root). */
  folder: string;
  /** File extension including the leading dot (e.g. ".ts", ".tsx"). */
  extension: string;
  /** Total line count. */
  lines: number;
  /** Size in bytes. */
  sizeBytes: number;
  /** SHA-256 hexadecimal hash of file contents. */
  contentHash: string;
  /** True if this file is a TypeScript/JavaScript source code file. */
  isSourceCode: boolean;
}

export interface SkippedFile {
  /** Relative POSIX path of the skipped file. */
  path: string;
  /** Explicit reason for skipping. */
  reason: string;
}

export interface ParsedFile extends DiscoveredFile {
  /** Number of internal repository files that import this file. */
  fanIn: number;
  /** Number of internal repository files that this file imports. */
  fanOut: number;
  /** Framework or architectural role assigned by an adapter (null if none). */
  role: string | null;
  /** Exported symbol names read from CommonJS modules (`exports.*`, `module.exports`). */
  exports?: string[];
}

export interface ParsedEdge {
  /** Relative path of the importing / exporting source file. */
  sourcePath: string;
  /** Relative path of the resolved target file inside the repository. */
  targetPath: string;
  /** Syntax classification of the relationship. */
  kind: EdgeKind;
  /** Raw specifier string from the source code (e.g. "./utils", "@/components/ui/button"). */
  specifier: string;
}

export interface UnresolvedImport {
  /** Source file where the import statement was encountered. */
  sourcePath: string;
  /** The module specifier string. */
  specifier: string;
  /** Type of import statement. */
  kind: EdgeKind;
  /** Detailed reason explaining why resolution failed. */
  reason: string;
}

export interface ExternalImport {
  /** Source file where the external import was encountered. */
  sourcePath: string;
  /** The raw specifier string. */
  specifier: string;
  /** Type of import statement. */
  kind: EdgeKind;
  /** Resolved package name (e.g. "react", "lucide-react", "node:fs"). */
  packageName: string;
}

export interface CoverageReport {
  /** Total files encountered during repository walk. */
  filesFound: number;
  /** Total source code files parsed into graph nodes. */
  filesParsed: number;
  /** Total files skipped during walk. */
  filesSkipped: number;
  /** Tally of skip reasons. */
  skipReasons: Record<string, number>;
  /** Concrete list of all skipped files with their reasons. */
  skippedFiles: SkippedFile[];

  /** Total import statements discovered across all parsed files. */
  importsTotal: number;
  /** Imports successfully resolved to files inside the repository. */
  importsResolvedInternal: number;
  /** Imports resolving to external npm packages or Node builtins. */
  importsExternal: number;
  /** Imports deliberately excluded. */
  importsExcluded: number;
  /** Imports that could not be resolved. */
  importsUnresolved: number;

  /** Total re-export declarations (export ... from "..."). */
  reExportsTotal: number;
  /** Re-exports successfully resolved to files inside the repository. */
  reExportsResolvedInternal: number;

  /** Total dynamic import expressions (import("...")). */
  dynamicImportsTotal: number;
  /** Dynamic imports successfully resolved to files inside the repository. */
  dynamicImportsResolvedInternal: number;

  /** Total CommonJS require() expressions. */
  requiresTotal?: number;
  /** CommonJS require() calls successfully resolved to files inside the repository. */
  requiresResolvedInternal?: number;

  /** Concrete examples and details for all unresolved imports. */
  unresolvedDetails: UnresolvedImport[];
}

export interface ExtractedRoute {
  /** HTTP method in uppercase (e.g. "GET", "POST", "PUT", "DELETE"). */
  method: string;
  /** Full route path pattern (e.g. "/api/analyses", "/users/:id", "/"). */
  pattern: string;
  /** Relative POSIX path of the source file implementing the route. */
  filePath: string;
  /** 1-based line number where the route handler or export is declared. */
  line?: number;
  /** Framework that declared the route (e.g. adapter name). */
  framework?: string;
}

export interface ParserResult {
  /** Absolute path of the parsed repository root directory. */
  repositoryRoot: string;
  /** ISO timestamp when parsing completed. */
  timestamp: string;
  /** Name of the framework adapter applied ("none" for fallback). */
  adapter: string;
  /** List of all parsed file nodes with graph metrics. */
  files: ParsedFile[];
  /** Deduplicated list of internal dependency edges. */
  edges: ParsedEdge[];
  /** List of all distinct folder paths in the repository. */
  folders: string[];
  /** Comprehensive coverage audit report. */
  coverage: CoverageReport;
  /** Exact extracted routes discovered by framework adapters. */
  routes: ExtractedRoute[];
}
