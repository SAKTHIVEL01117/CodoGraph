/**
 * Generates the typed scaffolding data file for Phase 4 canvas preview.
 * Matches the reference image exact figures:
 * Total: 687 files
 * - .ts: 339
 * - .tsx: 319
 * - .js: 25
 * - .mts: 3
 * - .cjs: 1
 *
 * Folder structure modeled on shadcn-ui/ui monorepo (apps/www, packages/cli, etc.)
 * with realistic dependency edges for deterministic folding and graph layout.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ParserResult, ParsedFile, ParsedEdge } from '../lib/parser/types';

const FOLDER_DISTRIBUTION: Array<{ folder: string; ts: number; tsx: number; js: number; mts: number; cjs: number }> = [
  // apps/www (UI documentation & registry site)
  { folder: 'apps/www/app', ts: 18, tsx: 32, js: 0, mts: 0, cjs: 0 },
  { folder: 'apps/www/components', ts: 24, tsx: 78, js: 0, mts: 0, cjs: 0 },
  { folder: 'apps/www/components/ui', ts: 12, tsx: 58, js: 0, mts: 0, cjs: 0 },
  { folder: 'apps/www/lib', ts: 36, tsx: 8, js: 2, mts: 0, cjs: 0 },
  { folder: 'apps/www/registry/default/ui', ts: 10, tsx: 48, js: 0, mts: 0, cjs: 0 },
  { folder: 'apps/www/registry/new-york/ui', ts: 10, tsx: 48, js: 0, mts: 0, cjs: 0 },
  { folder: 'apps/www/registry/default/example', ts: 8, tsx: 22, js: 0, mts: 0, cjs: 0 },
  { folder: 'apps/www/registry/new-york/example', ts: 8, tsx: 23, js: 0, mts: 0, cjs: 0 },
  { folder: 'apps/www/content', ts: 15, tsx: 0, js: 0, mts: 0, cjs: 0 },

  // packages/cli (shadcn CLI tool)
  { folder: 'packages/cli/src/commands', ts: 42, tsx: 0, js: 0, mts: 0, cjs: 0 },
  { folder: 'packages/cli/src/utils', ts: 38, tsx: 0, js: 2, mts: 1, cjs: 0 },
  { folder: 'packages/cli/src', ts: 16, tsx: 0, js: 1, mts: 0, cjs: 1 },
  { folder: 'packages/cli/test', ts: 22, tsx: 0, js: 4, mts: 0, cjs: 0 },

  // packages/shadcn (wrapper & presets)
  { folder: 'packages/shadcn/src', ts: 28, tsx: 0, js: 2, mts: 1, cjs: 0 },
  { folder: 'packages/shadcn/test', ts: 14, tsx: 0, js: 3, mts: 0, cjs: 0 },

  // tooling & scripts
  { folder: 'scripts', ts: 24, tsx: 0, js: 7, mts: 1, cjs: 0 },
  { folder: '.', ts: 14, tsx: 2, js: 4, mts: 0, cjs: 0 },
];

function generateDataset(): ParserResult {
  const files: ParsedFile[] = [];
  const edges: ParsedEdge[] = [];
  const foldersSet = new Set<string>();

  let fileIndex = 0;

  for (const group of FOLDER_DISTRIBUTION) {
    foldersSet.add(group.folder);

    const makeFiles = (count: number, ext: string) => {
      for (let i = 0; i < count; i++) {
        fileIndex++;
        let baseName = group.folder === '.' ? `root_file_${i + 1}` : `module_${i + 1}`;

        // Introduce canonical Next.js pages and routes in apps/www/app
        let role = ext === '.tsx' ? 'component' : group.folder.includes('commands') ? 'command' : 'module';
        if (group.folder === 'apps/www/app') {
          if (ext === '.tsx' && i === 0) {
            baseName = 'page';
            role = 'Page routes';
          } else if (ext === '.tsx' && i === 1) {
            baseName = 'docs/page';
            role = 'Page routes';
          } else if (ext === '.ts' && i === 0) {
            baseName = 'api/route';
            role = 'API endpoints';
          } else if (ext === '.ts' && i === 1) {
            baseName = 'actions';
            role = 'Server actions';
          }
        }

        const filePath = group.folder === '.' ? `${baseName}${ext}` : `${group.folder}/${baseName}${ext}`;

        files.push({
          path: filePath,
          folder: group.folder,
          extension: ext,
          lines: 20 + ((fileIndex * 17) % 350),
          sizeBytes: 400 + ((fileIndex * 89) % 8000),
          contentHash: `hash_${fileIndex}_${ext.replace('.', '')}`,
          isSourceCode: true,
          fanIn: 0,
          fanOut: 0,
          role,
        });
      }
    };

    makeFiles(group.ts, '.ts');
    makeFiles(group.tsx, '.tsx');
    makeFiles(group.js, '.js');
    makeFiles(group.mts, '.mts');
    makeFiles(group.cjs, '.cjs');
  }

  // Create realistic internal import edges between folders
  // apps/www/app -> apps/www/components -> apps/www/components/ui -> apps/www/lib
  // packages/cli/src/commands -> packages/cli/src/utils -> packages/cli/src
  const filesByFolder = new Map<string, ParsedFile[]>();
  for (const f of files) {
    if (!filesByFolder.has(f.folder)) filesByFolder.set(f.folder, []);
    filesByFolder.get(f.folder)!.push(f);
  }

  function linkFolders(fromFolder: string, toFolder: string, edgeCount: number) {
    const fromFiles = filesByFolder.get(fromFolder) || [];
    const toFiles = filesByFolder.get(toFolder) || [];
    if (fromFiles.length === 0 || toFiles.length === 0) return;

    for (let i = 0; i < edgeCount; i++) {
      const src = fromFiles[i % fromFiles.length];
      const tgt = toFiles[(i * 3) % toFiles.length];
      if (src.path !== tgt.path) {
        edges.push({
          sourcePath: src.path,
          targetPath: tgt.path,
          kind: 'import',
          specifier: `./${tgt.path}`,
        });
      }
    }
  }

  linkFolders('apps/www/app', 'apps/www/components', 45);
  linkFolders('apps/www/components', 'apps/www/components/ui', 60);
  linkFolders('apps/www/components', 'apps/www/lib', 35);
  linkFolders('apps/www/components/ui', 'apps/www/lib', 30);
  linkFolders('apps/www/registry/default/ui', 'apps/www/lib', 25);
  linkFolders('apps/www/registry/new-york/ui', 'apps/www/lib', 25);
  linkFolders('apps/www/registry/default/example', 'apps/www/registry/default/ui', 20);
  linkFolders('apps/www/registry/new-york/example', 'apps/www/registry/new-york/ui', 20);
  linkFolders('packages/cli/src/commands', 'packages/cli/src/utils', 40);
  linkFolders('packages/cli/src/commands', 'packages/cli/src', 20);
  linkFolders('packages/cli/src/utils', 'packages/cli/src', 18);
  linkFolders('packages/shadcn/src', 'packages/cli/src/utils', 15);
  linkFolders('scripts', 'packages/cli/src/utils', 10);

  // Introduce a real 3-hop import cycle in packages/cli/src (Acceptance Check 3)
  const c1 = 'packages/cli/src/module_4.ts';
  const c2 = 'packages/cli/src/module_5.ts';
  const c3 = 'packages/cli/src/module_6.ts';
  edges.push(
    { sourcePath: c1, targetPath: c2, kind: 'import', specifier: './module_5' },
    { sourcePath: c2, targetPath: c3, kind: 'import', specifier: './module_6' },
    { sourcePath: c3, targetPath: c1, kind: 'import', specifier: './module_4' }
  );

  // Compute fan-in and fan-out
  const inCount = new Map<string, number>();
  const outCount = new Map<string, number>();
  for (const e of edges) {
    outCount.set(e.sourcePath, (outCount.get(e.sourcePath) || 0) + 1);
    inCount.set(e.targetPath, (inCount.get(e.targetPath) || 0) + 1);
  }

  for (const f of files) {
    f.fanIn = inCount.get(f.path) || 0;
    f.fanOut = outCount.get(f.path) || 0;
  }

  return {
    repositoryRoot: 'shadcn-ui/ui',
    timestamp: new Date().toISOString(),
    adapter: 'nextjs',
    files,
    edges,
    folders: Array.from(foldersSet).sort(),
    routes: [
      { method: 'GET', pattern: '/', filePath: 'apps/www/app/page.tsx', framework: 'nextjs' },
      { method: 'GET', pattern: '/docs', filePath: 'apps/www/app/docs/page.tsx', framework: 'nextjs' },
      { method: 'GET', pattern: '/api', filePath: 'apps/www/app/api/route.ts', framework: 'nextjs' },
      { method: 'POST', pattern: '/api', filePath: 'apps/www/app/api/route.ts', framework: 'nextjs' },
    ],
    coverage: {
      filesFound: 687,
      filesParsed: 687,
      filesSkipped: 0,
      skipReasons: {},
      skippedFiles: [],
      importsTotal: edges.length + 120,
      importsResolvedInternal: edges.length,
      importsExternal: 120,
      importsExcluded: 0,
      importsUnresolved: 0,
      reExportsTotal: 15,
      reExportsResolvedInternal: 15,
      dynamicImportsTotal: 0,
      dynamicImportsResolvedInternal: 0,
      unresolvedDetails: [],
    },
  };
}

const data = generateDataset();
const outPath = path.resolve(process.cwd(), 'data/preview-analysis.json');
fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
console.log(`Generated preview data: ${data.files.length} files, ${data.edges.length} edges.`);
