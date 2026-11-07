/**
 * CodoGraph — Phase 3: Repository File Walker.
 *
 * Traverses a repository directory, discovers source modules, computes line counts,
 * hashes contents, extracts folder hierarchy, and categorizes skipped files with
 * explicit reasons.
 *
 * Invariant: Every single file found is either parsed or recorded as skipped with
 * a named reason. The math must add up: filesFound = filesParsed + filesSkipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { DiscoveredFile, SkippedFile } from './types.ts';

// Supported TypeScript and JavaScript source code extensions
const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

// Ignored directory names that are not part of user source code
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.turbo',
  '.cache',
  '.vscode',
  '.idea',
  'tmp',
]);

export interface WalkerResult {
  sourceFiles: DiscoveredFile[];
  skippedFiles: SkippedFile[];
  totalFound: number;
}

/**
 * Normalizes Windows backslashes to standard POSIX forward slashes.
 */
export function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

/**
 * Computes SHA-256 hex digest of file buffer.
 */
export function hashContent(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Counts lines in a buffer by counting newline characters.
 */
export function countLines(content: string): number {
  if (content.length === 0) return 0;
  let lines = 1;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) {
      lines++;
    }
  }
  return lines;
}

/**
 * Classifies a non-source file into a descriptive skip reason.
 */
function getSkipReasonForFile(relPath: string, ext: string): string {
  const base = path.basename(relPath).toLowerCase();

  if (base === 'package-lock.json' || base === 'pnpm-lock.yaml' || base === 'yarn.lock' || base === 'bun.lockb') {
    return 'Package manager lockfile';
  }
  if (base.startsWith('.env')) {
    return 'Environment configuration file';
  }
  if (base === '.gitignore' || base === '.npmrc' || base === '.eslintrc' || base.startsWith('eslint.config')) {
    return 'Project linter/runtime configuration';
  }
  if (ext === '.json') {
    return 'Structured data / JSON configuration';
  }
  if (ext === '.md' || ext === '.mdx' || ext === '.txt' || ext === '.rst') {
    return 'Documentation / text file';
  }
  if (ext === '.css' || ext === '.scss' || ext === '.sass' || ext === '.less') {
    return 'Stylesheet';
  }
  if (ext === '.html' || ext === '.svg' || ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp' || ext === '.gif' || ext === '.ico') {
    return 'Static markup / media asset';
  }
  if (ext === '.mp4' || ext === '.webm' || ext === '.ogg' || ext === '.mov') {
    return 'Video / media streaming asset';
  }
  if (ext === '.woff' || ext === '.woff2' || ext === '.ttf' || ext === '.eot' || ext === '.otf') {
    return 'Typography / font binary';
  }
  if (ext === '.tsbuildinfo') {
    return 'TypeScript incremental build cache';
  }
  if (ext === '.sql') {
    return 'Database SQL migration/seed script';
  }

  return `Non-source file extension (${ext || 'no extension'})`;
}

/**
 * Walks a directory tree recursively and catalogs all files.
 *
 * @param rootPath Absolute or relative path to the repository directory.
 */
export function walkRepository(rootPath: string): WalkerResult {
  const absRoot = path.resolve(rootPath);
  if (!fs.existsSync(absRoot)) {
    throw new Error(`[CodoGraph Parser] Directory does not exist: ${absRoot}`);
  }

  const sourceFiles: DiscoveredFile[] = [];
  const skippedFiles: SkippedFile[] = [];

  function walkDir(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = normalizePath(path.relative(absRoot, fullPath));

      if (entry.isDirectory()) {
        const dirName = entry.name;
        if (IGNORED_DIRECTORIES.has(dirName)) {
          // Explicitly count all files inside the ignored directory as skipped to maintain strict math
          walkIgnoredDir(fullPath, `Ignored directory (${dirName})`);
          continue;
        }

        walkDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();

        // Check if this file is a TypeScript/JavaScript source module
        if (SOURCE_EXTENSIONS.has(ext)) {
          try {
            const buffer = fs.readFileSync(fullPath);
            const content = buffer.toString('utf8');
            const lines = countLines(content);
            const sizeBytes = buffer.length;
            const contentHash = hashContent(buffer);
            const folder = normalizePath(path.dirname(relPath));

            sourceFiles.push({
              path: relPath,
              folder,
              extension: ext,
              lines,
              sizeBytes,
              contentHash,
              isSourceCode: true,
            });
          } catch (err) {
            skippedFiles.push({
              path: relPath,
              reason: `Unreadable file: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        } else {
          // Non-source file: record exact skip reason
          skippedFiles.push({
            path: relPath,
            reason: getSkipReasonForFile(relPath, ext),
          });
        }
      }
    }
  }

  function walkIgnoredDir(dirPath: string, reason: string) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relPath = normalizePath(path.relative(absRoot, fullPath));
        if (entry.isDirectory()) {
          walkIgnoredDir(fullPath, reason);
        } else if (entry.isFile()) {
          skippedFiles.push({
            path: relPath,
            reason,
          });
        }
      }
    } catch {}
  }

  walkDir(absRoot);

  return {
    sourceFiles,
    skippedFiles,
    totalFound: sourceFiles.length + skippedFiles.length,
  };
}
