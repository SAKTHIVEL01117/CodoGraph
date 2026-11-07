/**
 * CodoGraph — Phase 3: Module & Path Resolution Engine.
 *
 * Resolves module specifiers from TypeScript / JavaScript AST nodes against files
 * in the repository. Handles relative imports, extension probing, index/barrel files,
 * tsconfig path aliases, Node.js built-in modules, and external npm packages.
 *
 * Invariant: An unresolved import is never quietly dropped and never guessed at.
 * It is reported as unresolved with an explicit diagnostic reason.
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalizePath } from './walker.ts';
import type { EdgeKind } from './types.ts';

// Extensions probed in priority order when an import omits the extension
const RESOLVE_EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.d.ts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
];

// Barrel index files probed when an import references a directory
const INDEX_FILES = [
  'index.ts',
  'index.tsx',
  'index.d.ts',
  'index.js',
  'index.jsx',
  'index.mjs',
  'index.cjs',
];

// Standard Node.js built-in module names
const NODE_BUILTINS = new Set([
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'domain',
  'events',
  'fs',
  'fs/promises',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'path/posix',
  'path/win32',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'stream/promises',
  'stream/web',
  'string_decoder',
  'timers',
  'timers/promises',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'util/types',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
]);

export interface TsConfigPaths {
  baseUrl: string;
  paths: Record<string, string[]>;
}

export type ResolutionResult =
  | { type: 'internal'; targetPath: string }
  | { type: 'external'; packageName: string }
  | { type: 'excluded'; reason: string }
  | { type: 'unresolved'; reason: string };

/**
 * Loads compilerOptions.paths and baseUrl from tsconfig.json or jsconfig.json if present.
 */
export function loadTsConfigPaths(repositoryRoot: string): TsConfigPaths {
  const candidates = ['tsconfig.json', 'jsconfig.json'];

  for (const candidate of candidates) {
    const fullPath = path.join(repositoryRoot, candidate);
    if (fs.existsSync(fullPath)) {
      try {
        const raw = fs.readFileSync(fullPath, 'utf8');
        // Strip simple comments from json
        const clean = raw.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1');
        const parsed = JSON.parse(clean);
        const compilerOptions = parsed?.compilerOptions || {};
        return {
          baseUrl: compilerOptions.baseUrl || '.',
          paths: compilerOptions.paths || {},
        };
      } catch {}
    }
  }

  return { baseUrl: '.', paths: {} };
}

/**
 * Probes a candidate file path on disk and against the known file set.
 */
function probeCandidatePath(
  candidateAbsPath: string,
  repositoryRoot: string,
  knownFiles: Set<string>
): string | null {
  for (const ext of RESOLVE_EXTENSIONS) {
    const withExt = ext ? `${candidateAbsPath}${ext}` : candidateAbsPath;
    const rel = normalizePath(path.relative(repositoryRoot, withExt));

    if (knownFiles.has(rel)) {
      return rel;
    }
    if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
      return rel;
    }
  }

  // Check if candidate is a directory containing an index barrel file
  for (const indexFile of INDEX_FILES) {
    const withIndex = path.join(candidateAbsPath, indexFile);
    const rel = normalizePath(path.relative(repositoryRoot, withIndex));

    if (knownFiles.has(rel)) {
      return rel;
    }
    if (fs.existsSync(withIndex) && fs.statSync(withIndex).isFile()) {
      return rel;
    }
  }

  return null;
}

/**
 * Resolves a module specifier to an internal file, external package, or failure diagnostic.
 */
export function resolveModuleSpecifier(
  specifier: string,
  sourceRelPath: string,
  repositoryRoot: string,
  knownFiles: Set<string>,
  tsConfig: TsConfigPaths
): ResolutionResult {
  const trimmed = specifier.trim();

  // 1. Exclude style and asset imports from dependency graph nodes
  if (
    trimmed.endsWith('.css') ||
    trimmed.endsWith('.scss') ||
    trimmed.endsWith('.sass') ||
    trimmed.endsWith('.less') ||
    trimmed.endsWith('.png') ||
    trimmed.endsWith('.svg') ||
    trimmed.endsWith('.jpg') ||
    trimmed.endsWith('.webp') ||
    trimmed.endsWith('.ico')
  ) {
    return { type: 'excluded', reason: `Non-code asset import (${path.extname(trimmed)})` };
  }

  // 2. Node.js built-ins (e.g. "fs", "node:fs", "path", "crypto")
  if (trimmed.startsWith('node:')) {
    return { type: 'external', packageName: trimmed };
  }
  if (NODE_BUILTINS.has(trimmed)) {
    return { type: 'external', packageName: `node:${trimmed}` };
  }

  const sourceAbsDir = path.dirname(path.join(repositoryRoot, sourceRelPath));

  // 3. Relative Imports: "./foo", "../bar"
  if (trimmed.startsWith('./') || trimmed.startsWith('../')) {
    const candidateAbsPath = path.resolve(sourceAbsDir, trimmed);
    const resolvedRel = probeCandidatePath(candidateAbsPath, repositoryRoot, knownFiles);

    if (resolvedRel) {
      return { type: 'internal', targetPath: resolvedRel };
    }

    return {
      type: 'unresolved',
      reason: `Relative file does not exist on disk: '${trimmed}' (probed from '${sourceRelPath}')`,
    };
  }

  // 4. Path Aliases (e.g. "@/*", "@/components/*")
  if (tsConfig.paths && Object.keys(tsConfig.paths).length > 0) {
    for (const [pattern, targetList] of Object.entries(tsConfig.paths)) {
      const starIndex = pattern.indexOf('*');

      if (starIndex !== -1) {
        const prefix = pattern.slice(0, starIndex);
        const suffix = pattern.slice(starIndex + 1);

        if (trimmed.startsWith(prefix) && trimmed.endsWith(suffix)) {
          const matchedWildcard = trimmed.slice(prefix.length, trimmed.length - suffix.length);

          for (const targetPattern of targetList) {
            const mappedTarget = targetPattern.replace('*', matchedWildcard);
            const candidateAbsPath = path.resolve(repositoryRoot, tsConfig.baseUrl, mappedTarget);
            const resolvedRel = probeCandidatePath(candidateAbsPath, repositoryRoot, knownFiles);

            if (resolvedRel) {
              return { type: 'internal', targetPath: resolvedRel };
            }
          }

          return {
            type: 'unresolved',
            reason: `Path alias '${trimmed}' matched '${pattern}' but target does not exist on disk`,
          };
        }
      } else if (trimmed === pattern) {
        for (const target of targetList) {
          const candidateAbsPath = path.resolve(repositoryRoot, tsConfig.baseUrl, target);
          const resolvedRel = probeCandidatePath(candidateAbsPath, repositoryRoot, knownFiles);
          if (resolvedRel) {
            return { type: 'internal', targetPath: resolvedRel };
          }
        }
        return {
          type: 'unresolved',
          reason: `Exact path alias '${trimmed}' target does not exist on disk`,
        };
      }
    }
  }

  // 5. Bare specifiers: check if it's an internal file under baseUrl or an external npm package
  if (tsConfig.baseUrl && tsConfig.baseUrl !== '.') {
    const baseCandidate = path.resolve(repositoryRoot, tsConfig.baseUrl, trimmed);
    const resolvedRel = probeCandidatePath(baseCandidate, repositoryRoot, knownFiles);
    if (resolvedRel) {
      return { type: 'internal', targetPath: resolvedRel };
    }
  }

  // 6. External npm package dependencies (e.g. "react", "@clerk/nextjs", "ts-morph")
  const pkgParts = trimmed.split('/');
  const packageName = trimmed.startsWith('@') && pkgParts.length >= 2
    ? `${pkgParts[0]}/${pkgParts[1]}`
    : pkgParts[0];

  return { type: 'external', packageName };
}
