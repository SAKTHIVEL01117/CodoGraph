#!/usr/bin/env node
/**
 * CodoGraph — Phase 3: Parser CLI Command.
 *
 * Runs the TypeScript AST parser against any repository on disk, prints a dense
 * developer terminal summary, and writes out the typed contract JSON if requested.
 *
 * Usage:
 *   node --experimental-strip-types scripts/parse.ts [directory] [--out <file.json>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseRepository } from '../lib/parser/index.ts';
import type { ParserResult } from '../lib/parser/index.ts';

function printHeader(title: string) {
  console.log('\n' + '='.repeat(60));
  console.log(` ${title}`);
  console.log('='.repeat(60));
}

function runCli() {
  const args = process.argv.slice(2);
  let targetDir = '.';
  let outputPath: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--out' || arg === '-o') {
      outputPath = args[++i];
    } else if (!arg.startsWith('-')) {
      targetDir = arg;
    }
  }

  const absTarget = path.resolve(process.cwd(), targetDir);
  console.log(`[CodoGraph Parser] Parsing repository: ${absTarget}`);

  const startMs = Date.now();
  let result: ParserResult;

  try {
    result = parseRepository(absTarget, {
      onProgress: (current, total) => {
        if (total > 50 && current % 25 === 0) {
          process.stdout.write(`\r[Parsing AST] ${current}/${total} files...`);
        }
      },
    });
  } catch (err) {
    console.error(`\n[FATAL] Parser execution failed:`, err);
    process.exit(1);
  }

  const durationMs = Date.now() - startMs;
  process.stdout.write('\r'.padEnd(40, ' ') + '\r');

  const { coverage, files, edges, folders } = result;

  // 1. Files Summary & Math Invariant Check
  printHeader('1. File Discovery & Structural Math');
  console.log(`Repository Root   : ${result.repositoryRoot}`);
  console.log(`Framework Adapter : ${result.adapter}`);
  console.log(`Execution Time    : ${durationMs}ms`);
  console.log(`Files Found       : ${coverage.filesFound}`);
  console.log(`Files Parsed      : ${coverage.filesParsed}`);
  console.log(`Files Skipped     : ${coverage.filesSkipped}`);

  const mathValid = coverage.filesFound === coverage.filesParsed + coverage.filesSkipped;
  console.log(`Math Invariant    : ${mathValid ? 'PASS (found === parsed + skipped)' : 'FAIL — math mismatch!'}`);

  console.log('\nSkip Reasons Breakdown:');
  for (const [reason, count] of Object.entries(coverage.skipReasons)) {
    console.log(`  - ${reason.padEnd(40)} : ${count}`);
  }

  // 2. Folder Granularity (Acceptance Check 2)
  printHeader('2. Folder Hierarchy & Granularity');
  console.log(`Distinct Folders  : ${folders.length}`);
  console.log('Sample Folders (first 10):');
  for (const folder of folders.slice(0, 10)) {
    console.log(`  / ${folder}`);
  }
  if (folders.length > 10) {
    console.log(`  ... and ${folders.length - 10} more`);
  }

  // 3. Import & Edge Resolution Coverage
  printHeader('3. Import, Re-export & Edge Coverage');
  console.log(`Total Edges (Deduplicated) : ${edges.length}`);
  console.log(`Total Imports Discovered   : ${coverage.importsTotal}`);
  console.log(`  - Internal (Resolved)    : ${coverage.importsResolvedInternal}`);
  console.log(`  - External Packages      : ${coverage.importsExternal}`);
  console.log(`  - Excluded Assets        : ${coverage.importsExcluded}`);
  console.log(`  - Unresolved             : ${coverage.importsUnresolved}`);

  console.log('\nRe-export Coverage (Barrel Files):');
  console.log(`  - Re-exports Total       : ${coverage.reExportsTotal}`);
  console.log(`  - Re-exports Resolved    : ${coverage.reExportsResolvedInternal}`);
  const reExportGap = coverage.reExportsTotal - coverage.reExportsResolvedInternal;
  console.log(`  - Re-export Resolution   : ${reExportGap === 0 ? '100% MATCH' : `${reExportGap} unresolved`}`);

  console.log('\nDynamic Import Coverage:');
  console.log(`  - Dynamic Imports Total  : ${coverage.dynamicImportsTotal}`);
  console.log(`  - Dynamic Resolved       : ${coverage.dynamicImportsResolvedInternal}`);

  if ((coverage.requiresTotal ?? 0) > 0) {
    console.log('\nCommonJS Require Coverage:');
    console.log(`  - Requires Total         : ${coverage.requiresTotal ?? 0}`);
    console.log(`  - Requires Resolved      : ${coverage.requiresResolvedInternal ?? 0}`);
  }

  const cjsExportFiles = files.filter((f) => Array.isArray(f.exports) && f.exports.length > 0);
  if (cjsExportFiles.length > 0) {
    console.log(`  - CommonJS Export Modules: ${cjsExportFiles.length}`);
  }

  // 4. Unresolved Diagnostics
  if (coverage.unresolvedDetails.length > 0) {
    printHeader('4. Unresolved Diagnostics (Explicit Reasons)');
    for (const item of coverage.unresolvedDetails.slice(0, 10)) {
      console.log(`[UNRESOLVED] ${item.sourcePath}`);
      console.log(`  Specifier : '${item.specifier}' (${item.kind})`);
      console.log(`  Reason    : ${item.reason}`);
    }
    if (coverage.unresolvedDetails.length > 10) {
      console.log(`... and ${coverage.unresolvedDetails.length - 10} more unresolved imports`);
    }
  } else {
    printHeader('4. Unresolved Diagnostics');
    console.log('Zero unresolved internal imports! Every non-external import was successfully resolved.');
  }

  // 5. Top Graph Hubs (Fan-in / Fan-out)
  printHeader('5. Graph Topology Sample');
  const sortedByFanIn = [...files].sort((a, b) => b.fanIn - a.fanIn).slice(0, 5);
  console.log('Top 5 Most Imported Files (Highest Fan-in):');
  for (const f of sortedByFanIn) {
    console.log(`  - ${f.path.padEnd(45)} : fan-in ${f.fanIn}, fan-out ${f.fanOut}`);
  }

  const sortedByFanOut = [...files].sort((a, b) => b.fanOut - a.fanOut).slice(0, 5);
  console.log('\nTop 5 Files with Most Dependencies (Highest Fan-out):');
  for (const f of sortedByFanOut) {
    console.log(`  - ${f.path.padEnd(45)} : fan-out ${f.fanOut}, fan-in ${f.fanIn}`);
  }

  // 6. Write output if requested
  if (outputPath) {
    const absOut = path.resolve(process.cwd(), outputPath);
    fs.mkdirSync(path.dirname(absOut), { recursive: true });
    fs.writeFileSync(absOut, JSON.stringify(result, null, 2), 'utf8');
    printHeader('6. Output Serialization');
    console.log(`Contract data written to: ${absOut}`);
    console.log(`File size: ${(fs.statSync(absOut).size / 1024).toFixed(1)} KB`);
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

runCli();
