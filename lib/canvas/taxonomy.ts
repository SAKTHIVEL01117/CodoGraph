/**
 * CodoGraph — File Taxonomy & Categorization (Phase 4 & Phase 8).
 *
 * Implements Phase 8 framework-reshaped taxonomy:
 * - Next.js: Page routes, API endpoints, Server actions (routable surfaces first).
 * - NestJS: Controllers, Services, Modules, Entities (routable first, layers behind, plumbing).
 * - React: Views, Components, Hooks, Contexts.
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
  matches: (f: ParsedFile) => boolean;
}

const FRAMEWORK_TAXONOMIES: Record<string, TaxonomyCategoryDef[]> = {
  nextjs: [
    {
      name: 'Page routes',
      color: '#38bdf8', // sky-400
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'page routes' || r === 'page' || r === 'pages' || r === 'page_route') return true;
        const norm = f.path.replace(/\\/g, '/');
        return (
          /(?:^|\/)(?:src\/)?app\/(?:.*\/)?page\.(tsx|jsx|js|ts)$/.test(norm) ||
          /(?:^|\/)(?:src\/)?pages\/(?!api\/)(?!_).+\.(tsx|jsx|js|ts)$/.test(norm)
        );
      },
    },
    {
      name: 'API endpoints',
      color: '#ec4899', // pink-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'api endpoints' || r === 'route' || r === 'route_handler' || r === 'api_endpoint' || r === 'api') {
          return true;
        }
        const norm = f.path.replace(/\\/g, '/');
        return (
          /(?:^|\/)(?:src\/)?app\/(?:.*\/)?route\.(ts|js)$/.test(norm) ||
          /(?:^|\/)(?:src\/)?pages\/api\/.+\.(ts|js|tsx|jsx)$/.test(norm)
        );
      },
    },
    {
      name: 'Server actions',
      color: '#a855f7', // purple-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'server actions' || r === 'server_action' || r === 'action' || r === 'actions') {
          return true;
        }
        const norm = f.path.replace(/\\/g, '/');
        return /(?:^|\/)(?:.+\.)?actions?\.(ts|js)$/.test(norm) || /(?:^|\/)actions\/.+\.(ts|js)$/.test(norm);
      },
    },
    {
      name: 'Components',
      color: '#10b981', // emerald-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'components' || r === 'component') return true;
        const norm = f.path.replace(/\\/g, '/');
        return /(?:^|\/)components\/.+\.(tsx|jsx)$/.test(norm);
      },
    },
    {
      name: 'Layouts',
      color: '#f59e0b', // amber-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'layouts' || r === 'layout') return true;
        const norm = f.path.replace(/\\/g, '/');
        return /(?:^|\/)(?:src\/)?app\/(?:.*\/)?layout\.(tsx|jsx|js|ts)$/.test(norm);
      },
    },
    {
      name: 'Middleware',
      color: '#06b6d4', // cyan-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'middleware') return true;
        const norm = f.path.replace(/\\/g, '/');
        return /(?:^|\/)(?:src\/)?middleware\.(ts|js)$/.test(norm);
      },
    },
    {
      name: 'Config',
      color: '#64748b', // slate-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'config') return true;
        return /next\.config\.(js|mjs|ts|cjs)$/.test(f.path);
      },
    },
  ],
  nestjs: [
    {
      name: 'Controllers',
      color: '#38bdf8', // sky-400
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'controllers' || r === 'controller') return true;
        return /\.controller\.(ts|js)$/.test(f.path);
      },
    },
    {
      name: 'Services',
      color: '#10b981', // emerald-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'services' || r === 'service') return true;
        return /\.service\.(ts|js)$/.test(f.path);
      },
    },
    {
      name: 'Modules',
      color: '#ec4899', // pink-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'modules' || r === 'module') return true;
        return /\.module\.(ts|js)$/.test(f.path);
      },
    },
    {
      name: 'Entities',
      color: '#f59e0b', // amber-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'entities' || r === 'entity') return true;
        return /\.entity\.(ts|js)$/.test(f.path);
      },
    },
    {
      name: 'Guards',
      color: '#8b5cf6', // violet-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'guards' || r === 'guard') return true;
        return /\.guard\.(ts|js)$/.test(f.path);
      },
    },
    {
      name: 'Pipes',
      color: '#06b6d4', // cyan-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'pipes' || r === 'pipe') return true;
        return /\.pipe\.(ts|js)$/.test(f.path);
      },
    },
    {
      name: 'Interceptors',
      color: '#eab308', // yellow-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'interceptors' || r === 'interceptor') return true;
        return /\.interceptor\.(ts|js)$/.test(f.path);
      },
    },
    {
      name: 'DTOs',
      color: '#64748b', // slate-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'dtos' || r === 'dto') return true;
        return /\.dto\.(ts|js)$/.test(f.path);
      },
    },
    {
      name: 'Gateways',
      color: '#f43f5e', // rose-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'gateways' || r === 'gateway') return true;
        return /\.gateway\.(ts|js)$/.test(f.path);
      },
    },
    {
      name: 'Middleware',
      color: '#14b8a6', // teal-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'middleware') return true;
        return /\.middleware\.(ts|js)$/.test(f.path);
      },
    },
  ],
  react: [
    {
      name: 'Views',
      color: '#38bdf8', // sky-400
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'views' || r === 'view' || r === 'page' || r === 'pages') return true;
        return /(?:^|\/)(?:views|pages)\/.+\.(tsx|jsx|js|ts)$/.test(f.path);
      },
    },
    {
      name: 'Components',
      color: '#ec4899', // pink-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'components' || r === 'component') return true;
        return (
          /(?:^|\/)components?\/.+\.(tsx|jsx)$/.test(f.path) ||
          f.extension === '.tsx' ||
          f.extension === '.jsx'
        );
      },
    },
    {
      name: 'Hooks',
      color: '#10b981', // emerald-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'hooks' || r === 'hook') return true;
        return (
          /(?:^|\/)hooks\/.+\.(ts|js|tsx|jsx)$/.test(f.path) ||
          /^use[A-Z].*\.(ts|js|tsx|jsx)$/.test(f.path.split('/').pop() || '')
        );
      },
    },
    {
      name: 'Contexts',
      color: '#a855f7', // purple-500
      matches: (f) => {
        const r = (f.role || '').toLowerCase();
        if (r === 'contexts' || r === 'context') return true;
        return (
          /(?:^|\/)contexts?\/.+\.(ts|js|tsx|jsx)$/.test(f.path) ||
          /(?:context|provider)\.(ts|js|tsx|jsx)$/i.test(f.path)
        );
      },
    },
  ],
};

const EXTENSION_COLORS: Record<string, string> = {
  '.ts': '#38bdf8', // sky-400
  '.tsx': '#ec4899', // pink-500
  '.js': '#f97316', // orange-500
  '.mts': '#818cf8', // indigo-400
  '.cjs': '#94a3b8', // slate-400
  '.jsx': '#a855f7', // purple-500
  '.mjs': '#eab308', // yellow-500
};

const DEFAULT_COLOR = '#64748b'; // slate-500

/**
 * Infers framework from file layout if adapter is 'standard', 'none', or empty.
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
      /(?:^|\/)app\/(?:.*\/)?route\.(ts|js)$/.test(f.path) ||
      /(?:^|\/)pages\/.+\.(tsx|jsx|js|ts)$/.test(f.path) ||
      /next\.config\.(js|mjs|ts|cjs)$/.test(f.path) ||
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

  // If adapterName is generic or standard, see if framework can be inferred from files
  if (normAdapter === 'standard' || normAdapter === 'none' || !normAdapter) {
    const inferred = inferFrameworkFromFiles(files);
    if (inferred && normAdapter !== 'none') {
      normAdapter = inferred;
    }
  }

  const frameworkDefs = FRAMEWORK_TAXONOMIES[normAdapter];

  // If a framework taxonomy exists:
  if (frameworkDefs) {
    const categories: FileCategory[] = [];
    const claimedPaths = new Set<string>();

    for (const def of frameworkDefs) {
      const matchingFiles: string[] = [];

      for (const file of files) {
        if (!claimedPaths.has(file.path) && def.matches(file)) {
          matchingFiles.push(file.path);
          claimedPaths.add(file.path);
        }
      }

      if (matchingFiles.length > 0) {
        categories.push({
          id: def.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: def.name,
          color: def.color,
          count: matchingFiles.length,
          files: matchingFiles,
        });
      }
    }

    // If framework categories were produced, group any remaining unclaimed files
    // by their file extension at the bottom of the rail (plumbing)
    if (categories.length > 0) {
      const remainingFiles = files.filter((f) => !claimedPaths.has(f.path));
      if (remainingFiles.length > 0) {
        const extCategories = categorizeByExtension(remainingFiles);
        categories.push(...extCategories);
      }
      return categories;
    }
  }

  // Universal fallback: extension-based categorization
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
