/**
 * CodoGraph — File Taxonomy & Categorization (Phase 4 & Phase 8).
 *
 * Implements Phase 8 framework-reshaped taxonomy:
 * - Next.js: Fixed reading order matching Next.js architectural layers:
 *   Page routes -> API endpoints -> Server actions -> Layouts -> Loading & error UI ->
 *   Components -> Hooks -> Middleware -> Metadata files -> Instrumentation ->
 *   Config files -> Tests -> Unclassified.
 * - NestJS: Controllers, Services, Modules, Entities, Guards, Pipes, Interceptors,
 *   DTOs, Gateways, Middleware, Config files, Tests, Unclassified.
 * - Express: Routes, Controllers, Middleware, Validators, Services, Repositories,
 *   Models, Schemas, Views, Utils, Config files, Tests, Unclassified.
 * - React: Views, Components, Hooks, Contexts, Config files, Tests, Unclassified.
 * - Fallback ('none'): Extension-based taxonomy (.ts, .tsx, .js, .mts, .cjs).
 *
 * Invariants:
 * 1. The rail taxonomy lives apart from the adapters themselves, so a browser
 *    component can read the list of category names without pulling a parser and
 *    a filesystem library into the bundle.
 * 2. Category names are the concrete role names, not abstractions.
 * 3. Rail order is reading order and it stays fixed.
 */
import type { ParsedFile } from '@/lib/parser/types';

export interface FileCategory {
  id: string;
  name: string;
  color: string;
  count: number;
  files: string[];
}

interface TaxonomyCategoryDef {
  name: string;
  color: string;
  /** Claim priority when falling back to path conventions (smaller runs earlier). */
  claimOrder: number;
  /** Explicit role strings mapped to this category (for saved/reloaded analyses). */
  roleAliases: string[];
  /** Path-based fallback matcher when file.role is null or legacy. */
  matchesPath: (f: ParsedFile, norm: string, base: string) => boolean;
}

const COMMON_TEST_MATCHER = (
  _f: ParsedFile,
  norm: string,
  base: string
): boolean =>
  /(?:^|\/)__(?:tests|mocks)__\/.+\.(ts|tsx|js|jsx|mts|cts)$/.test(norm) ||
  /(?:^|\/)(?:tests?|e2e)\/(?:.*\/)?[^/]+\.(?:test|spec)\.(ts|tsx|js|jsx|mts|cts)$/i.test(
    norm
  ) ||
  /(?:\.test|\.spec|_test|_spec)\.(ts|tsx|js|jsx|mts|cts)$/i.test(base) ||
  /^(?:vitest\.setup|jest\.setup|setupTests)\.(ts|tsx|js|jsx)$/i.test(base);

const COMMON_CONFIG_MATCHER = (
  _f: ParsedFile,
  _norm: string,
  base: string
): boolean =>
  /^next\.config\.(js|mjs|ts|mts|cjs)$/.test(base) ||
  /\.config\.(js|mjs|cjs|ts|mts|cts)$/i.test(base) ||
  /^mdx-components\.(ts|tsx|js|jsx)$/.test(base) ||
  /^\.(?:eslintrc|prettierrc|babelrc)(?:\.(?:js|cjs|mjs|ts))?$/.test(base);

const EXPRESS_TEST_DIRS = new Set([
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

function classifyExpressPathRole(norm: string, base: string): string | null {
  const segments = norm.split('/').filter(Boolean);
  const dirSegments = segments.slice(0, -1);

  for (const dir of dirSegments) {
    if (EXPRESS_TEST_DIRS.has(dir.toLowerCase())) {
      return 'Tests';
    }
  }
  if (
    /(?:\.test|\.spec|_test|_spec)\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i.test(base) ||
    /^(?:vitest\.setup|jest\.setup|setupTests)\.(ts|tsx|js|jsx)$/i.test(base)
  ) {
    return 'Tests';
  }

  for (let i = dirSegments.length - 1; i >= 0; i--) {
    const dirRole = EXPRESS_DIR_ROLE_MAP.get(dirSegments[i].toLowerCase());
    if (dirRole) {
      return dirRole;
    }
  }

  if (
    /\.config\.(js|mjs|cjs|ts|mts|cts)$/i.test(base) ||
    /^\.(?:eslintrc|prettierrc|babelrc)(?:\.(?:js|cjs|mjs|ts))?$/.test(base) ||
    /^(?:knexfile|ormconfig)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(base)
  ) {
    return 'Config files';
  }

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

const NEXTJS_TAXONOMY: TaxonomyCategoryDef[] = [
  {
    name: 'Page routes',
    color: '#38bdf8',
    claimOrder: 20,
    roleAliases: ['page routes', 'page', 'pages', 'page_route'],
    matchesPath: (_f, norm, base) =>
      /(?:^|\/)(?:src\/)?app\/(?:.*\/)?page\.(tsx|jsx|js|ts)$/.test(norm) ||
      (/(?:^|\/)(?:src\/)?pages\/(?!api\/).+\.(tsx|jsx|js|ts)$/.test(norm) &&
        !base.startsWith('_') &&
        !/^(?:404|500)\.(tsx|jsx|js|ts)$/.test(base)),
  },
  {
    name: 'API endpoints',
    color: '#ec4899',
    claimOrder: 25,
    roleAliases: ['api endpoints', 'route', 'route_handler', 'api_endpoint', 'api'],
    matchesPath: (_f, norm) =>
      /(?:^|\/)(?:src\/)?app\/(?:.*\/)?route\.(ts|tsx|js|jsx)$/.test(norm) ||
      /(?:^|\/)(?:src\/)?pages\/api\/.+\.(ts|tsx|js|jsx)$/.test(norm),
  },
  {
    name: 'Server actions',
    color: '#a855f7',
    claimOrder: 30,
    roleAliases: ['server actions', 'server_action', 'action', 'actions'],
    matchesPath: (_f, norm) =>
      /(?:^|\/)(?:.+\.)?actions?\.(ts|tsx|js|jsx)$/.test(norm) ||
      /(?:^|\/)actions\/.+\.(ts|tsx|js|jsx)$/.test(norm),
  },
  {
    name: 'Layouts',
    color: '#f59e0b',
    claimOrder: 35,
    roleAliases: ['layouts', 'layout'],
    matchesPath: (_f, norm) =>
      /(?:^|\/)(?:src\/)?app\/(?:.*\/)?(?:layout|template)\.(tsx|jsx|js|ts)$/.test(norm) ||
      /(?:^|\/)(?:src\/)?pages\/_(?:app|document)\.(tsx|jsx|js|ts)$/.test(norm),
  },
  {
    name: 'Loading & error UI',
    color: '#fb923c',
    claimOrder: 40,
    roleAliases: ['loading & error ui', 'loading', 'error'],
    matchesPath: (_f, norm) =>
      /(?:^|\/)(?:src\/)?app\/(?:.*\/)?(?:loading|error|global-error|not-found|forbidden|unauthorized|default)\.(tsx|jsx|js|ts)$/.test(
        norm
      ) || /(?:^|\/)(?:src\/)?pages\/(?:_error|404|500)\.(tsx|jsx|js|ts)$/.test(norm),
  },
  {
    name: 'Components',
    color: '#10b981',
    claimOrder: 80,
    roleAliases: ['components', 'component'],
    matchesPath: (f, norm) =>
      /(?:^|\/)components?\/.+\.(tsx|jsx)$/.test(norm) ||
      f.extension.toLowerCase() === '.tsx' ||
      f.extension.toLowerCase() === '.jsx',
  },
  {
    name: 'Hooks',
    color: '#14b8a6',
    claimOrder: 65,
    roleAliases: ['hooks', 'hook'],
    matchesPath: (_f, norm, base) =>
      /(?:^|\/)hooks?\/.+\.(ts|tsx|js|jsx|mts|cts)$/.test(norm) ||
      /^(?:use-[a-z0-9-]+|use[A-Z][A-Za-z0-9]*)\.(ts|tsx|js|jsx)$/.test(base),
  },
  {
    name: 'Middleware',
    color: '#06b6d4',
    claimOrder: 45,
    roleAliases: ['middleware'],
    matchesPath: (_f, norm) =>
      /(?:^|\/)(?:src\/)?middleware\.(ts|tsx|js|jsx)$/.test(norm) ||
      /^(?:src\/)?proxy\.(ts|js)$/.test(norm),
  },
  {
    name: 'Metadata files',
    color: '#818cf8',
    claimOrder: 50,
    roleAliases: ['metadata files', 'metadata'],
    matchesPath: (_f, norm) =>
      /(?:^|\/)(?:src\/)?app\/(?:.*\/)?(?:sitemap|robots|manifest|opengraph-image|twitter-image|icon\d*|apple-icon\d*)\.(ts|tsx|js|jsx|mjs)$/.test(
        norm
      ),
  },
  {
    name: 'Instrumentation',
    color: '#6366f1',
    claimOrder: 55,
    roleAliases: ['instrumentation'],
    matchesPath: (_f, norm) =>
      /(?:^|\/)(?:src\/)?instrumentation(?:-client)?\.(ts|tsx|js|jsx)$/.test(norm),
  },
  {
    name: 'Config files',
    color: '#64748b',
    claimOrder: 60,
    roleAliases: ['config files', 'config'],
    matchesPath: COMMON_CONFIG_MATCHER,
  },
  {
    name: 'Tests',
    color: '#f43f5e',
    claimOrder: 10,
    roleAliases: ['tests', 'test'],
    matchesPath: COMMON_TEST_MATCHER,
  },
];

const FRAMEWORK_TAXONOMIES: Record<
  string,
  { defs: TaxonomyCategoryDef[]; showEmptySlots: boolean }
> = {
  nextjs: {
    defs: NEXTJS_TAXONOMY,
    showEmptySlots: true,
  },
  nestjs: {
    showEmptySlots: false,
    defs: [
      {
        name: 'Controllers',
        color: '#38bdf8',
        claimOrder: 20,
        roleAliases: ['controllers', 'controller'],
        matchesPath: (_f, norm) => /\.controller\.(ts|js)$/.test(norm),
      },
      {
        name: 'Services',
        color: '#10b981',
        claimOrder: 25,
        roleAliases: ['services', 'service'],
        matchesPath: (_f, norm) => /\.service\.(ts|js)$/.test(norm),
      },
      {
        name: 'Modules',
        color: '#ec4899',
        claimOrder: 30,
        roleAliases: ['modules', 'module'],
        matchesPath: (_f, norm) => /\.module\.(ts|js)$/.test(norm),
      },
      {
        name: 'Entities',
        color: '#f59e0b',
        claimOrder: 35,
        roleAliases: ['entities', 'entity'],
        matchesPath: (_f, norm) => /\.entity\.(ts|js)$/.test(norm),
      },
      {
        name: 'Guards',
        color: '#8b5cf6',
        claimOrder: 40,
        roleAliases: ['guards', 'guard'],
        matchesPath: (_f, norm) => /\.guard\.(ts|js)$/.test(norm),
      },
      {
        name: 'Pipes',
        color: '#06b6d4',
        claimOrder: 45,
        roleAliases: ['pipes', 'pipe'],
        matchesPath: (_f, norm) => /\.pipe\.(ts|js)$/.test(norm),
      },
      {
        name: 'Interceptors',
        color: '#eab308',
        claimOrder: 50,
        roleAliases: ['interceptors', 'interceptor'],
        matchesPath: (_f, norm) => /\.interceptor\.(ts|js)$/.test(norm),
      },
      {
        name: 'DTOs',
        color: '#64748b',
        claimOrder: 55,
        roleAliases: ['dtos', 'dto'],
        matchesPath: (_f, norm) => /\.dto\.(ts|js)$/.test(norm),
      },
      {
        name: 'Gateways',
        color: '#f43f5e',
        claimOrder: 60,
        roleAliases: ['gateways', 'gateway'],
        matchesPath: (_f, norm) => /\.gateway\.(ts|js)$/.test(norm),
      },
      {
        name: 'Middleware',
        color: '#14b8a6',
        claimOrder: 65,
        roleAliases: ['middleware'],
        matchesPath: (_f, norm) => /\.middleware\.(ts|js)$/.test(norm),
      },
      {
        name: 'Config files',
        color: '#64748b',
        claimOrder: 70,
        roleAliases: ['config files', 'config'],
        matchesPath: COMMON_CONFIG_MATCHER,
      },
      {
        name: 'Tests',
        color: '#f43f5e',
        claimOrder: 10,
        roleAliases: ['tests', 'test'],
        matchesPath: COMMON_TEST_MATCHER,
      },
    ],
  },
  express: {
    showEmptySlots: false,
    defs: [
      {
        name: 'Routes',
        color: '#ec4899',
        claimOrder: 20,
        roleAliases: ['routes', 'route', 'router', 'routers'],
        matchesPath: (_f, norm, base) => classifyExpressPathRole(norm, base) === 'Routes',
      },
      {
        name: 'Controllers',
        color: '#38bdf8',
        claimOrder: 25,
        roleAliases: ['controllers', 'controller', 'handler', 'handlers'],
        matchesPath: (_f, norm, base) => classifyExpressPathRole(norm, base) === 'Controllers',
      },
      {
        name: 'Middleware',
        color: '#06b6d4',
        claimOrder: 30,
        roleAliases: ['middleware', 'middlewares'],
        matchesPath: (_f, norm, base) => classifyExpressPathRole(norm, base) === 'Middleware',
      },
      {
        name: 'Validators',
        color: '#a855f7',
        claimOrder: 35,
        roleAliases: ['validators', 'validator', 'validation', 'validations'],
        matchesPath: (_f, norm, base) => classifyExpressPathRole(norm, base) === 'Validators',
      },
      {
        name: 'Services',
        color: '#10b981',
        claimOrder: 40,
        roleAliases: ['services', 'service'],
        matchesPath: (_f, norm, base) => classifyExpressPathRole(norm, base) === 'Services',
      },
      {
        name: 'Repositories',
        color: '#14b8a6',
        claimOrder: 45,
        roleAliases: ['repositories', 'repository', 'dao', 'daos'],
        matchesPath: (_f, norm, base) => classifyExpressPathRole(norm, base) === 'Repositories',
      },
      {
        name: 'Models',
        color: '#f59e0b',
        claimOrder: 50,
        roleAliases: ['models', 'model', 'entities', 'entity'],
        matchesPath: (_f, norm, base) => classifyExpressPathRole(norm, base) === 'Models',
      },
      {
        name: 'Schemas',
        color: '#fb923c',
        claimOrder: 55,
        roleAliases: ['schemas', 'schema'],
        matchesPath: (_f, norm, base) => classifyExpressPathRole(norm, base) === 'Schemas',
      },
      {
        name: 'Views',
        color: '#818cf8',
        claimOrder: 60,
        roleAliases: ['views', 'view', 'templates', 'template'],
        matchesPath: (_f, norm, base) => classifyExpressPathRole(norm, base) === 'Views',
      },
      {
        name: 'Utils',
        color: '#8b5cf6',
        claimOrder: 65,
        roleAliases: ['utils', 'util', 'utilities', 'utility', 'helpers', 'helper'],
        matchesPath: (_f, norm, base) => classifyExpressPathRole(norm, base) === 'Utils',
      },
      {
        name: 'Config files',
        color: '#64748b',
        claimOrder: 70,
        roleAliases: ['config files', 'config', 'configs'],
        matchesPath: (_f, norm, base) => classifyExpressPathRole(norm, base) === 'Config files',
      },
      {
        name: 'Tests',
        color: '#f43f5e',
        claimOrder: 10,
        roleAliases: ['tests', 'test', 'spec', 'specs'],
        matchesPath: (_f, norm, base) => classifyExpressPathRole(norm, base) === 'Tests',
      },
    ],
  },
  react: {
    showEmptySlots: false,
    defs: [
      {
        name: 'Views',
        color: '#38bdf8',
        claimOrder: 20,
        roleAliases: ['views', 'view', 'page', 'pages'],
        matchesPath: (_f, norm) =>
          /(?:^|\/)(?:views|pages)\/.+\.(tsx|jsx|js|ts)$/.test(norm),
      },
      {
        name: 'Components',
        color: '#ec4899',
        claimOrder: 80,
        roleAliases: ['components', 'component'],
        matchesPath: (f, norm) =>
          /(?:^|\/)components?\/.+\.(tsx|jsx)$/.test(norm) ||
          f.extension.toLowerCase() === '.tsx' ||
          f.extension.toLowerCase() === '.jsx',
      },
      {
        name: 'Hooks',
        color: '#10b981',
        claimOrder: 30,
        roleAliases: ['hooks', 'hook'],
        matchesPath: (_f, norm, base) =>
          /(?:^|\/)hooks?\/.+\.(ts|js|tsx|jsx)$/.test(norm) ||
          /^(?:use-[a-z0-9-]+|use[A-Z][A-Za-z0-9]*)\.(ts|tsx|js|jsx)$/.test(base),
      },
      {
        name: 'Contexts',
        color: '#a855f7',
        claimOrder: 35,
        roleAliases: ['contexts', 'context'],
        matchesPath: (_f, norm, base) =>
          /(?:^|\/)contexts?\/.+\.(ts|js|tsx|jsx)$/.test(norm) ||
          /(?:context|provider)\.(ts|js|tsx|jsx)$/i.test(base),
      },
      {
        name: 'Config files',
        color: '#64748b',
        claimOrder: 60,
        roleAliases: ['config files', 'config'],
        matchesPath: COMMON_CONFIG_MATCHER,
      },
      {
        name: 'Tests',
        color: '#f43f5e',
        claimOrder: 10,
        roleAliases: ['tests', 'test'],
        matchesPath: COMMON_TEST_MATCHER,
      },
    ],
  },
};

const EXTENSION_COLORS: Record<string, string> = {
  '.ts': '#38bdf8',
  '.tsx': '#ec4899',
  '.js': '#f97316',
  '.mts': '#818cf8',
  '.cjs': '#94a3b8',
  '.jsx': '#a855f7',
  '.mjs': '#eab308',
};

const DEFAULT_COLOR = '#64748b';

/**
 * Infers framework from file layout if adapter is 'standard' or empty.
 */
function inferFrameworkFromFiles(files: ParsedFile[]): string | null {
  let hasNestController = false;
  let hasNestModule = false;
  let hasNextPageOrRoute = false;

  for (const f of files) {
    if (/\.controller\.(ts|js)$/.test(f.path)) hasNestController = true;
    if (/\.module\.(ts|js)$/.test(f.path)) hasNestModule = true;
    if (
      /(?:^|\/)app\/(?:.*\/)?page\.(tsx|jsx|js|ts)$/.test(f.path) ||
      /(?:^|\/)app\/(?:.*\/)?route\.(ts|tsx|js|jsx)$/.test(f.path) ||
      /(?:^|\/)pages\/.+\.(tsx|jsx|js|ts)$/.test(f.path) ||
      /next\.config\.(js|mjs|ts|mts|cjs)$/.test(f.path) ||
      f.role === 'page' ||
      f.role === 'route' ||
      f.role === 'Page routes'
    ) {
      hasNextPageOrRoute = true;
    }
  }

  if (hasNextPageOrRoute) return 'nextjs';
  if (hasNestController && hasNestModule) return 'nestjs';
  return null;
}

/**
 * Categorizes a list of parsed files according to the active framework adapter.
 * If adapterName is 'none' or unclassified, falls back to file extension grouping.
 */
export function categorizeFiles(
  files: ParsedFile[],
  adapterName: string = 'none'
): FileCategory[] {
  let normAdapter = adapterName.toLowerCase().trim();

  if (normAdapter === 'standard' || !normAdapter) {
    const inferred = inferFrameworkFromFiles(files);
    if (inferred) {
      normAdapter = inferred;
    }
  }

  const taxonomy = FRAMEWORK_TAXONOMIES[normAdapter];

  if (taxonomy) {
    const { defs, showEmptySlots } = taxonomy;
    const buckets = new Map<string, string[]>(defs.map((d) => [d.name, []]));
    const unclaimed: string[] = [];

    // Sort definitions by explicit claim priority so tests/configs/pages win over generic .tsx
    const defsByClaimOrder = [...defs].sort((a, b) => a.claimOrder - b.claimOrder);

    for (const file of files) {
      const roleLower = (file.role || '').toLowerCase().trim();
      const norm = file.path.replace(/\\/g, '/');
      const base = norm.split('/').pop() || norm;

      let matchedDef: TaxonomyCategoryDef | undefined;

      // 1. Honor explicit role stored on the parsed file first
      if (roleLower) {
        matchedDef = defs.find((d) => d.roleAliases.includes(roleLower));
      }

      // 2. Otherwise match path conventions in safe priority order
      if (!matchedDef) {
        matchedDef = defsByClaimOrder.find((d) => d.matchesPath(file, norm, base));
      }

      if (matchedDef) {
        buckets.get(matchedDef.name)!.push(file.path);
      } else {
        unclaimed.push(file.path);
      }
    }

    const categories: FileCategory[] = [];
    for (const def of defs) {
      const matchedFiles = buckets.get(def.name) || [];
      if (showEmptySlots || matchedFiles.length > 0) {
        categories.push({
          id: def.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: def.name,
          color: def.color,
          count: matchedFiles.length,
          files: matchedFiles,
        });
      }
    }

    if (categories.length > 0 || showEmptySlots) {
      if (unclaimed.length > 0 || showEmptySlots) {
        categories.push({
          id: 'unclassified',
          name: 'Unclassified',
          color: DEFAULT_COLOR,
          count: unclaimed.length,
          files: unclaimed,
        });
      }
      return categories;
    }
  }

  // Universal fallback ('none'): extension-based categorization
  return categorizeByExtension(files);
}

/**
 * Categorizes files by file extension (Phase 4 baseline).
 */
function categorizeByExtension(files: ParsedFile[]): FileCategory[] {
  const map = new Map<string, string[]>();

  for (const file of files) {
    const ext = file.extension.toLowerCase();
    if (!map.has(ext)) {
      map.set(ext, []);
    }
    map.get(ext)!.push(file.path);
  }

  const PREFERRED_ORDER = ['.ts', '.tsx', '.js', '.mts', '.cjs'];
  const categories: FileCategory[] = [];

  for (const ext of PREFERRED_ORDER) {
    if (map.has(ext)) {
      const fileList = map.get(ext)!;
      categories.push({
        id: ext.replace('.', ''),
        name: ext,
        color: EXTENSION_COLORS[ext] || DEFAULT_COLOR,
        count: fileList.length,
        files: fileList,
      });
      map.delete(ext);
    }
  }

  const remaining = Array.from(map.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );

  for (const [ext, fileList] of remaining) {
    categories.push({
      id: ext.replace('.', '') || 'other',
      name: ext || 'other',
      color: EXTENSION_COLORS[ext] || DEFAULT_COLOR,
      count: fileList.length,
      files: fileList,
    });
  }

  return categories;
}
