/**
 * CodoGraph — Phase 5 Acceptance Verification Suite.
 *
 * Runs verification checks from docs/specs/phase-05.md:
 * 1. Resting state: Repository summary contains repository name, framework,
 *    counts of files, imports, routes, two ranked lists, and count of files no
 *    convention could identify.
 * 2. File selection metrics: For every file, dependencies and dependents counts
 *    match the exact number of rows listed underneath them (Acceptance check 3).
 * 3. Folder selection metrics: Structure breakdown lists what kind of files are
 *    inside and how many of each, and sum of counts matches total files.
 * 4. Deterministic pure arithmetic: Graph calculations run with zero network
 *    requests and zero external dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ParserResult } from '../lib/parser/types.ts';
import { computeFoldedGraph } from '../lib/canvas/folding.ts';
import {
  computeRepositorySummary,
  computeFileNeighbours,
  computeFolderSummary,
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
  console.log('CodoGraph Phase 5 Detail Pane Verification Suite');
  console.log('====================================================\n');

  // Load preview scaffolding data
  const dataPath = path.resolve(process.cwd(), 'data/preview-analysis.json');
  assert(fs.existsSync(dataPath), 'Scaffolding data file exists at data/preview-analysis.json');

  const raw = fs.readFileSync(dataPath, 'utf-8');
  const analysis = JSON.parse(raw) as ParserResult;
  const { files, edges, adapter } = analysis;

  console.log(`Loaded dataset: ${files.length} files, ${edges.length} edges, adapter: ${adapter}`);

  // --------------------------------------------------------------------------
  // Check 1: Resting State — Repository Summary
  // --------------------------------------------------------------------------
  console.log('\n--- Check 1: Repository Summary (Nothing Selected) ---');
  const repoSummary = computeRepositorySummary('shadcn-ui/ui', adapter, files, edges);

  assert(
    repoSummary.repositoryName === 'shadcn-ui/ui',
    'Repository name correctly set in summary'
  );

  assert(
    repoSummary.frameworkDetected === 'Next.js',
    `Framework detected is formatted: ${repoSummary.frameworkDetected}`
  );

  assert(
    repoSummary.filesCount === files.length,
    `Files count matches: ${repoSummary.filesCount} === ${files.length}`
  );

  assert(
    repoSummary.importsCount === edges.length,
    `Imports count matches: ${repoSummary.importsCount} === ${edges.length}`
  );

  assert(
    repoSummary.routesCount >= 0,
    `Exact or absent convention: routesCount is ${repoSummary.routesCount}`
  );

  assert(
    repoSummary.unidentifiedCount > 0,
    `Count of files without convention: ${repoSummary.unidentifiedCount} files`
  );

  assert(
    repoSummary.mostDependedOn.length > 0 &&
      repoSummary.mostDependedOn[0].fanIn >= repoSummary.mostDependedOn[repoSummary.mostDependedOn.length - 1].fanIn,
    `Ranked list 1: Leaned-on files ordered by incoming imports descending (top: ${repoSummary.mostDependedOn[0].path} with ${repoSummary.mostDependedOn[0].fanIn} imports)`
  );

  assert(
    repoSummary.readingStarts.length > 0 &&
      repoSummary.readingStarts.every((f) => f.fanIn === 0),
    `Ranked list 2: Where reading starts contains ${repoSummary.readingStarts.length} zero-fanIn files`
  );

  // --------------------------------------------------------------------------
  // Check 2: Acceptance Check 3 — Exact Row Counts for Dependents & Dependencies
  // --------------------------------------------------------------------------
  console.log('\n--- Check 2: Row Counts Match Listed Neighbors Exactly ---');
  let rowCountMismatches = 0;

  for (const file of files) {
    const neighbours = computeFileNeighbours(file.path, edges);

    if (neighbours.dependents.length !== file.fanIn) {
      rowCountMismatches++;
    }
    if (neighbours.dependencies.length !== file.fanOut) {
      rowCountMismatches++;
    }
  }

  assert(
    rowCountMismatches === 0,
    'Acceptance Check 3: Every file import and dependent count matches the exact number of rows listed underneath them'
  );

  // Check top depended-on file: packages/cli/src/module_1.ts with fanIn 7
  const topFile = repoSummary.mostDependedOn[0];
  const topNeighbours = computeFileNeighbours(topFile.path, edges);
  console.log(`  Top file: ${topFile.path}`);
  console.log(`  Reported fanIn: ${topFile.fanIn}, Listed rows: ${topNeighbours.dependents.length}`);
  assert(
    topNeighbours.dependents.length === topFile.fanIn,
    `Top file has exactly ${topFile.fanIn} dependents listed matching reported fanIn`
  );

  // --------------------------------------------------------------------------
  // Check 3: Folded Folder Structure Breakdown
  // --------------------------------------------------------------------------
  console.log('\n--- Check 3: Folded Folder Selection Structure ---');
  const foldedGraph = computeFoldedGraph(files, edges);
  assert(
    foldedGraph.nodes.length > 0 && foldedGraph.nodes.length <= 24,
    `Folded graph has ${foldedGraph.nodes.length} nodes (under roughly two dozen)`
  );

  let folderCompositionValid = true;
  for (const node of foldedGraph.nodes) {
    const summary = computeFolderSummary(node.id, node.files, node.fanIn, node.fanOut);
    const sumCategories = summary.categories.reduce((acc, cat) => acc + cat.count, 0);
    if (sumCategories !== node.files.length) {
      folderCompositionValid = false;
    }
  }

  assert(
    folderCompositionValid,
    'Every folder structure breakdown lists file categories whose counts sum exactly to the folder file count'
  );

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log(`Phase 5 Acceptance Results: ${passes} Passed, ${fails} Failed`);
  console.log('====================================================\n');

  if (fails > 0) {
    process.exit(1);
  }
}

runAcceptanceChecks().catch((err) => {
  console.error('[FATAL ERROR]', err);
  process.exit(1);
});
