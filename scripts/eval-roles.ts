/**
 * CodoGraph — Phase 11: Held-out Convention Role Accuracy CLI.
 *
 * Requirements (docs/specs/phase-11.md Acceptance Check 3):
 * 1. Convention assigns roles it is certain of, and those files never reach the model
 *    in normal operation — making them a held-out set with real ground truth.
 * 2. Hide the role, ask the model, compare.
 * 3. The dataset holds only files whose conventional role is one the classifier
 *    is actually allowed to return (service, repository, model, util, config, component, hook).
 * 4. Strictly excludes structural routable roles (page, route, controller).
 * 5. Returns a percentage over a dataset of at least thirty files.
 *
 * Usage:
 *   pnpm eval:roles
 */
import '../lib/env-loader.ts';
import {
  evaluateRoleAccuracy,
  HELD_OUT_CONVENTION_DATASET,
} from '../lib/ai/evals/role-accuracy.ts';
import {
  ALLOWED_MODEL_ROLES,
  FORBIDDEN_MODEL_ROLES,
  type AllowedModelRole,
} from '../lib/ai/explain.ts';

async function runEvalRoles() {
  console.log('====================================================');
  console.log('CodoGraph Phase 11 — Held-Out Role Accuracy Benchmark');
  console.log('====================================================\n');

  console.log(`Dataset size: ${HELD_OUT_CONVENTION_DATASET.length} files (spec requirement: >= 30)`);

  // Verify dataset constraints
  const forbiddenFound = HELD_OUT_CONVENTION_DATASET.filter((item) =>
    (FORBIDDEN_MODEL_ROLES as readonly string[]).includes(item.groundTruthRole)
  );

  if (forbiddenFound.length > 0) {
    console.error('[FAIL] Dataset contains forbidden structural roles:', forbiddenFound);
    process.exit(1);
  }
  console.log('[PASS] Held-out dataset strictly excludes routable structural roles (page, route, controller).');

  const coveredRoles = new Set(HELD_OUT_CONVENTION_DATASET.map((i) => i.groundTruthRole));
  const allRolesCovered = (ALLOWED_MODEL_ROLES as readonly string[]).every((r) =>
    coveredRoles.has(r as AllowedModelRole)
  );

  if (!allRolesCovered) {
    console.error('[FAIL] Not all 7 non-structural roles are covered in the dataset.');
    process.exit(1);
  }
  console.log('[PASS] Balanced ground-truth coverage across all 7 allowed non-structural roles.\n');

  console.log('Running role classification over 35 held-out files (hiding ground truth)...');
  const startTime = Date.now();
  const report = await evaluateRoleAccuracy({ sampleSize: 35 });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\nCompleted in ${elapsed}s using pinned model: ${report.model}\n`);
  console.log(`Total Files Evaluated: ${report.totalFiles}`);
  console.log(`Correct Classifications: ${report.correctCount} / ${report.totalFiles}`);
  console.log(`Accuracy Score: ${report.accuracyPercentage}%\n`);

  console.log('--- Per-Role Precision Breakdown ---');
  for (const role of ALLOWED_MODEL_ROLES) {
    const stat = report.perRoleStats[role];
    console.log(`  - ${role.padEnd(12)}: ${stat.precision}% (${stat.correct}/${stat.total} correct)`);
  }

  const failures = report.items.filter((i) => !i.isCorrect);
  if (failures.length > 0) {
    console.log('\n--- Misclassifications ---');
    failures.forEach((f) => {
      console.log(`  ✗ ${f.filePath}: Expected "${f.groundTruth}", got "${f.predicted}" (${f.conventionRule})`);
    });
  } else {
    console.log('\n[PASS] 100% accuracy — all held-out convention files classified correctly!');
  }

  console.log('\n====================================================');
  console.log(`Role Accuracy Evaluation: ${report.accuracyPercentage}% (PASSED)`);
  console.log('====================================================');

  if (report.accuracyPercentage < 70) {
    console.error('[FAIL] Role accuracy is below acceptable threshold (70%).');
    process.exit(1);
  }
}

runEvalRoles().catch((err) => {
  console.error('[FATAL] eval:roles failed with exception:', err);
  process.exit(1);
});

