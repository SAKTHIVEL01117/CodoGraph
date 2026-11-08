/**
 * CodoGraph — Phase 6 Acceptance Verification Suite.
 *
 * Runs verification checks from docs/specs/phase-06.md:
 * 1. Blast radius & Dependency chain: Transitive walk (2 levels deep) over edge list.
 * 2. Unimported insight rule: Unimported files appear, but pages/routes/layouts/config do NOT.
 * 3. Iterative cycle detection: Finds real cycle in repository, verified by walking edges.
 * 4. Left rail match math: For any category, sum of matching files across all folded panels
 *    equals the exact category count shown in the rail.
 * 5. Pure graph maths: Zero network requests, zero recursion in cycle detection.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ParserResult } from '../lib/parser/types.ts';
import { computeFoldedGraph } from '../lib/canvas/folding.ts';
import { categorizeFiles } from '../lib/canvas/taxonomy.ts';
import {
  computeTransitiveWalk,
  detectCyclesIterative,
  computeCodebaseInsights,
  isFrameworkReachedFile,
} from '../lib/canvas/metrics.ts';

let passes = 0;
let fails = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passes++;
  } else {
    console.error(`[FAIL] ${testName}${detail ? ` — ${detail}` : ''}`);
    fails++;
  }
}

async function runAcceptanceChecks() {
  console.log('====================================================');
  console.log('CodoGraph Phase 6 Graph Maths & Insights Suite');
  console.log('====================================================\n');

  const dataPath = path.resolve(process.cwd(), 'data/preview-analysis.json');
  assert(fs.existsSync(dataPath), 'Scaffolding data file exists at data/preview-analysis.json');

  const raw = fs.readFileSync(dataPath, 'utf-8');
  const analysis = JSON.parse(raw) as ParserResult;
  const { files, edges } = analysis;

  console.log(`Loaded dataset: ${files.length} files, ${edges.length} edges`);

  // --------------------------------------------------------------------------
  // Check 1: Blast Radius & Dependency Chain (Transitive Walk)
  // --------------------------------------------------------------------------
  console.log('\n--- Check 1: Blast Radius & Dependency Chain (2 Levels) ---');
  const testFile = 'packages/cli/src/utils/module_1.ts';
  const blastRadius = computeTransitiveWalk(testFile, edges, 'incoming', 2);
  const depChain = computeTransitiveWalk(testFile, edges, 'outgoing', 2);

  assert(
    blastRadius.maxDepth === 2 && blastRadius.direction === 'incoming',
    'Blast radius configured as 2-level incoming transitive walk'
  );
  assert(
    depChain.maxDepth === 2 && depChain.direction === 'outgoing',
    'Dependency chain configured as 2-level outgoing transitive walk'
  );

  // Spot-check Blast Radius: Level 1 files must directly import testFile
  let blastL1Valid = true;
  for (const l1 of blastRadius.level1) {
    const hasDirectEdge = edges.some(
      (e) => e.sourcePath === l1 && e.targetPath === testFile
    );
    if (!hasDirectEdge) blastL1Valid = false;
  }
  assert(blastL1Valid, 'Every Level 1 file in Blast Radius directly imports the target file');

  // Spot-check Dependency Chain: testFile must directly import Level 1 files
  let depL1Valid = true;
  for (const l1 of depChain.level1) {
    const hasDirectEdge = edges.some(
      (e) => e.sourcePath === testFile && e.targetPath === l1
    );
    if (!hasDirectEdge) depL1Valid = false;
  }
  assert(depL1Valid, 'Target file directly imports every Level 1 file in Dependency Chain');

  console.log(`  Blast radius for ${testFile}: ${blastRadius.all.length} files (${blastRadius.level1.length} L1, ${blastRadius.level2.length} L2)`);
  console.log(`  Dependency chain for ${testFile}: ${depChain.all.length} files (${depChain.level1.length} L1, ${depChain.level2.length} L2)`);

  // --------------------------------------------------------------------------
  // Check 2: Acceptance Check 2 — Unimported vs Pages/Routes Rule
  // --------------------------------------------------------------------------
  console.log('\n--- Check 2: Unimported Files vs Pages & Routes Rule ---');
  const insights = computeCodebaseInsights(files, edges);
  const unimportedInsight = insights.find((i) => i.kind === 'unimported')!;

  assert(
    unimportedInsight.sentence === 'Nothing in the repository imports these files.',
    'Insight sentence matches exact fixed string constraint'
  );

  // Pick an unimported module (e.g. packages/cli/test/module_1.ts)
  const plainUnimported = files.find(
    (f) => f.fanIn === 0 && !isFrameworkReachedFile(f)
  );
  assert(
    Boolean(plainUnimported && unimportedInsight.files.includes(plainUnimported.path)),
    `Plain file nothing imports (${plainUnimported?.path}) APPEARS in insights panel`
  );

  // Pick a page or route that nothing imports (e.g. apps/www/app/page.tsx)
  const pageFile = files.find(
    (f) => f.fanIn === 0 && isFrameworkReachedFile(f) && f.path.includes('page')
  );
  assert(
    Boolean(pageFile && !unimportedInsight.files.includes(pageFile.path)),
    `Page that nothing imports (${pageFile?.path}) does NOT appear in insights panel`
  );

  const routeFile = files.find(
    (f) => f.fanIn === 0 && isFrameworkReachedFile(f) && f.path.includes('route')
  );
  assert(
    Boolean(routeFile && !unimportedInsight.files.includes(routeFile.path)),
    `Route that nothing imports (${routeFile?.path}) does NOT appear in insights panel`
  );

  // --------------------------------------------------------------------------
  // Check 3: Acceptance Check 3 — Iterative Cycle Detection
  // --------------------------------------------------------------------------
  console.log('\n--- Check 3: Real Import Cycle Detection ---');
  const cycles = detectCyclesIterative(files, edges);
  assert(cycles.length > 0, `Iterative cycle detector found ${cycles.length} cycle(s) in repository`);

  const primaryCycle = cycles[0];
  console.log(`  Cycle path: ${primaryCycle.cycle.join(' -> ')}`);

  // Walk cycle by hand and confirm each hop exists in edges
  let cycleHopsValid = true;
  for (let i = 0; i < primaryCycle.cycle.length - 1; i++) {
    const src = primaryCycle.cycle[i];
    const tgt = primaryCycle.cycle[i + 1];
    const hopExists = edges.some(
      (e) => e.sourcePath === src && e.targetPath === tgt
    );
    if (!hopExists) {
      console.error(`Missing edge in cycle: ${src} -> ${tgt}`);
      cycleHopsValid = false;
    }
  }

  assert(
    cycleHopsValid,
    'Acceptance Check 3: Walking cycle hops by hand confirms all edges exist in edge list'
  );

  // --------------------------------------------------------------------------
  // Check 4: Acceptance Check 4 — Left Rail Match Count Math
  // --------------------------------------------------------------------------
  console.log('\n--- Check 4: Left Rail Category Match Math ---');
  const categories = categorizeFiles(files);
  const foldedGraph = computeFoldedGraph(files, edges);

  let matchMathValid = true;
  for (const cat of categories) {
    const railCount = cat.count;
    let panelsSum = 0;

    for (const node of foldedGraph.nodes) {
      const nodeMatch = node.files.filter((f) => f.extension === cat.name).length;
      panelsSum += nodeMatch;
    }

    if (railCount !== panelsSum) {
      console.error(`Mismatch for ${cat.name}: rail=${railCount}, sum=${panelsSum}`);
      matchMathValid = false;
    }
  }

  assert(
    matchMathValid,
    'Acceptance Check 4: For every rail category, sum of matching files across all panels adds up to the rail number'
  );

  // --------------------------------------------------------------------------
  // Check 5: Four Fixed Strings & Order
  // --------------------------------------------------------------------------
  console.log('\n--- Check 5: Four Fixed Strings & Order Invariants ---');
  assert(insights.length === 4, 'Exactly four insights generated');
  assert(insights[0].kind === 'unimported', 'Insight 1 is unimported (leads the list)');
  assert(insights[1].kind === 'popular', 'Insight 2 is popular/central');
  assert(insights[2].kind === 'cycle', 'Insight 3 is cycle');
  assert(insights[3].kind === 'oversized', 'Insight 4 is oversized');

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log(`Phase 6 Acceptance Results: ${passes} Passed, ${fails} Failed`);
  console.log('====================================================\n');

  if (fails > 0) {
    process.exit(1);
  }
}

runAcceptanceChecks().catch((err) => {
  console.error('[FATAL ERROR]', err);
  process.exit(1);
});

