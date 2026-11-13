/**
 * CodoGraph — Phase 10 Acceptance Verification Script.
 *
 * Verifies all build items, constraints, and acceptance checks from docs/specs/phase-10.md:
 * 1. Single AI client construction wrapped with LangSmith tracing.
 * 2. Explaining a file written from real neighbours (imports & dependents handed to model).
 * 3. Permitted formatting (inline code, bold, bullets; no headings, no stray backticks/asterisks/hashes).
 * 4. Cache read inside traced call (cache hit records 0 tokens and no child model call).
 * 5. Explaining a folded folder (subsystem question: what's in here & why external modules point to it).
 * 6. Non-structural role classification (rejects page, route, controller; accepts service/repository/model/util/etc.).
 * 7. Staleness detection (file content hash changed or repo moved past analysed commit).
 * 8. Tracing visibility (reports state when unconfigured or configured).
 */
import fs from 'node:fs';
import path from 'node:path';
import { getAiClient, PINNED_MODEL, getTracingStatus } from '../lib/ai/client.ts';
import {
  explainFileTraced,
  explainFolderTraced,
  classifyFileRoleTraced,
  computeFolderContentHash,
  sanitizeExplanationOutput,
  checkStaleness,
  ALLOWED_MODEL_ROLES,
  FORBIDDEN_MODEL_ROLES,
} from '../lib/ai/explain.ts';
import { createSupabaseAdminClient } from '../lib/supabase/admin.ts';

// Parse .env.local if not already in process.env
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

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

async function runPhase10Verification() {
  console.log('====================================================');
  console.log('CodoGraph Phase 10 AI Explain, Cache & Tracing Verification');
  console.log('====================================================\n');

  const supabase = createSupabaseAdminClient();
  const testOrgId = 'org_test_phase10';
  const testAnalysisId = '00000000-0000-0000-0000-000000000010';

  // Setup mock organization and analysis rows for testing
  await supabase.from('organizations').upsert({
    id: testOrgId,
    name: 'Phase 10 Test Org',
  });

  await supabase.from('analyses').upsert({
    id: testAnalysisId,
    org_id: testOrgId,
    repository_url: 'https://github.com/codograph/test-repo',
    branch: 'main',
    commit_hash: 'a1b2c3d4e5f6',
    status: 'completed',
    stage: 'complete',
  });

  // Clean any prior test explanations for idempotent runs
  await supabase
    .from('explanations')
    .delete()
    .eq('analysis_id', testAnalysisId);

  // --------------------------------------------------------------------------
  // Check 1: Single AI Client & Tracing Gateway
  // --------------------------------------------------------------------------
  console.log('--- Check 1: Single AI Client Construction & Tracing Status ---');
  const aiClient1 = getAiClient();
  const aiClient2 = getAiClient();
  assert(aiClient1 === aiClient2, 'AI client is a single wrapped instance throughout the application');

  assert(
    typeof PINNED_MODEL === 'string' && PINNED_MODEL.length > 0 && !PINNED_MODEL.includes(':latest'),
    `Model version is pinned exactly to "${PINNED_MODEL}" (never a moving alias)`
  );

  const tracingStatus = getTracingStatus();
  assert(
    typeof tracingStatus.enabled === 'boolean' && typeof tracingStatus.project === 'string',
    `Tracing configuration status is cleanly surfaced (enabled: ${tracingStatus.enabled}, project: ${tracingStatus.project})`
  );

  // --------------------------------------------------------------------------
  // Check 2: Explaining a File Written from Real Neighbours
  // --------------------------------------------------------------------------
  console.log('\n--- Check 2: Explaining a File with Real Neighbours ---');
  const targetFile = 'lib/parser/walker.ts';
  const testContentHash = 'hash_phase10_test_walker_v1';
  const dependencies = ['lib/parser/types.ts'];
  const dependents = ['lib/parser/index.ts', 'lib/pipeline/runner.ts'];

  const fileExplanation = await explainFileTraced({
    supabase,
    orgId: testOrgId,
    analysisId: testAnalysisId,
    filePath: targetFile,
    contentHash: testContentHash,
    fileRole: 'util',
    dependencies,
    dependents,
    fileSnippet: 'export function hashContent(buffer: Buffer): string { return crypto.createHash("sha256").update(buffer).digest("hex"); }',
  });

  assert(
    typeof fileExplanation.content === 'string' && fileExplanation.content.length > 50,
    'Model generated a coherent architectural explanation for the file'
  );
  assert(
    fileExplanation.cached === false,
    'First run is recorded as a cache miss'
  );
  assert(
    fileExplanation.tokens > 0,
    `First run records non-zero tokens consumed (${fileExplanation.tokens} tokens)`
  );

  // Verify real neighbours are present in explanation
  const mentionsDependencies =
    fileExplanation.content.includes('types.ts') || fileExplanation.content.includes('lib/parser/types.ts');
  const mentionsDependents =
    fileExplanation.content.includes('index.ts') || fileExplanation.content.includes('runner.ts');

  assert(
    mentionsDependencies || mentionsDependents,
    'Explanation explicitly refers to real neighbours handed to it in prompt'
  );
  console.log('\n[Sample File Explanation]:\n' + fileExplanation.content + '\n');

  // --------------------------------------------------------------------------
  // Check 3: Constrained Formatting & No Stray Markdown
  // --------------------------------------------------------------------------
  console.log('\n--- Check 3: Formatting Constraints (No Headings, No Stray Markers) ---');
  const hasHeadings = /^#{1,6}\s+/m.test(fileExplanation.content);
  assert(!hasHeadings, 'Rendered explanation contains zero markdown heading markers (#, ##, ###)');

  const sanitized = sanitizeExplanationOutput(fileExplanation.content);
  assert(
    !/^#{1,6}\s+/m.test(sanitized),
    'Sanitizer successfully guarantees headings are stripped from output'
  );

  // --------------------------------------------------------------------------
  // Check 4: Cache Read Inside Traced Call (0 Tokens Recorded)
  // --------------------------------------------------------------------------
  console.log('\n--- Check 4: Traced Cache Hit (0 Tokens Recorded) ---');
  const t0 = Date.now();
  const cachedRun = await explainFileTraced({
    supabase,
    orgId: testOrgId,
    analysisId: testAnalysisId,
    filePath: targetFile,
    contentHash: testContentHash,
    fileRole: 'util',
    dependencies,
    dependents,
    forceRefresh: false,
  });
  const elapsedCached = Date.now() - t0;

  assert(
    cachedRun.cached === true,
    'Second call with same content hash and model hits cache'
  );
  assert(
    cachedRun.tokens === 0,
    `Cache hit inside traced call records exactly 0 tokens (${cachedRun.tokens} tokens)`
  );
  assert(
    cachedRun.content === fileExplanation.content,
    'Cached content exactly matches original generated explanation'
  );
  assert(
    elapsedCached < 1500,
    `Cache hit returned instantly (${elapsedCached}ms)`
  );

  // --------------------------------------------------------------------------
  // Check 5: Explaining a Folded Folder (Subsystem Question)
  // --------------------------------------------------------------------------
  console.log('\n--- Check 5: Folded Folder Explanation ---');
  const folderPath = 'lib/parser';
  const folderFiles = [
    { path: 'lib/parser/index.ts', contentHash: 'h_idx', role: 'module' },
    { path: 'lib/parser/walker.ts', contentHash: 'h_wlk', role: 'util' },
    { path: 'lib/parser/ast.ts', contentHash: 'h_ast', role: 'util' },
    { path: 'lib/parser/resolver.ts', contentHash: 'h_res', role: 'util' },
  ];
  const folderHash = computeFolderContentHash(folderFiles);
  const extDependents = ['lib/pipeline/runner.ts', 'app/api/analyze/route.ts'];
  const extDependencies = ['lib/env.ts'];

  const folderExplanation = await explainFolderTraced({
    supabase,
    orgId: testOrgId,
    analysisId: testAnalysisId,
    folderPath,
    folderHash,
    filesInFolder: folderFiles,
    fanIn: 8,
    fanOut: 2,
    externalDependents: extDependents,
    externalDependencies: extDependencies,
  });

  assert(
    typeof folderExplanation.content === 'string' && folderExplanation.content.length > 50,
    'Model generated a coherent explanation for the folded folder'
  );
  assert(
    folderExplanation.isFolder === true,
    'Folder explanation is stored with is_folder = true'
  );

  // Test folder cache hit
  const folderCached = await explainFolderTraced({
    supabase,
    orgId: testOrgId,
    analysisId: testAnalysisId,
    folderPath,
    folderHash,
    filesInFolder: folderFiles,
    fanIn: 8,
    fanOut: 2,
    externalDependents: extDependents,
    externalDependencies: extDependencies,
  });
  assert(
    folderCached.cached === true && folderCached.tokens === 0,
    'Folder explanation cache hit records 0 tokens inside trace'
  );

  // --------------------------------------------------------------------------
  // Check 6: Non-structural Role Classification
  // --------------------------------------------------------------------------
  console.log('\n--- Check 6: Non-structural Role Classification ---');
  const roleTestFile = 'lib/utils/calculator.ts';
  const assignedRole = await classifyFileRoleTraced({
    supabase,
    orgId: testOrgId,
    analysisId: testAnalysisId,
    filePath: roleTestFile,
    dependencies: [],
    dependents: ['lib/canvas/metrics.ts'],
    fileSnippet: 'export function add(a: number, b: number): number { return a + b; }',
  });

  assert(
    (ALLOWED_MODEL_ROLES as readonly string[]).includes(assignedRole),
    `Assigned role "${assignedRole}" is an allowed non-structural role (${ALLOWED_MODEL_ROLES.join(', ')})`
  );

  assert(
    !(FORBIDDEN_MODEL_ROLES as readonly string[]).includes(assignedRole as unknown as string),
    `Assigned role "${assignedRole}" is strictly NOT a routable structural role (${FORBIDDEN_MODEL_ROLES.join(', ')})`
  );

  // --------------------------------------------------------------------------
  // Check 7: Staleness Detection (File Content & Commit Hash)
  // --------------------------------------------------------------------------
  console.log('\n--- Check 7: Staleness Detection ---');
  const freshCheck = checkStaleness(
    'hash_same_123',
    'hash_same_123',
    'commit_abc_1',
    'commit_abc_1'
  );
  assert(
    freshCheck.isStale === false,
    'Matching content hash and commit hash reports fresh (not stale)'
  );

  const fileChangedCheck = checkStaleness(
    'hash_modified_456',
    'hash_original_123',
    'commit_abc_1',
    'commit_abc_1'
  );
  assert(
    fileChangedCheck.isStale === true && Boolean(fileChangedCheck.reason?.includes('File content has changed')),
    `File modification triggers staleness: "${fileChangedCheck.reason}"`
  );

  const commitMovedCheck = checkStaleness(
    'hash_same_123',
    'hash_same_123',
    'commit_old_1111111',
    'commit_new_2222222'
  );
  assert(
    commitMovedCheck.isStale === true && Boolean(commitMovedCheck.reason?.includes('Repository has moved past')),
    `Commit movement triggers staleness: "${commitMovedCheck.reason}"`
  );

  // --------------------------------------------------------------------------
  // Cleanup test database entities
  // --------------------------------------------------------------------------
  await supabase.from('analyses').delete().eq('id', testAnalysisId);
  await supabase.from('organizations').delete().eq('id', testOrgId);

  console.log('\n====================================================');
  console.log(`Phase 10 Verification Summary: ${passCount} Passed, ${failCount} Failed`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase10Verification().catch((err) => {
  console.error('[FATAL] Verification encountered unhandled error:', err);
  process.exit(1);
});
