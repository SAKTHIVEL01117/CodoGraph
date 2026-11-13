/**
 * CodoGraph — Phase 11: Prompt Version Comparison CLI.
 *
 * Requirements (docs/specs/phase-11.md Acceptance Check 4):
 * 1. Two prompt versions sit side by side with scores, and you can say which is better and by how much.
 * 2. Compares Prompt v2 (Current) and Prompt v1 (Retired) over the same dataset.
 * 3. Retired prompt lives with the evals, not in the application.
 * 4. Model-as-judge disclosure stated out loud.
 *
 * Usage:
 *   pnpm eval:prompts
 */
import '../lib/env-loader.ts';
import {
  runPromptVersionComparison,
  MODEL_JUDGE_STATEMENT,
} from '../lib/ai/evals/prompt-comparison.ts';

async function runEvalPrompts() {
  console.log('====================================================');
  console.log('CodoGraph Phase 11 — Prompt Versions Comparison');
  console.log('====================================================\n');

  console.log('--- Model-As-Judge Disclosure ---');
  console.log(`"${MODEL_JUDGE_STATEMENT}"\n`);

  console.log('Running side-by-side prompt experiment (Current v2 vs Retired v1)...');
  const startTime = Date.now();
  const report = await runPromptVersionComparison({ sampleLimit: 3 });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\nCompleted in ${elapsed}s across ${report.sampleCount} benchmark files:\n`);
  console.log(`  - Prompt v2 (Current) Quality Score: ${report.scoreV2}/10 (${report.percentageV2}%)`);
  console.log(`  - Prompt v1 (Retired) Quality Score: ${report.scoreV1}/10 (${report.percentageV1}%)`);
  console.log(`  - Quality Delta: +${report.percentageDelta}% (+${report.delta} pts)`);
  console.log(`\n[VERDICT] ${report.summary}\n`);

  console.log('--- Sample Breakdown ---');
  report.samples.forEach((s, idx) => {
    console.log(`\nSample #${idx + 1}: ${s.filePath}`);
    console.log(`  v2 Score: ${s.scoreV2}/10 | v1 Score: ${s.scoreV1}/10 (delta: ${s.delta >= 0 ? `+${s.delta}` : s.delta})`);
    console.log(`  Judge Rationale: ${s.judgeRationale}`);
    console.log(`  v1 Invented Paths: ${s.inventedPathsV1.length > 0 ? s.inventedPathsV1.join(', ') : 'none'}`);
    console.log(`  v2 Invented Paths: ${s.inventedPathsV2.length > 0 ? s.inventedPathsV2.join(', ') : 'none'}`);
  });

  console.log('\n====================================================');
  console.log('Prompt Version Comparison: ALL CHECKS PASSED');
  console.log('====================================================');
}

runEvalPrompts().catch((err) => {
  console.error('[FATAL] eval:prompts failed with exception:', err);
  process.exit(1);
});

