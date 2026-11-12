/**
 * CodoGraph — Express Framework Adapter (Phase 9).
 *
 * Implements Phase 9 Express support:
 * 1. Detection via package.json ("express") or entry files requiring/importing "express"
 *    (runs after Next.js and NestJS in fixed priority order).
 * 2. Role classification primarily from directory conventions, accepting both
 *    singular and plural folder names (e.g. route/routes, controller/controllers,
 *    middleware/middlewares, service/services, model/models, config/configs, test/tests).
 * 3. Route extraction: Express routes are NOT extracted because they are assembled
 *    at runtime from routers, variables, and middleware chains (invariant: exact or absent).
 *    Returns [].
 */
import fs from 'node:fs';
import path from 'node:path';
import type { FrameworkAdapter } from './types.ts';
import type { DiscoveredFile, ExtractedRoute } from '../types.ts';

const TEST_DIR_NAMES = new Set([
  'test',
  'tests',
  'spec',
  'specs',
  '__tests__',
  '__mocks__',
  'e2e',
]);

const EXPRESS_DIR_ROLE_MAP = new Map<string, string>([
  ['route', 'Routes'],
  ['routes', 'Routes'],
  ['router', 'Routes'],
  ['routers', 'Routes'],
  ['controller', 'Controllers'],
  ['controllers', 'Controllers'],
  ['handler', 'Controllers'],
  ['handlers', 'Controllers'],
  ['middleware', 'Middleware'],
  ['middlewares', 'Middleware'],
  ['validator', 'Validators'],
  ['validators', 'Validators'],
  ['validation', 'Validators'],
  ['validations', 'Validators'],
  ['service', 'Services'],
  ['services', 'Services'],
  ['repository', 'Repositories'],
  ['repositories', 'Repositories'],
  ['dao', 'Repositories'],
  ['daos', 'Repositories'],
  ['model', 'Models'],
  ['models', 'Models'],
  ['entity', 'Models'],
  ['entities', 'Models'],
  ['schema', 'Schemas'],
  ['schemas', 'Schemas'],
  ['view', 'Views'],
  ['views', 'Views'],
  ['template', 'Views'],
  ['templates', 'Views'],
  ['util', 'Utils'],
  ['utils', 'Utils'],
  ['utility', 'Utils'],
  ['utilities', 'Utils'],
  ['helper', 'Utils'],
  ['helpers', 'Utils'],
  ['config', 'Config files'],
  ['configs', 'Config files'],
  ['configuration', 'Config files'],
  ['configurations', 'Config files'],
]);

function classifyExpressFilePath(filePath: string): string | null {
  const norm = filePath.replace(/\\/g, '/');
  const segments = norm.split('/').filter(Boolean);
  const base = segments.length > 0 ? segments[segments.length - 1] : norm;
  const dirSegments = segments.slice(0, -1);

  // 1. Tests claim first so test/routes/user.js or tests/middleware.js never masquerades as production code
  for (const dir of dirSegments) {
    if (TEST_DIR_NAMES.has(dir.toLowerCase())) {
      return 'Tests';
    }
  }
  if (
    /(?:\.test|\.spec|_test|_spec)\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i.test(base) ||
    /^(?:vitest\.setup|jest\.setup|setupTests)\.(ts|tsx|js|jsx)$/i.test(base)
  ) {
    return 'Tests';
  }

  // 2. Directory conventions (nearest enclosing role folder from inner to outer, singular & plural)
  for (let i = dirSegments.length - 1; i >= 0; i--) {
    const dirRole = EXPRESS_DIR_ROLE_MAP.get(dirSegments[i].toLowerCase());
    if (dirRole) {
      return dirRole;
    }
  }

  // 3. Config filename conventions
  if (
    /\.config\.(js|mjs|cjs|ts|mts|cts)$/i.test(base) ||
    /^\.(?:eslintrc|prettierrc|babelrc)(?:\.(?:js|cjs|mjs|ts))?$/.test(base) ||
    /^(?:knexfile|ormconfig)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(base)
  ) {
    return 'Config files';
  }

  // 4. Explicit Express file suffix conventions outside dedicated role folders
  if (
    /^(?:routes?|router)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(base) ||
    /\.(?:route|routes|router|routers)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(base) ||
    /[A-Za-z0-9](?:Route|Routes|Router|Routers)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base)
  ) {
    return 'Routes';
  }

  if (
    /\.(?:controller|controllers|handler|handlers)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(base) ||
    /[A-Za-z0-9](?:Controller|Controllers)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base)
  ) {
    return 'Controllers';
  }

  if (
    /^(?:middlewares?)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(base) ||
    /\.(?:middleware|middlewares)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(base) ||
    /[A-Za-z0-9](?:Middleware|Middlewares)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base)
  ) {
    return 'Middleware';
  }

  if (
    /\.(?:validator|validators|validation|validations)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(base) ||
    /[A-Za-z0-9](?:Validator|Validators|Validation)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base)
  ) {
    return 'Validators';
  }

  if (
    /\.(?:service|services)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(base) ||
    /[A-Za-z0-9](?:Service|Services)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base)
  ) {
    return 'Services';
  }

  if (
    /\.(?:repository|repositories|repo|repos|dao|daos)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(base) ||
    /[A-Za-z0-9](?:Repository|Repositories|Dao|Daos)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base)
  ) {
    return 'Repositories';
  }

  if (
    /\.(?:model|models|entity|entities)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(base) ||
    /[A-Za-z0-9](?:Model|Models|Entity|Entities)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base)
  ) {
    return 'Models';
  }

  if (
    /\.(?:schema|schemas)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(base) ||
    /[A-Za-z0-9](?:Schema|Schemas)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base)
  ) {
    return 'Schemas';
  }

  if (
    /\.(?:util|utils|utility|utilities|helper|helpers)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(base) ||
    /[A-Za-z0-9](?:Util|Utils|Helper|Helpers)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base)
  ) {
    return 'Utils';
  }

  return null;
}

export const expressAdapter: FrameworkAdapter = {
  name: 'express',

  detect(repositoryRoot: string, files: DiscoveredFile[]): boolean {
    const pkgPath = path.join(repositoryRoot, 'package.json');
    let hasReact = false;

    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        hasReact = Boolean(pkg.dependencies?.react || pkg.devDependencies?.react);

        if (
          pkg.dependencies?.express ||
          pkg.peerDependencies?.express ||
          pkg.name === 'express'
        ) {
          return true;
        }

        if (pkg.devDependencies?.express && !hasReact) {
          return true;
        }
      } catch {
        // Continue if malformed JSON
      }
    }

    // Fallback when root package.json doesn't list express directly (e.g. monorepo subdir or fixture)
    if (!hasReact) {
      const candidates = [...files]
        .sort((a, b) => {
          const aEntry = /(?:^|\/)(?:app|server|index|main)\.(ts|js|cjs|mjs)$/i.test(a.path) ? 0 : 1;
          const bEntry = /(?:^|\/)(?:app|server|index|main)\.(ts|js|cjs|mjs)$/i.test(b.path) ? 0 : 1;
          if (aEntry !== bEntry) return aEntry - bEntry;
          return a.path.length - b.path.length;
        })
        .slice(0, 40);

      const expressRefRegex = /(?:\brequire\s*\(\s*['"]express['"]\s*\)|from\s+['"]express['"])/;

      for (const f of candidates) {
        const fullPath = path.join(repositoryRoot, f.path);
        try {
          const head = fs.readFileSync(fullPath, 'utf8').slice(0, 2000);
          if (expressRefRegex.test(head)) {
            return true;
          }
        } catch {
          // Ignore unreadable file
        }
      }
    }

    return false;
  },

  classifyFile(file: DiscoveredFile): string | null {
    return classifyExpressFilePath(file.path);
  },

  extractRoutes(): ExtractedRoute[] {
    // Express routes are composed at runtime via routers, variables, and middleware chains.
    // Constraint: exact or absent — return empty route table rather than guessing.
    return [];
  },
};

