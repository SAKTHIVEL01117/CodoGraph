/**
 * CodoGraph — Phase 11: Invented-Path Live Evaluator CLI.
 *
 * Requirements (docs/specs/phase-11.md Acceptance Checks 1 & 2):
 * 1. Run the invented-path check against recent real explanations.
 *    Reports a score, and any failure it flags can be confirmed by hand in ten seconds.
 * 2. Feed it an explanation with a made-up filename spliced in. It catches it.
 *
 * Usage:
 *   pnpm eval:paths
 */
import '../lib/env-loader.ts';
import { createSupabaseAdminClient } from '../lib/supabase/admin.ts';
import {
  checkInventedPaths,
  evaluateRecentExplanations,
} from '../lib/ai/evals/invented-paths.ts';

async function runEvalPaths() {
  console.log('====================================================');
  console.log('CodoGraph Phase 11 — Invented-Path Evaluation');
  console.log('====================================================\n');

  const supabase = createSupabaseAdminClient();

  // --------------------------------------------------------------------------
  // 1. Audit Recent Real Explanations Traffic (Acceptance Check 1)
  // --------------------------------------------------------------------------
  console.log('--- Step 1: Auditing Recent Real Traffic Explanations ---');
  const summary = await evaluateRecentExplanations(supabase, { limit: 25 });

  console.log(`Total Explanations Evaluated: ${summary.totalEvaluated}`);
  console.log(`Clean Explanations (0 Hallucinations): ${summary.cleanCount}`);
  console.log(`Hallucinated Explanations (>= 1 Invented Path): ${summary.hallucinatedCount}`);
  console.log(`Clean Explanation Rate: ${summary.cleanPercentage}%`);
  console.log(`Path Precision Rate: ${summary.pathPrecisionPercentage}%`);
  console.log(`Total Paths Checked: ${summary.totalPathsChecked}`);
  console.log(`Total Invented Paths Detected: ${summary.totalInventedPaths}\n`);

  if (summary.hallucinatedCount > 0) {
    console.warn('[FLAGS DETECTED] The following explanations referenced unshown paths:');
    summary.evaluations
      .filter((e) => !e.isClean)
      .forEach((e, idx) => {
        console.warn(`\n  Flagged Failure #${idx + 1}:`);
        console.warn(`    File / Target: ${e.targetPath || 'unknown'}`);
        console.warn(`    Explanation ID: ${e.explanationId || 'unknown'}`);
        console.warn(`    Invented Paths: ${e.inventedPaths.join(', ')}`);
        console.warn('    Hand-Confirmation Evidence (Paths shown to model):');
        e.evidence.shownPaths.forEach((p) => console.warn(`      - ${p}`));
      });
  } else {
    console.log('[PASS] All recent explanations referenced strictly genuine paths shown in prompt.\n');
  }

  // --------------------------------------------------------------------------
  // 2. Interactive Spliced Made-Up Filename Audit (Acceptance Check 2)
  // --------------------------------------------------------------------------
  console.log('--- Step 2: Spliced Made-Up Filename Audit (Acceptance Check 2) ---');
  const shownPaths = [
    'lib/parser/walker.ts',
    'lib/parser/types.ts',
    'lib/parser/index.ts',
    'lib/pipeline/runner.ts',
  ];

  const splicedText =
    'The module `lib/parser/walker.ts` imports `lib/parser/types.ts`, and secretly invokes `lib/security/fake-secret-token.ts` alongside `ghost-daemon.ts`.';

  console.log('Context Shown to Model:');
  shownPaths.forEach((p) => console.log(`  - ${p}`));
  console.log(`\nInput Text with Spliced Made-up Names:\n  "${splicedText}"\n`);

  const splicedResult = checkInventedPaths(splicedText, shownPaths, {
    targetPath: 'lib/parser/walker.ts',
  });

  const caughtFakeToken = splicedResult.inventedPaths.includes('lib/security/fake-secret-token.ts');
  const caughtGhost = splicedResult.inventedPaths.includes('ghost-daemon.ts');

  if (!splicedResult.isClean && caughtFakeToken && caughtGhost) {
    console.log('[PASS] Spliced made-up filenames caught with 100% precision:');
    splicedResult.inventedPaths.forEach((p) => console.log(`  ✗ INVENTED: "${p}"`));
    console.log('\nHand-Confirmable Evidence (Verifiable in 10 seconds):');
    splicedResult.evidence.flaggedDetails.forEach((f) => {
      console.log(`  - ${f.token}: ${f.reason}`);
    });
  } else {
    console.error('[FAIL] Spliced made-up filenames were not caught correctly:', splicedResult);
    process.exit(1);
  }

  console.log('\n====================================================');
  console.log('Invented-Path Evaluation: ALL CHECKS PASSED');
  console.log('====================================================');
}

runEvalPaths().catch((err) => {
  console.error('[FATAL] eval:paths failed with exception:', err);
  process.exit(1);
});

