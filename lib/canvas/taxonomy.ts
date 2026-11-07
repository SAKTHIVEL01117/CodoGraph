/**
 * CodoGraph — File Taxonomy & Categorization (Phase 4).
 *
 * Invariant: Taxonomy calculation is a pure function over ParsedFile[].
 * Groups repository files by extension/type matching the reference interface:
 * .ts, .tsx, .js, .mts, .cjs.
 */
import type { ParsedFile } from '@/lib/parser/types';

export interface FileCategory {
  id: string;
  name: string;
  color: string;
  count: number;
  files: string[];
}

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
 * Categorizes a list of parsed files by their file extensions,
 * sorting by count descending matching the reference canvas rail.
 */
export function categorizeFiles(files: ParsedFile[]): FileCategory[] {
  const map = new Map<string, string[]>();

  for (const file of files) {
    const ext = file.extension.toLowerCase();
    if (!map.has(ext)) {
      map.set(ext, []);
    }
    map.get(ext)!.push(file.path);
  }

  // Desired display order: .ts, .tsx, .js, .mts, .cjs, then any others by count
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

  // Any remaining extensions sorted by count descending
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
