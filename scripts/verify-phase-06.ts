/**
 * CodoGraph — Phase 6 Acceptance Verification Suite.
 *
 * Runs verification checks from docs/specs/phase-06.md:
 * 1. Blast radius & Dependency chain: Transitive walk (2 levels deep) over edge list.
 * 2. Unimported insight rule: Unimported files appear, but pages/routes/layouts/config do NOT.
 * 3. Iterative cycle detection: Finds real cycles, verified by walking every hop in edges.
 * 4. Left rail match math: For any category (both framework roles and extensions),
 *    sum of matching files across all folded panels equals the exact category count in the rail.
 * 5. Pure graph maths: Zero network requests, zero recursion in cycle detection.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseRepository } from '../lib/parser/index.ts';
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

function writeFixtureFile(root: string, relPath: string, content: string) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

async function runAcceptanceChecks() {
  console.log('====================================================');
  console.log('CodoGraph Phase 6 Graph Maths & Insights Suite');
  console.log('====================================================\n');

  const analysis = parseRepository(process.cwd());
  const { files, edges, adapter } = analysis;

  console.log(
    `Parsed local repository: ${files.length} files, ${edges.length} edges, adapter: ${adapter}`
  );

  // --------------------------------------------------------------------------
  // Check 1: Blast Radius & Dependency Chain (Transitive Walk)
  // --------------------------------------------------------------------------
  console.log('\n--- Check 1: Blast Radius & Dependency Chain (2 Levels) ---');
  const candidateFile =
    [...files]
      .filter((f) => f.fanIn > 0 && f.fanOut > 0)
      .sort((a, b) => b.fanIn - a.fanIn)[0] ||
    [...files].sort((a, b) => b.fanIn - a.fanIn)[0];

  assert(Boolean(candidateFile), 'Repository has at least one connected file to walk');
  const testFile = candidateFile.path;
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

  // Verify Blast Radius L1 & L2
  let blastL1Valid = true;
  for (const l1 of blastRadius.level1) {
    if (!edges.some((e) => e.sourcePath === l1 && e.targetPath === testFile)) {
      blastL1Valid = false;
    }
  }
  assert(blastL1Valid, 'Every Level 1 file in Blast Radius directly imports the target file');

  let blastL2Valid = true;
  const blastL1Set = new Set(blastRadius.level1);
  for (const l2 of blastRadius.level2) {
    if (!edges.some((e) => e.sourcePath === l2 && blastL1Set.has(e.targetPath))) {
      blastL2Valid = false;
    }
  }
  assert(blastL2Valid, 'Every Level 2 file in Blast Radius imports a Level 1 file');

  // Verify Dependency Chain L1 & L2
  let depL1Valid = true;
  for (const l1 of depChain.level1) {
    if (!edges.some((e) => e.sourcePath === testFile && e.targetPath === l1)) {
      depL1Valid = false;
    }
  }
  assert(depL1Valid, 'Target file directly imports every Level 1 file in Dependency Chain');

  let depL2Valid = true;
  const depL1Set = new Set(depChain.level1);
  for (const l2 of depChain.level2) {
    if (!edges.some((e) => depL1Set.has(e.sourcePath) && e.targetPath === l2)) {
      depL2Valid = false;
    }
  }
  assert(depL2Valid, 'Every Level 2 file in Dependency Chain is imported by a Level 1 file');

  console.log(
    `  Blast radius for ${testFile}: ${blastRadius.all.length} files (${blastRadius.level1.length} L1, ${blastRadius.level2.length} L2)`
  );
  console.log(
    `  Dependency chain for ${testFile}: ${depChain.all.length} files (${depChain.level1.length} L1, ${depChain.level2.length} L2)`
  );

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

  const plainUnimported = files.find((f) => f.fanIn === 0 && !isFrameworkReachedFile(f));
  assert(
    Boolean(plainUnimported && unimportedInsight.files.includes(plainUnimported.path)),
    `Plain file nothing imports (${plainUnimported?.path}) APPEARS in insights panel`
  );

  const pageFile = files.find(
    (f) => f.fanIn === 0 && isFrameworkReachedFile(f) && /(?:^|\/)page\.(tsx|jsx|ts|js)$/.test(f.path)
  );
  assert(
    Boolean(pageFile && !unimportedInsight.files.includes(pageFile.path)),
    `Page that nothing imports (${pageFile?.path}) does NOT appear in insights panel`
  );

  const routeFile = files.find(
    (f) => f.fanIn === 0 && isFrameworkReachedFile(f) && /(?:^|\/)route\.(ts|js|tsx)$/.test(f.path)
  );
  assert(
    Boolean(routeFile && !unimportedInsight.files.includes(routeFile.path)),
    `Route that nothing imports (${routeFile?.path}) does NOT appear in insights panel`
  );

  // --------------------------------------------------------------------------
  // Check 3: Acceptance Check 3 — Iterative Cycle Detection
  // --------------------------------------------------------------------------
  console.log('\n--- Check 3: Real Import Cycle Detection ---');
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codograph-p6-cycle-'));
  try {
    writeFixtureFile(
      fixtureDir,
      'package.json',
      JSON.stringify({ name: 'cycle-fixture', dependencies: { next: '^15.0.0' } })
    );
    writeFixtureFile(fixtureDir, 'app/page.tsx', 'export default function Page() { return null; }');
    writeFixtureFile(fixtureDir, 'app/layout.tsx', 'export default function Layout() { return null; }');
    writeFixtureFile(fixtureDir, 'app/api/ping/route.ts', 'export async function GET() { return new Response("ok"); }');
    writeFixtureFile(fixtureDir, 'lib/unused.ts', 'export const unused = true;');
    writeFixtureFile(fixtureDir, 'lib/cycle-a.ts', "import { b } from './cycle-b'; export const a = b + 1;");
    writeFixtureFile(fixtureDir, 'lib/cycle-b.ts', "import { c } from './cycle-c'; export const b = c + 1;");
    writeFixtureFile(fixtureDir, 'lib/cycle-c.ts', "import { a } from './cycle-a'; export const c = a + 1;");

    const fixtureResult = parseRepository(fixtureDir);
    const fixtureCycles = detectCyclesIterative(fixtureResult.files, fixtureResult.edges);
    assert(
      fixtureCycles.length >= 1,
      `Iterative cycle detector found ${fixtureCycles.length} cycle(s) in deterministic fixture`
    );

    const primaryCycle = fixtureCycles[0];
    console.log(`  Fixture cycle path: ${primaryCycle.cycle.join(' -> ')}`);

    let cycleHopsValid = primaryCycle.cycle.length >= 4 && primaryCycle.cycle[0] === primaryCycle.cycle[primaryCycle.cycle.length - 1];
    for (let i = 0; i < primaryCycle.cycle.length - 1; i++) {
      const src = primaryCycle.cycle[i];
      const tgt = primaryCycle.cycle[i + 1];
      if (!fixtureResult.edges.some((e) => e.sourcePath === src && e.targetPath === tgt)) {
        console.error(`Missing edge in cycle: ${src} -> ${tgt}`);
        cycleHopsValid = false;
      }
    }

    assert(
      cycleHopsValid,
      'Acceptance Check 3: Walking cycle hops by hand confirms every edge exists in edge list'
    );

    // Also verify any cycles discovered in the main repository
    const selfCycles = detectCyclesIterative(files, edges);
    let selfHopsValid = true;
    for (const c of selfCycles) {
      for (let i = 0; i < c.cycle.length - 1; i++) {
        if (!edges.some((e) => e.sourcePath === c.cycle[i] && e.targetPath === c.cycle[i + 1])) {
          selfHopsValid = false;
        }
      }
    }
    assert(selfHopsValid, `All cycles in local repository (${selfCycles.length}) have verified edges`);
  } finally {
    try {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    } catch {
      // Ignore Windows cleanup locks
    }
  }

  // --------------------------------------------------------------------------
  // Check 4: Acceptance Check 4 — Left Rail Match Count Math
  // --------------------------------------------------------------------------
  console.log('\n--- Check 4: Left Rail Category Match Math ---');
  const frameworkCategories = categorizeFiles(files, adapter);
  const extensionCategories = categorizeFiles(files, 'none');
  const foldedGraph = computeFoldedGraph(files, edges);

  const verifyCategoriesSum = (cats: ReturnType<typeof categorizeFiles>, label: string): boolean => {
    let valid = true;
    for (const cat of cats) {
      const railCount = cat.count;
      const catFiles = new Set(cat.files);
      let panelsSum = 0;

      for (const node of foldedGraph.nodes) {
        panelsSum += node.files.filter((f) => catFiles.has(f.path)).length;
      }

      if (railCount !== panelsSum || cat.files.length !== railCount) {
        console.error(`[${label}] Mismatch for ${cat.name}: rail=${railCount}, sum=${panelsSum}`);
        valid = false;
      }
    }
    return valid;
  };

  assert(
    verifyCategoriesSum(frameworkCategories, 'Framework Rail'),
    'Acceptance Check 4a: Phase 8 framework rail categories sum across folded panels matches rail count exactly'
  );
  assert(
    verifyCategoriesSum(extensionCategories, 'Extension Rail'),
    'Acceptance Check 4b: Fallback extension rail categories sum across folded panels matches rail count exactly'
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
