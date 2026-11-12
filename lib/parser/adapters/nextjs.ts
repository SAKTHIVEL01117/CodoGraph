/**
 * CodoGraph — Next.js Framework Adapter.
 *
 * Implements Phase 8 Next.js support:
 * 1. Detection via package.json dependencies ("next") or next.config.* files.
 * 2. Role classification from directory and naming conventions in fixed reading order:
 *    - Page routes, API endpoints, Server actions, Layouts, Loading & error UI,
 *      Components, Hooks, Middleware, Metadata files, Instrumentation, Config files, Tests
 *    - Anything else remains null (Unclassified).
 * 3. Exact route extraction:
 *    - Page routes: HTTP GET with normalized URL path (excluding route groups like (auth)).
 *    - API route handlers: exact exported HTTP methods (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)
 *      with 1-based declaration line numbers.
 *    - Invariant: Exact or absent. If method or pattern cannot be parsed with zero inference, emit nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Project, Node } from 'ts-morph';
import type { FrameworkAdapter, ClassifyContext } from './types.ts';
import type { DiscoveredFile, ExtractedRoute } from '../types.ts';

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

/**
 * Normalizes an App Router file path to an exact route URL pattern.
 * Omits Next.js route groups like "(auth)" and parallel route slots like "@modal".
 */
export function deriveAppRouterPattern(appRelativePath: string): string {
  // Strip trailing file name (e.g. /page.tsx or /route.tsx)
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

/**
 * Locates the 1-based line number of the default export in a page module (fallback 1).
 */
function findDefaultExportLine(fullPath: string): number {
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (
        /^\s*export\s+default\b/.test(lines[i]) ||
        /^\s*export\s+\{[^}]*\bas\s+default\b/.test(lines[i])
      ) {
        return i + 1;
      }
    }
  } catch {
    // Ignore read errors
  }
  return 1;
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
      if (/^next\.config\.(js|mjs|ts|mts|cjs)$/.test(base)) {
        return true;
      }
    }

    return false;
  },

  classifyFile(file: DiscoveredFile, context?: ClassifyContext): string | null {
    const norm = file.path.replace(/\\/g, '/');
    const base = path.basename(norm);

    // 1. Tests (claim before components/hooks so test files never masquerade as UI/hooks)
    if (
      /(?:^|\/)__(?:tests|mocks)__\/.+\.(ts|tsx|js|jsx|mts|cts)$/.test(norm) ||
      /(?:^|\/)(?:tests?|e2e)\/(?:.*\/)?[^/]+\.(?:test|spec)\.(ts|tsx|js|jsx|mts|cts)$/i.test(
        norm
      ) ||
      /(?:\.test|\.spec|_test|_spec)\.(ts|tsx|js|jsx|mts|cts)$/i.test(base) ||
      /^(?:vitest\.setup|jest\.setup|setupTests)\.(ts|tsx|js|jsx)$/i.test(base)
    ) {
      return 'Tests';
    }

    // 2. App Router Page routes
    if (/(?:^|\/)(?:src\/)?app\/(?:.*\/)?page\.(tsx|jsx|js|ts)$/.test(norm)) {
      return 'Page routes';
    }

    // 3. App Router API endpoints
    if (/(?:^|\/)(?:src\/)?app\/(?:.*\/)?route\.(ts|tsx|js|jsx)$/.test(norm)) {
      return 'API endpoints';
    }

    // 4. Pages Router API endpoints
    if (/(?:^|\/)(?:src\/)?pages\/api\/.+\.(ts|tsx|js|jsx)$/.test(norm)) {
      return 'API endpoints';
    }

    // 5. Pages Router special files (_error, 404, 500 -> Loading & error UI; _app, _document -> Layouts)
    if (/(?:^|\/)(?:src\/)?pages\/_app\.(tsx|jsx|js|ts)$/.test(norm) ||
        /(?:^|\/)(?:src\/)?pages\/_document\.(tsx|jsx|js|ts)$/.test(norm)) {
      return 'Layouts';
    }

    if (/(?:^|\/)(?:src\/)?pages\/(?:_error|404|500)\.(tsx|jsx|js|ts)$/.test(norm)) {
      return 'Loading & error UI';
    }

    // 6. Pages Router Page routes
    if (/(?:^|\/)(?:src\/)?pages\/(?!api\/).+\.(tsx|jsx|js|ts)$/.test(norm)) {
      if (!base.startsWith('_')) {
        return 'Page routes';
      }
    }

    // 7. Server actions: convention or "use server" directive
    if (
      /(?:^|\/)(?:.+\.)?actions?\.(ts|tsx|js|jsx)$/.test(norm) ||
      /(?:^|\/)actions\/.+\.(ts|tsx|js|jsx)$/.test(norm)
    ) {
      return 'Server actions';
    }

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

    // 8. Layouts (App Router layout & template)
    if (/(?:^|\/)(?:src\/)?app\/(?:.*\/)?(?:layout|template)\.(tsx|jsx|js|ts)$/.test(norm)) {
      return 'Layouts';
    }

    // 9. Loading & error UI (App Router)
    if (
      /(?:^|\/)(?:src\/)?app\/(?:.*\/)?(?:loading|error|global-error|not-found|forbidden|unauthorized|default)\.(tsx|jsx|js|ts)$/.test(
        norm
      )
    ) {
      return 'Loading & error UI';
    }

    // 10. Middleware (and Next.js 16 proxy convention at root or src/)
    if (
      /(?:^|\/)(?:src\/)?middleware\.(ts|tsx|js|jsx)$/.test(norm) ||
      /^(?:src\/)?proxy\.(ts|js)$/.test(norm)
    ) {
      return 'Middleware';
    }

    // 11. Metadata files (App Router dynamic/code metadata files)
    if (
      /(?:^|\/)(?:src\/)?app\/(?:.*\/)?(?:sitemap|robots|manifest|opengraph-image|twitter-image|icon\d*|apple-icon\d*)\.(ts|tsx|js|jsx|mjs)$/.test(
        norm
      )
    ) {
      return 'Metadata files';
    }

    // 12. Instrumentation
    if (/(?:^|\/)(?:src\/)?instrumentation(?:-client)?\.(ts|tsx|js|jsx)$/.test(norm)) {
      return 'Instrumentation';
    }

    // 13. Config files
    if (
      /^next\.config\.(js|mjs|ts|mts|cjs)$/.test(base) ||
      /\.config\.(js|mjs|cjs|ts|mts|cts)$/i.test(base) ||
      /^mdx-components\.(ts|tsx|js|jsx)$/.test(base) ||
      /^\.(?:eslintrc|prettierrc|babelrc)(?:\.(?:js|cjs|mjs|ts))?$/.test(base)
    ) {
      return 'Config files';
    }

    // 14. Hooks (custom React hooks in Next.js)
    if (
      /(?:^|\/)hooks?\/.+\.(ts|tsx|js|jsx|mts|cts)$/.test(norm) ||
      /^(?:use-[a-z0-9-]+|use[A-Z][A-Za-z0-9]*)\.(ts|tsx|js|jsx)$/.test(base)
    ) {
      return 'Hooks';
    }

    // 15. Components (.tsx / .jsx modules not claimed by pages/layouts/loading/metadata/tests/config/hooks)
    if (
      /(?:^|\/)components?\/.+\.(tsx|jsx)$/.test(norm) ||
      file.extension === '.tsx' ||
      file.extension === '.jsx'
    ) {
      return 'Components';
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
        const line = findDefaultExportLine(path.join(repositoryRoot, file.path));
        routes.push({
          method: 'GET',
          pattern,
          filePath: file.path,
          line,
          framework: 'nextjs',
        });
        continue;
      }

      // 2. App Router API Route handlers (supports route.ts, route.tsx, route.js, route.jsx)
      const routeMatch = norm.match(/(?:^|\/)(?:src\/)?app\/(.*route\.(?:ts|tsx|js|jsx))$/);
      if (routeMatch) {
        const pattern = deriveAppRouterPattern(routeMatch[1]);
        const fullPath = path.join(repositoryRoot, file.path);
        let content = '';
        try {
          content = fs.readFileSync(fullPath, 'utf8');
        } catch {
          continue;
        }

        const tempExt = /\.(tsx|jsx)$/i.test(file.path) ? '.next_route.tsx' : '.next_route.ts';
        const sourceFile = p.createSourceFile(file.path + tempExt, content, {
          overwrite: true,
        });

        const methodLines = new Map<string, number>();
        const recordMethod = (candidate: string | undefined, lineNum: number) => {
          const upper = candidate?.toUpperCase();
          if (upper && HTTP_METHODS.has(upper) && !methodLines.has(upper)) {
            methodLines.set(upper, lineNum);
          }
        };

        // Check exported functions (export async function GET() { ... })
        for (const fn of sourceFile.getFunctions()) {
          if (fn.isExported()) {
            recordMethod(fn.getName(), fn.getStartLineNumber());
          }
        }

        // Check exported variable statements (export const GET = ... or export const { GET, POST } = handlers)
        for (const varStmt of sourceFile.getVariableStatements()) {
          if (varStmt.isExported()) {
            const stmtLine = varStmt.getStartLineNumber();
            for (const decl of varStmt.getDeclarationList().getDeclarations()) {
              const nameNode = decl.getNameNode();
              if (Node.isObjectBindingPattern(nameNode)) {
                for (const el of nameNode.getElements()) {
                  const boundName = el.getNameNode()?.getText() || el.getName() || '';
                  recordMethod(boundName, decl.getStartLineNumber() || stmtLine);
                }
              } else {
                recordMethod(decl.getName(), stmtLine);
              }
            }
          }
        }

        // Check named exports (export { handler as GET })
        for (const expDecl of sourceFile.getExportDeclarations()) {
          const expLine = expDecl.getStartLineNumber();
          for (const namedExp of expDecl.getNamedExports()) {
            const alias = namedExp.getAliasNode()?.getText() || namedExp.getName();
            recordMethod(alias, namedExp.getStartLineNumber() || expLine);
          }
        }

        // Clean up temporary ts-morph source file
        try {
          p.removeSourceFile(sourceFile);
        } catch {
          // Ignore
        }

        // Constraint: Emit only if recoverable with zero inference
        const sortedMethods = Array.from(methodLines.keys()).sort();
        for (const method of sortedMethods) {
          routes.push({
            method,
            pattern,
            filePath: file.path,
            line: methodLines.get(method),
            framework: 'nextjs',
          });
        }
        continue;
      }

      // 3. Pages Router Page routes
      const pagesMatch = norm.match(
        /(?:^|\/)(?:src\/)?pages\/(?!api\/)(.*(?:\.tsx|\.jsx|\.js|\.ts))$/
      );
      if (pagesMatch) {
        const base = path.basename(norm);
        if (!base.startsWith('_') && !/^(?:404|500)\.(tsx|jsx|js|ts)$/.test(base)) {
          const pattern = derivePagesRouterPattern(pagesMatch[1]);
          const line = findDefaultExportLine(path.join(repositoryRoot, file.path));
          routes.push({
            method: 'GET',
            pattern,
            filePath: file.path,
            line,
            framework: 'nextjs',
          });
        }
      }
    }

    return routes;
  },
};
