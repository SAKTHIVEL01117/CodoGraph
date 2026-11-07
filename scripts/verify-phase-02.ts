/**
 * CodoGraph — Phase 2 Acceptance Verification Suite
 *
 * Enforces:
 * 1. Schema check: all eight tables (projects, analyses, files, edges, routes,
 *    explanations, file_roles, insights) exist.
 * 2. RLS check: Every one of the eight tables has row-level security enabled (checked individually).
 * 3. Cascade check: Each of the eight tables has a foreign key to organizations with ON DELETE CASCADE.
 * 4. Multi-Tenant RLS isolation check:
 *    - Querying with org_seed_alpha claims returns ONLY org_seed_alpha's analyses.
 *    - Querying with org_seed_beta claims returns ONLY org_seed_beta's analyses.
 *    - Querying with an org with no analyses returns an empty list (empty state).
 *    - Querying anonymously returns 0 rows.
 *    - No application-level WHERE org_id = ... needed.
 * 5. Foreign key cascade deletion verification.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

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

const EIGHT_TABLES = [
  'projects',
  'analyses',
  'files',
  'edges',
  'routes',
  'explanations',
  'file_roles',
  'insights',
] as const;

async function runVerification() {
  console.log('====================================================');
  console.log('CodoGraph Phase 2 Database & RLS Acceptance Checks');
  console.log('====================================================\n');

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

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

  // --- Suite 1: Verify Table Existence ---
  console.log('--- Test Suite 1: Verify All Eight Tables Exist ---');
  const tableRes = await client.query(
    `select tablename from pg_tables where schemaname = 'public';`
  );
  const existingTables = new Set(tableRes.rows.map((r) => r.tablename));

  assert(existingTables.has('organizations'), 'Root organizations table exists');
  for (const table of EIGHT_TABLES) {
    assert(existingTables.has(table), `Table '${table}' exists in public schema`);
  }

  // --- Suite 2: Verify RLS Enabled on ALL EIGHT TABLES ---
  console.log('\n--- Test Suite 2: Row Level Security Enabled On All Eight Tables ---');
  const rlsRes = await client.query(
    `select tablename, rowsecurity from pg_tables where schemaname = 'public';`
  );
  const rlsMap = new Map(rlsRes.rows.map((r) => [r.tablename, r.rowsecurity]));

  for (const table of EIGHT_TABLES) {
    const isEnabled = rlsMap.get(table) === true;
    assert(
      isEnabled,
      `RLS enabled on '${table}' (rowsecurity = true)`,
      `Expected true, got ${rlsMap.get(table)}`
    );
  }
  assert(
    rlsMap.get('organizations') === true,
    "RLS enabled on 'organizations' root table"
  );

  // --- Suite 3: Verify Foreign Key Constraints with ON DELETE CASCADE ---
  console.log('\n--- Test Suite 3: Foreign Key Constraints with ON DELETE CASCADE ---');
  const fkQuery = `
    select
      tc.table_name,
      kcu.column_name,
      ccu.table_name as foreign_table_name,
      ccu.column_name as foreign_column_name,
      rc.delete_rule
    from information_schema.table_constraints as tc
    join information_schema.key_column_usage as kcu
      on tc.constraint_name = kcu.constraint_name
      and tc.table_schema = kcu.table_schema
    join information_schema.referential_constraints as rc
      on tc.constraint_name = rc.constraint_name
    join information_schema.constraint_column_usage as ccu
      on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and ccu.table_name = 'organizations';
  `;
  const fkRes = await client.query(fkQuery);
  const fkByTable = new Map(
    fkRes.rows.map((r) => [r.table_name, { col: r.column_name, deleteRule: r.delete_rule }])
  );

  for (const table of EIGHT_TABLES) {
    const fk = fkByTable.get(table);
    const hasOrgFk = Boolean(fk && fk.col === 'org_id');
    const isCascade = fk?.deleteRule === 'CASCADE';
    assert(
      hasOrgFk && isCascade,
      `'${table}' foreign key to organizations(id) has ON DELETE CASCADE`,
      `hasOrgFk=${hasOrgFk}, deleteRule=${fk?.deleteRule}`
    );
  }

  // --- Suite 4: RLS Tenant Isolation (Acceptance Check 1) ---
  console.log('\n--- Test Suite 4: Multi-Tenant RLS Policy Isolation ---');

  // Role simulation: create a scoped transaction as authenticated role with session claims
  // 4a. Authenticated as org_seed_alpha
  await client.query('BEGIN;');
  await client.query("SET LOCAL ROLE 'authenticated';");
  await client.query(
    `SELECT set_config('request.jwt.claims', '{"sub":"user_alpha","org_id":"org_seed_alpha"}', true);`
  );

  // Plain query without WHERE org_id = ...
  const alphaAnalyses = await client.query(
    'SELECT id, repository_url, status, org_id FROM public.analyses ORDER BY repository_url;'
  );
  assert(
    alphaAnalyses.rows.length === 5,
    `org_seed_alpha sees exactly its 5 analyses (got ${alphaAnalyses.rows.length})`
  );
  assert(
    alphaAnalyses.rows.every((r) => r.org_id === 'org_seed_alpha'),
    'All returned rows strictly belong to org_seed_alpha'
  );
  const alphaUrls = alphaAnalyses.rows.map((r) => r.repository_url);
  assert(
    alphaUrls.includes('https://github.com/tailwindlabs/tailwindcss') &&
      !alphaUrls.includes('https://github.com/starlight/engine'),
    'org_seed_alpha does NOT see any org_seed_beta analyses'
  );
  await client.query('ROLLBACK;');

  // 4b. Switch organization to org_seed_beta — SAME query, no code change
  await client.query('BEGIN;');
  await client.query("SET LOCAL ROLE 'authenticated';");
  await client.query(
    `SELECT set_config('request.jwt.claims', '{"sub":"user_beta","org_id":"org_seed_beta"}', true);`
  );

  const betaAnalyses = await client.query(
    'SELECT id, repository_url, status, org_id FROM public.analyses ORDER BY repository_url;'
  );
  assert(
    betaAnalyses.rows.length === 2,
    `org_seed_beta sees exactly its 2 analyses (got ${betaAnalyses.rows.length})`
  );
  assert(
    betaAnalyses.rows.every((r) => r.org_id === 'org_seed_beta'),
    'All returned rows strictly belong to org_seed_beta'
  );
  const betaUrls = betaAnalyses.rows.map((r) => r.repository_url);
  assert(
    betaUrls.includes('https://github.com/starlight/engine') &&
      !betaUrls.includes('https://github.com/acme/web-platform'),
    'org_seed_beta does NOT see any org_seed_alpha analyses'
  );
  await client.query('ROLLBACK;');

  // 4c. Switch organization to org_seed_gamma_empty — empty state
  await client.query('BEGIN;');
  await client.query("SET LOCAL ROLE 'authenticated';");
  await client.query(
    `SELECT set_config('request.jwt.claims', '{"sub":"user_gamma","org_id":"org_seed_gamma_empty"}', true);`
  );

  const gammaAnalyses = await client.query(
    'SELECT id, repository_url, status, org_id FROM public.analyses ORDER BY repository_url;'
  );
  assert(
    gammaAnalyses.rows.length === 0,
    'org_seed_gamma_empty returns 0 analyses (proves empty state query)'
  );
  await client.query('ROLLBACK;');

  // 4d. Query without org claims or anonymously
  await client.query('BEGIN;');
  await client.query("SET LOCAL ROLE 'authenticated';");
  await client.query(
    `SELECT set_config('request.jwt.claims', '{"sub":"user_no_org"}', true);`
  );
  const noOrgAnalyses = await client.query('SELECT id FROM public.analyses;');
  assert(
    noOrgAnalyses.rows.length === 0,
    'Session without org_id claim returns 0 rows (no leakage)'
  );
  await client.query('ROLLBACK;');

  // --- Suite 5: Foreign Key Cascade Delete Invariant ---
  console.log('\n--- Test Suite 5: Organization Cascade Deletion Invariant ---');
  await client.query('BEGIN;');
  // Insert temporary org with rows in all 8 tables
  const tempOrgId = 'org_temp_cascade_test';
  await client.query(
    `insert into public.organizations (id, name) values ($1, 'Temp Test Org');`,
    [tempOrgId]
  );
  const tempProj = await client.query(
    `insert into public.projects (org_id, name, repository_url) values ($1, 'test', 'http://test') returning id;`,
    [tempOrgId]
  );
  const projId = tempProj.rows[0].id;
  const tempAna = await client.query(
    `insert into public.analyses (org_id, project_id, repository_url) values ($1, $2, 'http://test') returning id;`,
    [tempOrgId, projId]
  );
  const anaId = tempAna.rows[0].id;
  const tempFile = await client.query(
    `insert into public.files (org_id, analysis_id, path, folder) values ($1, $2, 'a.ts', 'src') returning id;`,
    [tempOrgId, anaId]
  );
  const fileId = tempFile.rows[0].id;
  await client.query(
    `insert into public.edges (org_id, analysis_id, source_path, target_path) values ($1, $2, 'a.ts', 'b.ts');`,
    [tempOrgId, anaId]
  );
  await client.query(
    `insert into public.routes (org_id, analysis_id, method, pattern) values ($1, $2, 'GET', '/test');`,
    [tempOrgId, anaId]
  );
  await client.query(
    `insert into public.explanations (org_id, analysis_id, file_path, content, content_hash, model) values ($1, $2, 'a.ts', 'txt', 'h', 'm');`,
    [tempOrgId, anaId]
  );
  await client.query(
    `insert into public.file_roles (org_id, analysis_id, file_path, role) values ($1, $2, 'a.ts', 'util');`,
    [tempOrgId, anaId]
  );
  await client.query(
    `insert into public.insights (org_id, analysis_id, kind, title, description) values ($1, $2, 'unimported', 'Unused', 'Desc');`,
    [tempOrgId, anaId]
  );

  // Now delete the organization
  await client.query(`delete from public.organizations where id = $1;`, [tempOrgId]);

  // Check that all 8 tables have 0 rows for tempOrgId
  let anyChildSurvived = false;
  for (const table of EIGHT_TABLES) {
    const check = await client.query(
      `select count(*)::int as count from public.${table} where org_id = $1;`,
      [tempOrgId]
    );
    if (check.rows[0].count > 0) {
      anyChildSurvived = true;
      break;
    }
  }
  assert(!anyChildSurvived, 'Deleting organization cascades and deletes all rows across all 8 tables');
  await client.query('ROLLBACK;');

  console.log('\n====================================================');
  console.log(`Results: ${passes} passed, ${fails} failed`);
  console.log('====================================================\n');

  await client.end();
  if (fails > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});

