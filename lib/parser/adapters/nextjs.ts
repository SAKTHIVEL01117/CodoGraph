/**
 * CodoGraph — Next.js Framework Adapter.
 *
 * Implements Phase 8 Next.js support:
 * 1. Detection via package.json dependencies ("next") or next.config.* files.
 * 2. Role classification from directory and naming conventions:
 *    - Page routes: app/**\/page.(tsx|jsx|js|ts) and pages/**\/*
 *    - API endpoints: app/**\/route.(ts|js) and pages/api/**\/*
 *    - Server actions: files marked with "use server" directive or *.action(s).ts
 * 3. Exact route extraction:
 *    - Page routes: HTTP GET with normalized URL path (excluding route groups like (auth)).
 *    - API route handlers: exact exported HTTP methods (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS).
 *    - Invariant: Exact or absent. If method or pattern cannot be parsed with zero inference, emit nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Project } from 'ts-morph';
import type { FrameworkAdapter, ClassifyContext } from './types.ts';
import type { DiscoveredFile, ExtractedRoute } from '../types.ts';

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

/**
 * Normalizes an App Router file path to an exact route URL pattern.
 * Omits Next.js route groups like "(auth)" and parallel route slots like "@modal".
 */
export function deriveAppRouterPattern(appRelativePath: string): string {
  // Strip trailing file name (e.g. /page.tsx or /route.ts)
  const dirPath = appRelativePath.replace(/\/?(?:page|route)\.[a-zA-Z0-9]+$/, '');

  if (!dirPath || dirPath === '.' || dirPath === '/') {
    return '/';
  }

  const segments = dirPath
    .split('/')
    .filter(Boolean)
    // Filter out route groups like (auth), (dashboard)
    .filter((segment) => !/^\(.*\)$/.test(segment))
    // Filter out parallel routes like @modal
    .filter((segment) => !segment.startsWith('@'))
    // Filter out intercepting route markers like (.)photo
    .map((segment) => segment.replace(/^\(\.{1,3}\)/, ''))
    .filter(Boolean);

  if (segments.length === 0) {
    return '/';
  }

  return '/' + segments.join('/');
}

/**
 * Normalizes a Pages Router file path to an exact route URL pattern.
 */
export function derivePagesRouterPattern(pagesRelativePath: string): string {
  let clean = pagesRelativePath.replace(/\.[a-zA-Z0-9]+$/, '');
  // Normalize index
  clean = clean.replace(/(?:^|\/)index$/, '');
  if (!clean || clean === '/') {
    return '/';
  }
  return clean.startsWith('/') ? clean : '/' + clean;
}

export const nextjsAdapter: FrameworkAdapter = {
  name: 'nextjs',

  detect(repositoryRoot: string, files: DiscoveredFile[]): boolean {
    // 1. Check root package.json
    const pkgPath = path.join(repositoryRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.dependencies?.next || pkg.devDependencies?.next) {
          return true;
        }
      } catch {
        // Continue if malformed JSON
      }
    }

    // 2. Check for next.config.* file
    for (const file of files) {
      const base = path.basename(file.path);
      if (/^next\.config\.(js|mjs|ts|cjs)$/.test(base)) {
        return true;
      }
    }

    return false;
  },

  classifyFile(file: DiscoveredFile, context?: ClassifyContext): string | null {
    const norm = file.path.replace(/\\/g, '/');

    // 1. App Router Page routes
    if (/(?:^|\/)(?:src\/)?app\/(?:.*\/)?page\.(tsx|jsx|js|ts)$/.test(norm)) {
      return 'Page routes';
    }

    // 2. App Router API endpoints
    if (/(?:^|\/)(?:src\/)?app\/(?:.*\/)?route\.(ts|js)$/.test(norm)) {
      return 'API endpoints';
    }

    // 3. Pages Router API endpoints
    if (/(?:^|\/)(?:src\/)?pages\/api\/.+\.(ts|js|tsx|jsx)$/.test(norm)) {
      return 'API endpoints';
    }

    // 4. Pages Router Page routes (excluding special _ files, 404, 500)
    if (/(?:^|\/)(?:src\/)?pages\/(?!api\/).+\.(tsx|jsx|js|ts)$/.test(norm)) {
      const base = path.basename(norm);
      if (!base.startsWith('_') && base !== '404.tsx' && base !== '500.tsx') {
        return 'Page routes';
      }
    }

    // 5. Server actions: convention or "use server" directive
    if (
      /(?:^|\/)(?:.+\.)?actions?\.(ts|js)$/.test(norm) ||
      /(?:^|\/)actions\/.+\.(ts|js)$/.test(norm)
    ) {
      return 'Server actions';
    }

    // Inspect file header for "use server" directive if repositoryRoot is available
    if (context?.repositoryRoot) {
      try {
        const full = path.join(context.repositoryRoot, file.path);
        if (fs.existsSync(full)) {
          const header = fs.readFileSync(full, 'utf8').slice(0, 500);
          if (/^\s*(?:'use server'|"use server");?/m.test(header)) {
            return 'Server actions';
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    // 6. Layouts
    if (/(?:^|\/)(?:src\/)?app\/(?:.*\/)?layout\.(tsx|jsx|js|ts)$/.test(norm)) {
      return 'Layouts';
    }

    // 7. Middleware
    if (/(?:^|\/)(?:src\/)?middleware\.(ts|js)$/.test(norm)) {
      return 'Middleware';
    }

    // 8. Components
    if (/(?:^|\/)components\/.+\.(tsx|jsx)$/.test(norm)) {
      return 'Components';
    }

    // 9. Config
    if (/next\.config\.(js|mjs|ts|cjs)$/.test(norm)) {
      return 'Config';
    }

    return null;
  },

  extractRoutes(
    repositoryRoot: string,
    files: DiscoveredFile[],
    project?: Project
  ): ExtractedRoute[] {
    const routes: ExtractedRoute[] = [];
    const p = project ?? new Project({ useInMemoryFileSystem: true });

    for (const file of files) {
      const norm = file.path.replace(/\\/g, '/');

      // 1. App Router Page routes
      const pageMatch = norm.match(/(?:^|\/)(?:src\/)?app\/(.*page\.(?:tsx|jsx|js|ts))$/);
      if (pageMatch) {
        const pattern = deriveAppRouterPattern(pageMatch[1]);
        routes.push({
          method: 'GET',
          pattern,
          filePath: file.path,
          framework: 'nextjs',
        });
        continue;
      }

      // 2. App Router API Route handlers
      const routeMatch = norm.match(/(?:^|\/)(?:src\/)?app\/(.*route\.(?:ts|js))$/);
      if (routeMatch) {
        const pattern = deriveAppRouterPattern(routeMatch[1]);
        const fullPath = path.join(repositoryRoot, file.path);
        let content = '';
        try {
          content = fs.readFileSync(fullPath, 'utf8');
        } catch {
          continue;
        }

        const sourceFile = p.createSourceFile(
          file.path + '.next_route.ts',
          content,
          { overwrite: true }
        );

        const methodsFound = new Set<string>();

        // Check exported functions (export async function GET() { ... })
        for (const fn of sourceFile.getFunctions()) {
          if (fn.isExported()) {
            const name = fn.getName()?.toUpperCase();
            if (name && HTTP_METHODS.has(name)) {
              methodsFound.add(name);
            }
          }
        }

        // Check exported variable statements (export const GET = ... or export const POST = ...)
        for (const varStmt of sourceFile.getVariableStatements()) {
          if (varStmt.isExported()) {
            for (const decl of varStmt.getDeclarationList().getDeclarations()) {
              const name = decl.getName()?.toUpperCase();
              if (name && HTTP_METHODS.has(name)) {
                methodsFound.add(name);
              }
            }
          }
        }

        // Check named exports (export { handler as GET })
        for (const expDecl of sourceFile.getExportDeclarations()) {
          for (const namedExp of expDecl.getNamedExports()) {
            const alias = namedExp.getAliasNode()?.getText() || namedExp.getName();
            const upper = alias.toUpperCase();
            if (HTTP_METHODS.has(upper)) {
              methodsFound.add(upper);
            }
          }
        }

        // Clean up temporary ts-morph source file
        try {
          p.removeSourceFile(sourceFile);
        } catch {
          // Ignore
        }

        // Constraint: Emit only if recoverable with zero inference
        const sortedMethods = Array.from(methodsFound).sort();
        for (const method of sortedMethods) {
          routes.push({
            method,
            pattern,
            filePath: file.path,
            framework: 'nextjs',
          });
        }
        continue;
      }

      // 3. Pages Router Page routes
      const pagesMatch = norm.match(/(?:^|\/)(?:src\/)?pages\/(?!api\/)(.*(?:\.tsx|\.jsx|\.js|\.ts))$/);
      if (pagesMatch) {
        const base = path.basename(norm);
        if (!base.startsWith('_') && base !== '404.tsx' && base !== '500.tsx') {
          const pattern = derivePagesRouterPattern(pagesMatch[1]);
          routes.push({
            method: 'GET',
            pattern,
            filePath: file.path,
            framework: 'nextjs',
          });
        }
      }
    }

    return routes;
  },
};

