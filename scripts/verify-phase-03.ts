/**
 * CodoGraph — Phase 3 Acceptance Verification Suite.
 *
 * Runs all 5 acceptance checks defined in docs/specs/phase-03.md:
 * 1. Self-parse: Files found, files parsed, files skipped, skip reasons, found === parsed + skipped.
 * 2. Folder granularity: Every file has a folder, distinct folder counts are granular.
 * 3. Barrel files & re-exports: Re-exports found vs re-exports resolved match 100%.
 * 4. Unresolved import: Renamed/missing target produces exactly one unresolved import with named reason.
 * 5. Serialization roundtrip: Write output to file, read back, all types and invariants hold.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseRepository } from '../lib/parser/index.ts';
import type { ParserResult } from '../lib/parser/index.ts';

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
  console.log('CodoGraph Phase 3 Parser Acceptance Suite');
  console.log('====================================================\n');

  const projectRoot = process.cwd();

  // --------------------------------------------------------------------------
  // Check 1: Self-Parse (This Project)
  // --------------------------------------------------------------------------
  console.log('--- Check 1: Self-Parse & Math Consistency ---');
  const selfResult = parseRepository(projectRoot);
  const { coverage, files, edges, folders } = selfResult;

  console.log(`  Files Found   : ${coverage.filesFound}`);
  console.log(`  Files Parsed  : ${coverage.filesParsed}`);
  console.log(`  Files Skipped : ${coverage.filesSkipped}`);
  console.log(`  Total Edges   : ${edges.length}`);

  assert(
    coverage.filesFound === coverage.filesParsed + coverage.filesSkipped,
    'Math invariant holds: filesFound === filesParsed + filesSkipped',
    `found=${coverage.filesFound}, parsed=${coverage.filesParsed}, skipped=${coverage.filesSkipped}`
  );

  assert(
    coverage.filesParsed > 0,
    'Parser discovered and parsed real TypeScript/JavaScript source files',
    `parsed=${coverage.filesParsed}`
  );

  assert(
    coverage.skippedFiles.every((s) => s.path && s.reason && s.reason.trim().length > 0),
    'Every skipped file has an explicit, non-empty named reason'
  );

  assert(
    Object.keys(coverage.skipReasons).length > 0,
    'Skip reasons are categorized and aggregated'
  );

  // --------------------------------------------------------------------------
  // Check 2: Folder Hierarchy & Granularity
  // --------------------------------------------------------------------------
  console.log('\n--- Check 2: Folder Hierarchy & Granularity ---');
  console.log(`  Distinct Folders Found: ${folders.length}`);

  assert(
    files.every((f) => f.folder !== undefined && f.folder !== null && typeof f.folder === 'string'),
    'Every parsed file carries the folder it belongs to'
  );

  assert(
    folders.length >= 5,
    'Folder groupings are granular (not collapsed to a single root)',
    `folders count = ${folders.length}`
  );

  // Verify that known subfolders exist
  const folderSet = new Set(folders);
  assert(
    folderSet.has('lib/parser') || folderSet.has('lib/auth') || folderSet.has('app/workspace') || folderSet.has('components'),
    'Subdirectory folders are properly identified without coarse truncation'
  );

  // --------------------------------------------------------------------------
  // Check 3: Barrel Files & Re-export Resolution
  // --------------------------------------------------------------------------
  console.log('\n--- Check 3: Barrel Files & Re-Export Resolution ---');
  const barrelFixtureDir = path.join(projectRoot, 'tmp', 'test-barrel-repo');
  fs.mkdirSync(path.join(barrelFixtureDir, 'src', 'core'), { recursive: true });
  fs.mkdirSync(path.join(barrelFixtureDir, 'src', 'utils'), { recursive: true });

  fs.writeFileSync(
    path.join(barrelFixtureDir, 'src', 'core', 'math.ts'),
    'export const add = (a: number, b: number) => a + b;\n'
  );
  fs.writeFileSync(
    path.join(barrelFixtureDir, 'src', 'core', 'index.ts'),
    "export * from './math';\n"
  );
  fs.writeFileSync(
    path.join(barrelFixtureDir, 'src', 'utils', 'string.ts'),
    'export const trim = (s: string) => s.trim();\n'
  );
  fs.writeFileSync(
    path.join(barrelFixtureDir, 'src', 'utils', 'index.ts'),
    "export { trim } from './string';\n"
  );
  fs.writeFileSync(
    path.join(barrelFixtureDir, 'src', 'index.ts'),
    "export * from './core';\nexport * as Utils from './utils';\nimport { add } from './core';\n"
  );

  const barrelResult = parseRepository(barrelFixtureDir);
  console.log(`  Barrel Re-exports Found    : ${barrelResult.coverage.reExportsTotal}`);
  console.log(`  Barrel Re-exports Resolved : ${barrelResult.coverage.reExportsResolvedInternal}`);

  assert(
    barrelResult.coverage.reExportsTotal === 4,
    'Found all 4 re-export declarations across barrel files',
    `got ${barrelResult.coverage.reExportsTotal}`
  );

  assert(
    barrelResult.coverage.reExportsTotal === barrelResult.coverage.reExportsResolvedInternal,
    'Re-exports found matches re-exports resolved 100% (zero gaps)',
    `found=${barrelResult.coverage.reExportsTotal}, resolved=${barrelResult.coverage.reExportsResolvedInternal}`
  );

  assert(
    barrelResult.coverage.importsUnresolved === 0,
    'Barrel repository has zero unresolved imports'
  );

  // --------------------------------------------------------------------------
  // Check 4: Unresolved Import Detection with Named Reasons
  // --------------------------------------------------------------------------
  console.log('\n--- Check 4: Unresolved Import Diagnostic Reporting ---');
  const renameFixtureDir = path.join(projectRoot, 'tmp', 'test-rename-repo');
  fs.mkdirSync(renameFixtureDir, { recursive: true });

  fs.writeFileSync(
    path.join(renameFixtureDir, 'target.ts'),
    'export const value = 42;\n'
  );
  fs.writeFileSync(
    path.join(renameFixtureDir, 'importer.ts'),
    "import { value } from './target';\nconsole.log(value);\n"
  );

  // Step 4a: Verify clean resolution before rename
  const preRename = parseRepository(renameFixtureDir);
  assert(preRename.coverage.importsUnresolved === 0, 'Pre-rename import resolves cleanly');

  // Step 4b: Rename target file so import becomes dangling
  fs.renameSync(
    path.join(renameFixtureDir, 'target.ts'),
    path.join(renameFixtureDir, 'target_renamed.ts')
  );

  const postRename = parseRepository(renameFixtureDir);
  console.log(`  Unresolved Imports Count: ${postRename.coverage.importsUnresolved}`);

  assert(
    postRename.coverage.importsUnresolved === 1,
    'Exactly one unresolved import detected after target rename',
    `got ${postRename.coverage.importsUnresolved}`
  );

  const unresolved = postRename.coverage.unresolvedDetails[0];
  assert(
    Boolean(unresolved && unresolved.specifier === './target'),
    'Unresolved item references the missing specifier "./target"'
  );

  assert(
    Boolean(unresolved && unresolved.reason && unresolved.reason.includes('does not exist on disk')),
    'Unresolved diagnostic names the exact failure reason ("does not exist on disk")',
    unresolved?.reason
  );

  // --------------------------------------------------------------------------
  // Check 5: Serialization Roundtrip & Type Retention
  // --------------------------------------------------------------------------
  console.log('\n--- Check 5: Serialization Contract & Type Retention ---');
  const tempOutputFile = path.join(projectRoot, 'tmp', 'contract-roundtrip.json');
  fs.mkdirSync(path.dirname(tempOutputFile), { recursive: true });

  fs.writeFileSync(tempOutputFile, JSON.stringify(selfResult, null, 2), 'utf8');
  assert(fs.existsSync(tempOutputFile), 'Contract data written to disk');

  const rawRead = fs.readFileSync(tempOutputFile, 'utf8');
  const parsedJson = JSON.parse(rawRead) as ParserResult;

  assert(
    Array.isArray(parsedJson.files) && parsedJson.files.length === selfResult.files.length,
    'Serialized file nodes count matches original memory representation'
  );

  assert(
    Array.isArray(parsedJson.edges) && parsedJson.edges.length === selfResult.edges.length,
    'Serialized edges count matches original memory representation'
  );

  assert(
    parsedJson.coverage.filesFound === selfResult.coverage.filesFound,
    'Coverage report retains integrity across serialization roundtrip'
  );

  // Validate properties on first file
  const sampleFile = parsedJson.files[0];
  const fileContractValid =
    sampleFile &&
    typeof sampleFile.path === 'string' &&
    typeof sampleFile.folder === 'string' &&
    typeof sampleFile.lines === 'number' &&
    typeof sampleFile.sizeBytes === 'number' &&
    typeof sampleFile.contentHash === 'string' &&
    typeof sampleFile.fanIn === 'number' &&
    typeof sampleFile.fanOut === 'number';

  assert(fileContractValid, 'ParsedFile schema contract fully holds in deserialized data');

  // Validate properties on first edge if edges exist
  if (parsedJson.edges.length > 0) {
    const sampleEdge = parsedJson.edges[0];
    const edgeContractValid =
      typeof sampleEdge.sourcePath === 'string' &&
      typeof sampleEdge.targetPath === 'string' &&
      typeof sampleEdge.kind === 'string' &&
      typeof sampleEdge.specifier === 'string';
    assert(edgeContractValid, 'ParsedEdge schema contract fully holds in deserialized data');
  }

  // Cleanup temporary fixtures
  try {
    fs.rmSync(path.join(projectRoot, 'tmp'), { recursive: true, force: true });
  } catch {}

  console.log('\n====================================================');
  console.log(`Results: ${passes} passed, ${fails} failed`);
  console.log('====================================================');

  if (fails > 0) {
    process.exit(1);
  }
}

runAcceptanceChecks().catch((err) => {
  console.error('[FATAL] Verification suite threw an unhandled exception:', err);
  process.exit(1);
});
