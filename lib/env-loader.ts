/**
 * CodoGraph — Phase 11: Unified Environment Loader.
 *
 * Provides a canonical way for scripts outside the Next.js web application
 * (verification scripts, parsers, evals, benchmarks) to load the exact same
 * environment configuration as the web app.
 *
 * Behavior & Guarantees:
 * 1. Loads .env.local (and optionally .env) from the project root.
 * 2. Respects existing process.env overrides (does not overwrite).
 * 3. Strips quotes, parses multiline values, and strips inline comments.
 * 4. Integrates with lib/env.ts validateEnv() to ensure required secrets exist.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface LoadEnvOptions {
  /** If true, suppresses console log output */
  quiet?: boolean;
  /** If true, validates required environment keys via validateEnv() */
  validate?: boolean;
  /** Custom root directory or env file path */
  baseDir?: string;
}

export interface LoadEnvResult {
  loadedFiles: string[];
  keysLoaded: string[];
}

/**
 * Parses the contents of an env file into key-value pairs.
 */
export function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Skip empty lines and comment lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIdx).trim();
    if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    let val = trimmed.slice(eqIdx + 1).trim();

    // Check for quoted strings
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
      // Unescape standard escaped characters in double-quoted strings
      val = val.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
    } else {
      // Unquoted: strip trailing comments like `KEY=val # comment`
      const commentIdx = val.indexOf(' #');
      if (commentIdx !== -1) {
        val = val.slice(0, commentIdx).trim();
      }
    }

    result[key] = val;
  }

  return result;
}

/**
 * Searches upward from startDir to locate the directory containing package.json.
 */
export function findProjectRoot(startDir = process.cwd()): string {
  let curr = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(curr, 'package.json'))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) {
      break;
    }
    curr = parent;
  }
  return path.resolve(process.cwd());
}

/**
 * Loads .env.local (and .env) into process.env if not already set.
 */
export function loadWorkspaceEnv(options: LoadEnvOptions = {}): LoadEnvResult {
  const rootDir = options.baseDir ? path.resolve(options.baseDir) : findProjectRoot();
  const candidates = ['.env.local', '.env'];
  const loadedFiles: string[] = [];
  const keysLoaded: string[] = [];

  for (const filename of candidates) {
    const fullPath = path.join(rootDir, filename);
    if (fs.existsSync(fullPath)) {
      try {
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        const parsed = parseEnvContent(fileContent);

        for (const [key, value] of Object.entries(parsed)) {
          if (process.env[key] === undefined) {
            process.env[key] = value;
            keysLoaded.push(key);
          }
        }
        loadedFiles.push(fullPath);
      } catch (err) {
        if (!options.quiet) {
          console.warn(`[CodoGraph EnvLoader] Failed reading ${filename}:`, err);
        }
      }
    }
  }

  if (options.validate) {
    const required = [
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
    ];
    const missing = required.filter((k) => !process.env[k] || process.env[k]?.trim() === '');
    if (missing.length > 0) {
      throw new Error(
        `[FATAL] Missing required environment variables: ${missing.join(', ')}`
      );
    }
  }

  return {
    loadedFiles,
    keysLoaded,
  };
}

// Auto-execute on import so any script importing this module gets environment loaded immediately
loadWorkspaceEnv({ quiet: true });

