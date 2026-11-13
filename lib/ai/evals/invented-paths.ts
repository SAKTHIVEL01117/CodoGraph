/**
 * CodoGraph — Phase 11: Deterministic Invented-Path Live Evaluator.
 *
 * Requirements & Constraints:
 * 1. Deterministic set membership code, NOT a model grading a model.
 *    A hallucination detector that hallucinates is worth nothing.
 * 2. Extracts every path-shaped token in an explanation.
 * 3. Tests candidates against the EXACT set of paths the model was shown.
 *    Anything else was invented.
 * 4. Runs as a live evaluator against real traffic, and against saved/database traffic.
 * 5. Returns hand-confirmable evidence for any flagged violation.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

// Common repository source file extensions
const SOURCE_FILE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'json',
  'css',
  'scss',
  'sql',
  'html',
  'md',
  'py',
  'yml',
  'yaml',
  'env',
  'svg',
  'graphql',
  'gql',
  'toml',
]);

// Non-file package imports and protocols to ignore
const IGNORED_PREFIXES = [
  'http://',
  'https://',
  'node:',
  '@clerk/',
  '@supabase/',
  '@tailwindcss/',
  'next/',
  'react',
  'openai',
  'langsmith',
];

export interface InventedPathEvalResult {
  explanationId?: string;
  targetPath?: string;
  totalPathsMentioned: number;
  validPaths: string[];
  inventedPaths: string[];
  isClean: boolean;
  score: number; // 1.0 (perfect) down to 0.0 (all invented)
  evidence: {
    shownPaths: string[];
    flaggedDetails: Array<{
      token: string;
      reason: string;
    }>;
  };
}

export interface TrafficEvalSummary {
  totalEvaluated: number;
  cleanCount: number;
  hallucinatedCount: number;
  cleanPercentage: number;
  pathPrecisionPercentage: number;
  totalPathsChecked: number;
  totalInventedPaths: number;
  evaluations: InventedPathEvalResult[];
}

/**
 * Normalizes a path string: converts backslashes to forward slashes,
 * strips leading/trailing slashes and relative `./`.
 */
export function normalizePath(p: string): string {
  if (!p) return '';
  return p
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/**
 * Extracts candidate path-shaped tokens from an explanation string.
 * Inspects both inline code backticks `...` and whitespace-separated prose tokens.
 */
export function extractPathTokens(text: string): string[] {
  if (!text || typeof text !== 'string') return [];

  const candidates = new Set<string>();

  // 1. Extract tokens enclosed in backticks: `path/to/file.ts`
  const backtickMatches = text.match(/`([^`\n]+)`/g) || [];
  for (const match of backtickMatches) {
    const raw = match.slice(1, -1).trim();
    if (isCandidatePath(raw)) {
      candidates.add(cleanToken(raw));
    }
  }

  // 2. Extract tokens from whitespace-separated prose
  const words = text.split(/\s+/);
  for (const word of words) {
    const cleaned = cleanToken(word);
    if (isCandidatePath(cleaned)) {
      candidates.add(cleaned);
    }
  }

  return Array.from(candidates);
}

/**
 * Cleans surrounding punctuation from a token.
 */
function cleanToken(token: string): string {
  return token
    .trim()
    .replace(/^[`'"(\[{<]+/, '')
    .replace(/[`'")\]}>.,;:!?]+$/, '');
}

/**
 * Tests whether a string token has the shape of a file or folder path.
 */
function isCandidatePath(token: string): boolean {
  if (!token || token.length < 2 || token.length > 250) return false;

  // Ignore URLs and standard packages
  for (const prefix of IGNORED_PREFIXES) {
    if (token.startsWith(prefix) || token === prefix) return false;
  }

  // Ignore purely numbers or semver (e.g. 1.0.0)
  if (/^\d+(\.\d+)*$/.test(token)) return false;

  // Check if token contains path slashes
  const hasSlash = token.includes('/');
  if (hasSlash) {
    // Exclude MIME types (e.g. application/json, text/plain)
    if (token.startsWith('application/') || token.startsWith('text/') || token.startsWith('image/')) {
      return false;
    }
    // Exclude markdown headings or math division
    if (/^[#\+\-\*\/\s]+$/.test(token)) return false;
    return true;
  }

  // Check if token has a known file extension (e.g. types.ts, walker.ts)
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx > 0 && dotIdx < token.length - 1) {
    const ext = token.slice(dotIdx + 1).toLowerCase();
    if (SOURCE_FILE_EXTENSIONS.has(ext)) {
      return true;
    }
  }

  return false;
}

/**
 * Builds lookup indexes from the set of paths shown to the model.
 */
function buildShownPathIndexes(shownPaths: Iterable<string>) {
  const exactSet = new Set<string>();
  const basenameMap = new Map<string, string>();
  const directorySet = new Set<string>();

  for (const raw of shownPaths) {
    const norm = normalizePath(raw);
    if (!norm) continue;

    exactSet.add(norm);

    // Extract basename
    const lastSlash = norm.lastIndexOf('/');
    const basename = lastSlash !== -1 ? norm.slice(lastSlash + 1) : norm;
    if (basename) {
      basenameMap.set(basename, norm);
    }

    // Extract all directory prefixes
    let dir = norm;
    while (true) {
      const idx = dir.lastIndexOf('/');
      if (idx === -1) break;
      dir = dir.slice(0, idx);
      if (dir) {
        directorySet.add(dir);
      }
    }
  }

  return { exactSet, basenameMap, directorySet };
}

/**
 * Deterministic Invented-Path Checker.
 *
 * Compares every path-shaped token in `explanation` against `shownPaths`.
 * Strictly exact set membership: if a token cannot be matched to a shown path,
 * it was invented by the model.
 */
export function checkInventedPaths(
  explanation: string,
  shownPaths: Iterable<string>,
  options: { explanationId?: string; targetPath?: string } = {}
): InventedPathEvalResult {
  const normalizedShown = Array.from(shownPaths).map(normalizePath).filter(Boolean);
  const { exactSet, basenameMap, directorySet } = buildShownPathIndexes(normalizedShown);

  const tokens = extractPathTokens(explanation);
  const validPaths: string[] = [];
  const inventedPaths: string[] = [];
  const flaggedDetails: Array<{ token: string; reason: string }> = [];

  for (const rawToken of tokens) {
    const normToken = normalizePath(rawToken);
    if (!normToken) continue;

    // 1. Exact match against shown path
    if (exactSet.has(normToken)) {
      validPaths.push(normToken);
      continue;
    }

    // 2. Basename match (model referred to a shown file by filename alone, e.g. `types.ts`)
    if (!normToken.includes('/') && basenameMap.has(normToken)) {
      validPaths.push(normToken);
      continue;
    }

    // 3. Directory match (model referred to a folder shown, e.g. `lib/parser`)
    if (directorySet.has(normToken)) {
      validPaths.push(normToken);
      continue;
    }

    // Otherwise: this path was never shown to the model — it was INVENTED
    inventedPaths.push(normToken);
    flaggedDetails.push({
      token: normToken,
      reason: `Path "${normToken}" was referenced in explanation but was never in the prompt's dependencies, dependents, or target context.`,
    });
  }

  const total = validPaths.length + inventedPaths.length;
  const isClean = inventedPaths.length === 0;
  const score = total === 0 ? 1.0 : Number((validPaths.length / total).toFixed(4));

  return {
    explanationId: options.explanationId,
    targetPath: options.targetPath,
    totalPathsMentioned: total,
    validPaths,
    inventedPaths,
    isClean,
    score,
    evidence: {
      shownPaths: normalizedShown,
      flaggedDetails,
    },
  };
}

/**
 * Runs the invented-path check over recent real explanations in the database.
 * Reconstructs the exact paths shown to the model for each explanation.
 */
export async function evaluateRecentExplanations(
  supabase: SupabaseClient,
  options: { limit?: number; orgId?: string; analysisId?: string } = {}
): Promise<TrafficEvalSummary> {
  const limit = options.limit ?? 25;

  let query = supabase
    .from('explanations')
    .select('id, analysis_id, org_id, file_path, is_folder, content, content_hash, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options.analysisId) {
    query = query.eq('analysis_id', options.analysisId);
  } else if (options.orgId) {
    query = query.eq('org_id', options.orgId);
  }

  const { data: explanationRows, error } = await query;
  if (error) {
    throw new Error(`[CodoGraph Evals] Failed fetching recent explanations: ${error.message}`);
  }

  const rows = explanationRows || [];
  const evaluations: InventedPathEvalResult[] = [];
  let totalPathsChecked = 0;
  let totalInventedPaths = 0;
  let cleanCount = 0;

  for (const row of rows) {
    const analysisId = row.analysis_id;
    const targetPath = row.file_path;
    const isFolder = row.is_folder;

    const shownPaths = new Set<string>();
    shownPaths.add(targetPath);

    if (isFolder) {
      // Reconstruct folder context: files in folder, fanIn edges, fanOut edges
      const { data: files } = await supabase
        .from('files')
        .select('path')
        .eq('analysis_id', analysisId);

      const filesInFolder = (files || []).filter(
        (f) => f.path.startsWith(`${targetPath}/`) || f.path === targetPath
      );
      filesInFolder.forEach((f) => shownPaths.add(f.path));

      const { data: edges } = await supabase
        .from('edges')
        .select('source_path, target_path')
        .eq('analysis_id', analysisId);

      for (const edge of edges || []) {
        if (shownPaths.has(edge.source_path)) shownPaths.add(edge.target_path);
        if (shownPaths.has(edge.target_path)) shownPaths.add(edge.source_path);
      }
    } else {
      // Reconstruct file context: dependencies and dependents from edges
      const [depsRes, depOnRes] = await Promise.all([
        supabase
          .from('edges')
          .select('target_path')
          .eq('analysis_id', analysisId)
          .eq('source_path', targetPath),
        supabase
          .from('edges')
          .select('source_path')
          .eq('analysis_id', analysisId)
          .eq('target_path', targetPath),
      ]);

      (depsRes.data || []).forEach((d) => shownPaths.add(d.target_path));
      (depOnRes.data || []).forEach((d) => shownPaths.add(d.source_path));
    }

    const evalResult = checkInventedPaths(row.content, shownPaths, {
      explanationId: row.id,
      targetPath,
    });

    evaluations.push(evalResult);
    totalPathsChecked += evalResult.totalPathsMentioned;
    totalInventedPaths += evalResult.inventedPaths.length;
    if (evalResult.isClean) {
      cleanCount++;
    }
  }

  const totalEvaluated = evaluations.length;
  const hallucinatedCount = totalEvaluated - cleanCount;
  const cleanPercentage =
    totalEvaluated === 0
      ? 100
      : Number(((cleanCount / totalEvaluated) * 100).toFixed(1));
  const validPathsCount = totalPathsChecked - totalInventedPaths;
  const pathPrecisionPercentage =
    totalPathsChecked === 0
      ? 100
      : Number(((validPathsCount / totalPathsChecked) * 100).toFixed(1));

  return {
    totalEvaluated,
    cleanCount,
    hallucinatedCount,
    cleanPercentage,
    pathPrecisionPercentage,
    totalPathsChecked,
    totalInventedPaths,
    evaluations,
  };
}

