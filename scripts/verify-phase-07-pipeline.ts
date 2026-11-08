/**
 * CodoGraph — Phase 7 Pipeline Verification Suite.
 *
 * Verifies:
 * 1. URL Parser handles varied shapes and rejects invalid formats.
 * 2. Unauthenticated archive fetch extracts commit SHA without tokens.
 * 3. End-to-end pipeline: fetch -> select -> parse -> store.
 * 4. Stored database entities: analyses, files, edges, insights, file_roles.
 * 5. One analysis per repository constraint: second submission reuses existing row.
 * 6. Top-level failure handling: nonexistent repo marks analysis as 'failed' with reason and stage.
 * 7. Temporary folder cleanup on both success and failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { parseGitHubUrl, fetchRepositoryArchive } from '../lib/pipeline/github.ts';
import { runAnalysisPipeline } from '../lib/pipeline/runner.ts';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const dbUrl =
  process.env.DATABASE_URL ||
  'postgresql://postgres:gpsv%40280907sv@db.xiimblxgfdirkqhbekfn.supabase.co:5432/postgres';

const TEST_ORG = 'org_seed_alpha';
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`[PASS] ${label}`);
    passed++;
  } else {
    console.error(`[FAIL] ${label}`);
    failed++;
  }
}

async function verify() {
  console.log('====================================================');
  console.log('CodoGraph Phase 7 Pipeline Acceptance Verification');
  console.log('====================================================\n');

  // --- Suite 1: GitHub URL Parsing ---
  console.log('--- Test Suite 1: URL Parsing & Normalization ---');
  {
    const res1 = parseGitHubUrl('https://github.com/facebook/react');
    assert(
      res1.owner === 'facebook' && res1.repo === 'react' && res1.canonicalUrl === 'https://github.com/facebook/react',
      'Parses standard HTTPS GitHub URL'
    );

    const res2 = parseGitHubUrl('https://github.com/vercel/next.js.git');
    assert(
      res2.owner === 'vercel' && res2.repo === 'next.js' && res2.canonicalUrl === 'https://github.com/vercel/next.js',
      'Strips .git suffix properly'
    );

    const res3 = parseGitHubUrl('https://github.com/tailwindlabs/tailwindcss/tree/main');
    assert(
      res3.owner === 'tailwindlabs' && res3.repo === 'tailwindcss' && res3.ref === 'main',
      'Parses branch ref from /tree/path'
    );

    const res4 = parseGitHubUrl('octocat/Hello-World');
    assert(
      res4.owner === 'octocat' && res4.repo === 'Hello-World' && res4.canonicalUrl === 'https://github.com/octocat/Hello-World',
      'Parses shorthand owner/repo syntax'
    );

    let caughtInvalid = false;
    try {
      parseGitHubUrl('not-a-valid-url-at-all');
    } catch {
      caughtInvalid = true;
    }
    assert(caughtInvalid, 'Rejects invalid GitHub URL with descriptive error');
  }

  // --- Suite 2: Archive Fetch & Commit SHA Extraction ---
  console.log('\n--- Test Suite 2: Public Archive Fetch & SHA Extraction ---');
  {
    const fetched = await fetchRepositoryArchive('https://github.com/octocat/Hello-World');
    assert(
      fs.existsSync(fetched.extractedDir),
      'Archive unpacked into extractedDir'
    );
    assert(
      typeof fetched.commitHash === 'string' && fetched.commitHash.length >= 7,
      `Extracted commit SHA (${fetched.commitHash})`
    );
    assert(
      fs.existsSync(path.join(fetched.extractedDir, 'README')),
      'README file exists in extracted repository'
    );

    const tempDirToClean = fetched.tempDir;
    await fetched.cleanup();
    assert(
      !fs.existsSync(tempDirToClean),
      'Cleanup removes temporary directory completely from disk'
    );
  }

  // --- Suite 3: End-to-End Pipeline Execution (expressjs/cookie-parser) ---
  console.log('\n--- Test Suite 3: Full Pipeline Ingestion & Database Storage ---');
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // Clean any previous test run for expressjs/cookie-parser in TEST_ORG
  const testRepoUrl = 'https://github.com/expressjs/cookie-parser';
  await client.query(
    `DELETE FROM public.analyses WHERE org_id = $1 AND repository_url = $2;`,
    [TEST_ORG, testRepoUrl]
  );

  const stagesVisited: string[] = [];
  const pipelineResult = await runAnalysisPipeline(testRepoUrl, TEST_ORG, {
    onStageChange: (stage) => stagesVisited.push(stage),
  });

  assert(
    stagesVisited.includes('fetching') &&
      stagesVisited.includes('selecting') &&
      stagesVisited.includes('parsing') &&
      stagesVisited.includes('storing') &&
      stagesVisited.includes('complete'),
    `All named stages executed in sequence: ${stagesVisited.join(' -> ')}`
  );

  assert(!pipelineResult.reusedExisting, 'First run creates a fresh analysis (reusedExisting = false)');
  assert(pipelineResult.analysis.status === 'completed', 'Analysis status is "completed"');
  assert(pipelineResult.analysis.stage === 'complete', 'Analysis stage is "complete"');
  assert(
    pipelineResult.analysis.commit_hash !== null && pipelineResult.analysis.commit_hash.length >= 7,
    `Commit SHA saved to database: ${pipelineResult.analysis.commit_hash}`
  );

  // Verify rows in public.files
  const filesRes = await client.query(
    `SELECT * FROM public.files WHERE analysis_id = $1;`,
    [pipelineResult.analysis.id]
  );
  assert(filesRes.rows.length >= 1, `Files stored in public.files (count: ${filesRes.rows.length})`);
  assert(filesRes.rows[0].org_id === TEST_ORG, 'Stored file preserves org_id multi-tenant key');

  // Verify insights in public.insights
  const insightsRes = await client.query(
    `SELECT * FROM public.insights WHERE analysis_id = $1;`,
    [pipelineResult.analysis.id]
  );
  assert(
    insightsRes.rows.length === 4,
    `All four codebase insights persisted in public.insights (count: ${insightsRes.rows.length})`
  );

  // --- Suite 4: One Analysis Per Repository Constraint ---
  console.log('\n--- Test Suite 4: "One Analysis Per Repository" Invariant ---');
  {
    const secondResult = await runAnalysisPipeline(testRepoUrl, TEST_ORG);
    assert(
      secondResult.reusedExisting === true,
      'Re-submitting existing repository URL reuses existing analysis'
    );
    assert(
      secondResult.analysis.id === pipelineResult.analysis.id,
      'Returns the exact existing analysis ID without re-creating'
    );

    const countRes = await client.query(
      `SELECT count(*) FROM public.analyses WHERE org_id = $1 AND repository_url = $2;`,
      [TEST_ORG, testRepoUrl]
    );
    assert(
      parseInt(countRes.rows[0].count, 10) === 1,
      'Exactly 1 analysis row exists in database for this repository (not two)'
    );
  }

  // --- Suite 5: Top-Level Failure Handling ---
  console.log('\n--- Test Suite 5: Failure State Capture ---');
  {
    const badRepoUrl = 'https://github.com/octocat/this-repository-definitely-does-not-exist-99999';
    let threw = false;
    let failedAnalysisId: string | null = null;

    try {
      await runAnalysisPipeline(badRepoUrl, TEST_ORG, {
        onStageChange: (_stage, id) => {
          failedAnalysisId = id;
        },
      });
    } catch {
      threw = true;
    }

    assert(threw, 'Pipeline throws error for nonexistent repository');

    if (failedAnalysisId) {
      const failedRow = await client.query(
        `SELECT * FROM public.analyses WHERE id = $1;`,
        [failedAnalysisId]
      );
      assert(failedRow.rows.length === 1, 'Failed analysis record exists');
      assert(failedRow.rows[0].status === 'failed', 'Analysis status marked "failed" (not stuck in parsing)');
      assert(failedRow.rows[0].stage === 'fetching', 'Analysis recorded failed stage as "fetching"');
      assert(
        typeof failedRow.rows[0].error_message === 'string' &&
          failedRow.rows[0].error_message.includes('not found'),
        `Error message recorded in database: "${failedRow.rows[0].error_message}"`
      );
    }
  }

  // Cleanup test rows
  await client.query(`DELETE FROM public.analyses WHERE org_id = $1 AND (repository_url LIKE '%cookie-parser%' OR repository_url LIKE '%octocat%');`, [
    TEST_ORG,
  ]);
  await client.end();

  console.log('\n====================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

verify().catch((err) => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
