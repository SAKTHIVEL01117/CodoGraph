/**
 * CodoGraph — NestJS Framework Adapter.
 *
 * Implements Phase 8 NestJS support:
 * 1. Detection via package.json dependencies ("@nestjs/core", "@nestjs/common") or nest-cli.json.
 * 2. Role classification from standard filename suffixes:
 *    - *.controller.(ts|js) -> Controllers
 *    - *.service.(ts|js) -> Services
 *    - *.module.(ts|js) -> Modules
 *    - *.entity.(ts|js) -> Entities
 *    - Plumbing: Guards, Pipes, Interceptors, DTOs
 * 3. Exact route extraction:
 *    - Assembled from @Controller('...') on the class and @Get(), @Post(), etc. on methods.
 *    - Invariant: Exact or absent. If either decorator has a dynamic unresolvable expression,
 *      emit nothing rather than guessing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Project, Node, type Decorator, type MethodDeclaration } from 'ts-morph';
import type { FrameworkAdapter } from './types.ts';
import type { DiscoveredFile, ExtractedRoute } from '../types.ts';

const NEST_HTTP_METHODS = new Map<string, string>([
  ['Get', 'GET'],
  ['Post', 'POST'],
  ['Put', 'PUT'],
  ['Delete', 'DELETE'],
  ['Patch', 'PATCH'],
  ['Options', 'OPTIONS'],
  ['Head', 'HEAD'],
  ['All', 'ALL'],
]);

/**
 * Combines the controller prefix and method sub-path into a clean, normalized URL pattern.
 * Examples:
 *   ('cats', '') -> '/cats'
 *   ('cats', ':id') -> '/cats/:id'
 *   ('', 'health') -> '/health'
 *   ('', '') -> '/'
 *   ('/api/v1/users', 'profile') -> '/api/v1/users/profile'
 */
export function assembleNestPath(prefix: string, subPath: string): string {
  let p = prefix.trim();
  let s = subPath.trim();

  // Strip trailing slashes
  p = p.replace(/\/+$/, '');
  // Strip leading and trailing slashes from subpath
  s = s.replace(/^\/+/, '').replace(/\/+$/, '');

  let combined = '';
  if (p) {
    combined = p.startsWith('/') ? p : '/' + p;
    if (s) {
      combined = combined + '/' + s;
    }
  } else if (s) {
    combined = '/' + s;
  } else {
    combined = '/';
  }

  // Normalize consecutive slashes
  combined = combined.replace(/\/+/g, '/');
  if (combined.length > 1 && combined.endsWith('/')) {
    combined = combined.slice(0, -1);
  }

  return combined || '/';
}

/**
 * Statically extracts the route prefix from a NestJS @Controller decorator.
 * Returns null if the prefix is dynamic or cannot be statically extracted with zero inference.
 */
function extractControllerPrefix(decorator: Decorator): string | null {
  const args = decorator.getArguments();
  if (args.length === 0) {
    return '';
  }

  const firstArg = args[0];

  // Case 1: String literal, e.g. @Controller('cats')
  if (Node.isStringLiteral(firstArg)) {
    return firstArg.getLiteralValue();
  }

  // Case 2: Object literal, e.g. @Controller({ path: 'cats' })
  if (Node.isObjectLiteralExpression(firstArg)) {
    const pathProp = firstArg.getProperty('path');
    if (pathProp && Node.isPropertyAssignment(pathProp)) {
      const init = pathProp.getInitializer();
      if (init && Node.isStringLiteral(init)) {
        return init.getLiteralValue();
      }
    }
    return null;
  }

  // Non-literal or dynamic expression
  return null;
}

/**
 * Extracts all HTTP decorators from a method declaration.
 */
function getMethodHttpDecorators(
  method: MethodDeclaration
): { httpMethod: string; subPath: string | null }[] {
  const results: { httpMethod: string; subPath: string | null }[] = [];

  for (const decorator of method.getDecorators()) {
    const name = decorator.getName();
    const httpMethod = NEST_HTTP_METHODS.get(name);
    if (!httpMethod) continue;

    const args = decorator.getArguments();
    if (args.length === 0) {
      results.push({ httpMethod, subPath: '' });
      continue;
    }

    const firstArg = args[0];
    if (Node.isStringLiteral(firstArg)) {
      results.push({ httpMethod, subPath: firstArg.getLiteralValue() });
    } else if (Node.isArrayLiteralExpression(firstArg)) {
      // Multiple paths: @Get(['', 'all'])
      for (const elem of firstArg.getElements()) {
        if (Node.isStringLiteral(elem)) {
          results.push({ httpMethod, subPath: elem.getLiteralValue() });
        } else {
          results.push({ httpMethod, subPath: null });
        }
      }
    } else {
      // Dynamic argument
      results.push({ httpMethod, subPath: null });
    }
  }

  return results;
}

export const nestjsAdapter: FrameworkAdapter = {
  name: 'nestjs',

  detect(repositoryRoot: string, files: DiscoveredFile[]): boolean {
    // 1. Check root package.json
    const pkgPath = path.join(repositoryRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (
          pkg.dependencies?.['@nestjs/core'] ||
          pkg.dependencies?.['@nestjs/common'] ||
          pkg.devDependencies?.['@nestjs/core'] ||
          pkg.devDependencies?.['@nestjs/common']
        ) {
          return true;
        }
      } catch {
        // Continue if malformed JSON
      }
    }

    // 2. Check for nest-cli.json
    const nestCliPath = path.join(repositoryRoot, 'nest-cli.json');
    if (fs.existsSync(nestCliPath)) {
      return true;
    }

    // 3. Check for distinctive NestJS file suffix conventions
    let hasController = false;
    let hasModule = false;
    for (const f of files) {
      if (/\.controller\.(ts|js)$/.test(f.path)) hasController = true;
      if (/\.module\.(ts|js)$/.test(f.path)) hasModule = true;
      if (hasController && hasModule) return true;
    }

    return false;
  },

  classifyFile(file: DiscoveredFile): string | null {
    const base = path.basename(file.path);

    // 1. Controllers
    if (/\.controller\.(ts|js)$/.test(base)) {
      return 'Controllers';
    }

    // 2. Services
    if (/\.service\.(ts|js)$/.test(base)) {
      return 'Services';
    }

    // 3. Modules
    if (/\.module\.(ts|js)$/.test(base)) {
      return 'Modules';
    }

    // 4. Entities
    if (/\.entity\.(ts|js)$/.test(base)) {
      return 'Entities';
    }

    // 5. Plumbing
    if (/\.guard\.(ts|js)$/.test(base)) {
      return 'Guards';
    }
    if (/\.pipe\.(ts|js)$/.test(base)) {
      return 'Pipes';
    }
    if (/\.interceptor\.(ts|js)$/.test(base)) {
      return 'Interceptors';
    }
    if (/\.dto\.(ts|js)$/.test(base)) {
      return 'DTOs';
    }
    if (/\.gateway\.(ts|js)$/.test(base)) {
      return 'Gateways';
    }
    if (/\.middleware\.(ts|js)$/.test(base)) {
      return 'Middleware';
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

    // Look through all controller files
    const controllerFiles = files.filter((f) => /\.controller\.(ts|js)$/.test(f.path));

    for (const file of controllerFiles) {
      const fullPath = path.join(repositoryRoot, file.path);
      let content = '';
      try {
        content = fs.readFileSync(fullPath, 'utf8');
      } catch {
        continue;
      }

      const sourceFile = p.createSourceFile(
        file.path + '.nest_ctrl.ts',
        content,
        { overwrite: true }
      );

      for (const classDecl of sourceFile.getClasses()) {
        const controllerDecorator = classDecl.getDecorator('Controller');
        if (!controllerDecorator) continue;

        const prefix = extractControllerPrefix(controllerDecorator);
        // Constraint: If prefix is dynamic / unresolvable, emit nothing for this controller
        if (prefix === null) continue;

        for (const method of classDecl.getMethods()) {
          const httpDecorators = getMethodHttpDecorators(method);

          for (const { httpMethod, subPath } of httpDecorators) {
            // Constraint: If subPath is dynamic / unresolvable, emit nothing for this method
            if (subPath === null) continue;

            const pattern = assembleNestPath(prefix, subPath);
            routes.push({
              method: httpMethod,
              pattern,
              filePath: file.path,
              framework: 'nestjs',
            });
          }
        }
      }

      // Clean up temporary ts-morph source file
      try {
        p.removeSourceFile(sourceFile);
      } catch {
        // Ignore
      }
    }

    return routes;
  },
};

