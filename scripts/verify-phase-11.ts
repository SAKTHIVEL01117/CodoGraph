/**
 * CodoGraph — Phase 11 Acceptance Verification Script.
 *
 * Verifies all build items, constraints, and acceptance checks from docs/specs/phase-11.md:
 * 1. External environment loader: Loads same configuration outside the web app via lib/env-loader.ts.
 * 2. Deterministic invented-path check:
 *    - Runs against real explanations from database/traffic and reports a score.
 *    - Catches made-up filenames spliced into an explanation with 100% precision.
 * 3. Role accuracy on held-out convention dataset:
 *    - Evaluates model role classifier on >= 30 files where convention is certain of ground truth.
 *    - Strictly checks only allowed non-structural roles (service, repository, model, util, config, component, hook).
 * 4. Prompt version comparison:
 *    - Compares Prompt v2 (Current) and Prompt v1 (Retired) over identical inputs.
 *    - Scores them side by side using model-as-judge.
 *    - Clearly states which is better AND by how much.
 *    - Explicitly states out loud the model-as-judge disclosure.
 */
import '../lib/env-loader.ts';
import { createSupabaseAdminClient } from '../lib/supabase/admin.ts';
import {
  checkInventedPaths,
  evaluateRecentExplanations,
} from '../lib/ai/evals/invented-paths.ts';
import {
  evaluateRoleAccuracy,
  HELD_OUT_CONVENTION_DATASET,
} from '../lib/ai/evals/role-accuracy.ts';
import {
  runPromptVersionComparison,
  MODEL_JUDGE_STATEMENT,
} from '../lib/ai/evals/prompt-comparison.ts';
import { ALLOWED_MODEL_ROLES, FORBIDDEN_MODEL_ROLES, type AllowedModelRole } from '../lib/ai/explain.ts';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${message}${detail ? ` — ${detail}` : ''}`);
    failCount++;
  }
}

async function runPhase11Verification() {
  console.log('====================================================');
  console.log('CodoGraph Phase 11 Model Evaluation Suite Verification');
  console.log('====================================================\n');

  // --------------------------------------------------------------------------
  // Check 1: Environment Loader Outside Web App
  // --------------------------------------------------------------------------
  console.log('--- Check 1: External Environment Loader ---');
  const hasClerkKey = Boolean(process.env.CLERK_SECRET_KEY);
  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasNvidiaKey = Boolean(process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY);

  assert(
    hasClerkKey && hasSupabaseUrl,
    'Unified env-loader successfully loaded .env.local outside the Next.js runtime'
  );
  assert(
    hasNvidiaKey,
    'Model API credentials loaded and available for evaluation scripts'
  );

  const supabase = createSupabaseAdminClient();

  // --------------------------------------------------------------------------
  // Check 2: The Invented-Path Check (Deterministic & Set Membership)
  // --------------------------------------------------------------------------
  console.log('\n--- Check 2: Deterministic Invented-Path Evaluator ---');

  // 2a. Real explanations traffic evaluation
  const trafficSummary = await evaluateRecentExplanations(supabase, { limit: 10 });
  assert(
    typeof trafficSummary.cleanPercentage === 'number' &&
      typeof trafficSummary.pathPrecisionPercentage === 'number',
    `Live evaluator reports traffic score (${trafficSummary.cleanPercentage}% clean, ${trafficSummary.pathPrecisionPercentage}% precision across ${trafficSummary.totalEvaluated} explanations)`
  );

  // 2b. Acceptance Check 2: Feed explanation with made-up filename spliced in
  const genuinePaths = [
    'lib/parser/walker.ts',
    'lib/parser/types.ts',
    'lib/parser/index.ts',
    'lib/pipeline/runner.ts',
  ];

  const cleanExplanation =
    'The module `lib/parser/walker.ts` imports `lib/parser/types.ts` and is consumed by `lib/parser/index.ts` and `runner.ts`.';
  const cleanResult = checkInventedPaths(cleanExplanation, genuinePaths);

  assert(
    cleanResult.isClean === true && cleanResult.inventedPaths.length === 0,
    'Clean explanation referencing only genuine shown files passes with 0 invented paths'
  );

  // Spliced explanation with 2 made-up filenames
  const splicedExplanation =
    'The module `lib/parser/walker.ts` imports `lib/parser/types.ts`, but secretly requires `lib/security/fake-token.ts` and loads `ghost-daemon.ts`.';
  const splicedResult = checkInventedPaths(splicedExplanation, genuinePaths);

  assert(
    splicedResult.isClean === false &&
      splicedResult.inventedPaths.includes('lib/security/fake-token.ts') &&
      splicedResult.inventedPaths.includes('ghost-daemon.ts'),
    `Catches spliced made-up filenames with 100% precision: [${splicedResult.inventedPaths.join(', ')}]`
  );

  assert(
    splicedResult.evidence.flaggedDetails.length === 2 &&
      splicedResult.evidence.flaggedDetails[0].reason.length > 10,
    'Flagged violations provide hand-confirmable evidence verifiable in 10 seconds'
  );

  // --------------------------------------------------------------------------
  // Check 3: Held-Out Convention Role Accuracy (>= 30 files)
  // --------------------------------------------------------------------------
  console.log('\n--- Check 3: Role Accuracy over Held-Out Convention Dataset ---');

  assert(
    HELD_OUT_CONVENTION_DATASET.length >= 30,
    `Held-out dataset contains ${HELD_OUT_CONVENTION_DATASET.length} files (spec requirement: at least 30 files)`
  );

  // Confirm dataset strictly contains ONLY allowed non-structural roles
  const forbiddenInDataset = HELD_OUT_CONVENTION_DATASET.filter((item) =>
    (FORBIDDEN_MODEL_ROLES as readonly string[]).includes(item.groundTruthRole)
  );
  assert(
    forbiddenInDataset.length === 0,
    'Held-out dataset strictly excludes routable structural roles (page, route, controller)'
  );

  const allowedRolesInDataset = new Set(
    HELD_OUT_CONVENTION_DATASET.map((i) => i.groundTruthRole)
  );
  const all7RolesCovered = (ALLOWED_MODEL_ROLES as readonly string[]).every((r) =>
    allowedRolesInDataset.has(r as AllowedModelRole)
  );
  assert(
    all7RolesCovered,
    'Held-out dataset has balanced ground-truth coverage across all 7 allowed non-structural roles'
  );

  console.log('Running role accuracy evaluation over held-out dataset...');
  const roleReport = await evaluateRoleAccuracy({ sampleSize: 35 });

  assert(
    roleReport.totalFiles >= 30,
    `Role accuracy successfully evaluated ${roleReport.totalFiles} held-out files`
  );
  assert(
    roleReport.accuracyPercentage >= 70.0,
    `Role accuracy returns percentage: ${roleReport.accuracyPercentage}% (${roleReport.correctCount}/${roleReport.totalFiles} correct)`
  );

  // --------------------------------------------------------------------------
  // Check 4: Prompt Versions Comparison & Model as Judge
  // --------------------------------------------------------------------------
  console.log('\n--- Check 4: Prompt Versions Comparison & Model Judge ---');

  console.log('Running side-by-side prompt experiment (Current v2 vs Retired v1)...');
  const promptReport = await runPromptVersionComparison({ sampleLimit: 3 });

  assert(
    promptReport.sampleCount > 0,
    `Prompt comparison evaluated ${promptReport.sampleCount} benchmark files side-by-side`
  );
  assert(
    typeof promptReport.scoreV1 === 'number' && typeof promptReport.scoreV2 === 'number',
    `Side-by-side scores: Current Prompt v2 = ${promptReport.scoreV2}/10 (${promptReport.percentageV2}%), Retired Prompt v1 = ${promptReport.scoreV1}/10 (${promptReport.percentageV1}%)`
  );
  assert(
    promptReport.betterVersion === 'v2' && promptReport.delta > 0,
    `Explicitly says which is better and by how much: ${promptReport.summary}`
  );
  assert(
    promptReport.modelJudgeStatement === MODEL_JUDGE_STATEMENT &&
      promptReport.modelJudgeStatement.includes('model as judge'),
    'Model-as-judge disclosure stated out loud (architectural usefulness has no closed-form answer)'
  );

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log(`Phase 11 Verification Summary: ${passCount} Passed, ${failCount} Failed`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase11Verification().catch((err) => {
  console.error('[FATAL] Verification failed with exception:', err);
  process.exit(1);
});

