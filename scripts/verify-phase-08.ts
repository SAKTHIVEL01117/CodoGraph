/**
 * CodoGraph — Phase 8 Acceptance Verification Script.
 *
 * Verifies all 5 acceptance checks from docs/specs/phase-08.md:
 * 1. Analyse a Next.js repository: rail says Page routes, API endpoints, Server actions,
 *    and the counts are right.
 * 2. Analyse a NestJS repository: rail says Controllers, Services, Modules, Entities,
 *    and the route table shows methods and full patterns.
 * 3. Open three routes from that table and confirm by hand that the method and the path
 *    both match the code exactly.
 * 4. Analyse something that matches no adapter — it renders, roles are generic,
 *    the route table is empty rather than wrong.
 * 5. Search the parser core for the word "nextjs". It appears in the adapter and nowhere else.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseRepository } from '../lib/parser/index.ts';
import { categorizeFiles } from '../lib/canvas/taxonomy.ts';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${message}`);
    failCount++;
  }
}

// Helper to create temporary directory for test fixtures
function createTempRepo(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `codograph-p8-${prefix}-`));
  return dir;
}

function cleanupDir(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors on Windows
  }
}

function writeFixtureFile(root: string, relPath: string, content: string) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

async function runPhase08Verification() {
  console.log('====================================================');
  console.log('CodoGraph Phase 8 Framework Adapters Verification');
  console.log('====================================================\n');

  // --------------------------------------------------------------------------
  // Check 1: Next.js Repository Analysis
  // --------------------------------------------------------------------------
  console.log('--- Check 1: Next.js Repository Analysis ---');
  const nextRepo = createTempRepo('next');
  try {
    writeFixtureFile(
      nextRepo,
      'package.json',
      JSON.stringify({
        name: 'test-next-app',
        dependencies: { next: '^15.0.0', react: '^19.0.0' },
      })
    );

    // Page routes (4 page routes)
    writeFixtureFile(nextRepo, 'app/page.tsx', 'export default function Home() { return <h1>Home</h1>; }');
    writeFixtureFile(nextRepo, 'app/dashboard/page.tsx', 'export default function Dashboard() { return <h1>Dashboard</h1>; }');
    writeFixtureFile(nextRepo, 'app/(auth)/login/page.tsx', 'export default function Login() { return <h1>Login</h1>; }');
    writeFixtureFile(nextRepo, 'app/users/[id]/page.tsx', 'export default function User() { return <h1>User</h1>; }');

    // API endpoints (2 API route handler files with multiple methods)
    writeFixtureFile(
      nextRepo,
      'app/api/users/route.ts',
      `export async function GET() { return Response.json([]); }
       export async function POST() { return Response.json({ success: true }); }`
    );
    writeFixtureFile(
      nextRepo,
      'app/api/health/route.ts',
      `export async function GET() { return Response.json({ status: "ok" }); }`
    );

    // Server actions (2 server action files)
    writeFixtureFile(
      nextRepo,
      'app/actions/user.actions.ts',
      `'use server';\nexport async function createUser(data: any) { return { id: 1 }; }`
    );
    writeFixtureFile(
      nextRepo,
      'app/actions/auth.ts',
      `"use server";\nexport async function signIn() { return true; }`
    );

    // Other plumbing
    writeFixtureFile(nextRepo, 'components/button.tsx', 'export function Button() { return <button />; }');
    writeFixtureFile(nextRepo, 'lib/utils.ts', 'export function cn(...args: string[]) { return args.join(" "); }');

    const nextResult = parseRepository(nextRepo);
    assert(nextResult.adapter === 'nextjs', 'Next.js repository correctly claims nextjs adapter');

    const railCategories = categorizeFiles(nextResult.files, nextResult.adapter);
    const categoryNames = railCategories.map((c) => c.name);

    assert(
      categoryNames.includes('Page routes'),
      'Rail says Page routes'
    );
    assert(
      categoryNames.includes('API endpoints'),
      'Rail says API endpoints'
    );
    assert(
      categoryNames.includes('Server actions'),
      'Rail says Server actions'
    );

    const pageRoutesCat = railCategories.find((c) => c.name === 'Page routes');
    const apiEndpointsCat = railCategories.find((c) => c.name === 'API endpoints');
    const serverActionsCat = railCategories.find((c) => c.name === 'Server actions');

    assert(pageRoutesCat?.count === 4, `Page routes count is right: ${pageRoutesCat?.count} === 4`);
    assert(apiEndpointsCat?.count === 2, `API endpoints count is right: ${apiEndpointsCat?.count} === 2`);
    assert(serverActionsCat?.count === 2, `Server actions count is right: ${serverActionsCat?.count} === 2`);

    // Check exact extracted routes
    const extractedPatterns = nextResult.routes.map((r) => `${r.method} ${r.pattern}`);
    console.log('  Extracted Next.js routes:', extractedPatterns);

    assert(extractedPatterns.includes('GET /'), 'Extracted route: GET /');
    assert(extractedPatterns.includes('GET /dashboard'), 'Extracted route: GET /dashboard');
    assert(extractedPatterns.includes('GET /login'), 'Extracted route with route group omitted: GET /login');
    assert(extractedPatterns.includes('GET /users/[id]'), 'Extracted route: GET /users/[id]');
    assert(extractedPatterns.includes('GET /api/users'), 'Extracted route: GET /api/users');
    assert(extractedPatterns.includes('POST /api/users'), 'Extracted route: POST /api/users');
    assert(extractedPatterns.includes('GET /api/health'), 'Extracted route: GET /api/health');
  } finally {
    cleanupDir(nextRepo);
  }

  // --------------------------------------------------------------------------
  // Check 2: NestJS Repository Analysis & Left Rail
  // --------------------------------------------------------------------------
  console.log('\n--- Check 2: NestJS Repository Analysis ---');
  const nestRepo = createTempRepo('nest');
  try {
    writeFixtureFile(
      nestRepo,
      'package.json',
      JSON.stringify({
        name: 'test-nest-app',
        dependencies: { '@nestjs/core': '^10.0.0', '@nestjs/common': '^10.0.0' },
      })
    );

    // Controllers (3 controllers)
    writeFixtureFile(
      nestRepo,
      'src/cats/cats.controller.ts',
      `import { Controller, Get, Post, Delete, Param } from '@nestjs/common';
       @Controller('cats')
       export class CatsController {
         @Get()
         findAll() { return []; }

         @Get(':id')
         findOne(@Param('id') id: string) { return { id }; }

         @Post()
         create() { return { created: true }; }

         @Delete(':id')
         remove(@Param('id') id: string) { return { deleted: true }; }
       }`
    );

    writeFixtureFile(
      nestRepo,
      'src/users/users.controller.ts',
      `import { Controller, Get, Put, Param } from '@nestjs/common';
       @Controller('api/v1/users')
       export class UsersController {
         @Get()
         getAll() { return []; }

         @Put(':id')
         update(@Param('id') id: string) { return { id }; }
       }`
    );

    writeFixtureFile(
      nestRepo,
      'src/app.controller.ts',
      `import { Controller, Get } from '@nestjs/common';
       @Controller()
       export class AppController {
         @Get('health')
         health() { return 'ok'; }
       }`
    );

    // Services (2 services)
    writeFixtureFile(nestRepo, 'src/cats/cats.service.ts', 'export class CatsService {}');
    writeFixtureFile(nestRepo, 'src/users/users.service.ts', 'export class UsersService {}');

    // Modules (3 modules)
    writeFixtureFile(nestRepo, 'src/cats/cats.module.ts', 'export class CatsModule {}');
    writeFixtureFile(nestRepo, 'src/users/users.module.ts', 'export class UsersModule {}');
    writeFixtureFile(nestRepo, 'src/app.module.ts', 'export class AppModule {}');

    // Entities (2 entities)
    writeFixtureFile(nestRepo, 'src/cats/cat.entity.ts', 'export class CatEntity {}');
    writeFixtureFile(nestRepo, 'src/users/user.entity.ts', 'export class UserEntity {}');

    const nestResult = parseRepository(nestRepo);
    assert(nestResult.adapter === 'nestjs', 'NestJS repository correctly claims nestjs adapter');

    const railCategories = categorizeFiles(nestResult.files, nestResult.adapter);
    const categoryNames = railCategories.map((c) => c.name);

    assert(categoryNames.includes('Controllers'), 'Rail says Controllers');
    assert(categoryNames.includes('Services'), 'Rail says Services');
    assert(categoryNames.includes('Modules'), 'Rail says Modules');
    assert(categoryNames.includes('Entities'), 'Rail says Entities');

    const ctrlCat = railCategories.find((c) => c.name === 'Controllers');
    const srvCat = railCategories.find((c) => c.name === 'Services');
    const modCat = railCategories.find((c) => c.name === 'Modules');
    const entCat = railCategories.find((c) => c.name === 'Entities');

    assert(ctrlCat?.count === 3, `Controllers count is 3: ${ctrlCat?.count}`);
    assert(srvCat?.count === 2, `Services count is 2: ${srvCat?.count}`);
    assert(modCat?.count === 3, `Modules count is 3: ${modCat?.count}`);
    assert(entCat?.count === 2, `Entities count is 2: ${entCat?.count}`);

    // Invariant: Fixed reading order (routable surfaces first, then layers behind, then plumbing)
    const ctrlIdx = categoryNames.indexOf('Controllers');
    const srvIdx = categoryNames.indexOf('Services');
    const modIdx = categoryNames.indexOf('Modules');
    const entIdx = categoryNames.indexOf('Entities');

    assert(
      ctrlIdx < srvIdx && srvIdx < modIdx && modIdx < entIdx,
      'Rail order is fixed reading order: Controllers -> Services -> Modules -> Entities'
    );

    // --------------------------------------------------------------------------
    // Check 3: Hand confirmation of 3 routes matching method & code exactly
    // --------------------------------------------------------------------------
    console.log('\n--- Check 3: Hand Confirmation of 3 Routes ---');
    const routes = nestResult.routes;
    console.log(`  Extracted ${routes.length} NestJS routes:`);
    for (const r of routes) {
      console.log(`    ${r.method.padEnd(6)} ${r.pattern.padEnd(25)} (${r.filePath})`);
    }

    // Route 1: GET /cats/:id
    const route1 = routes.find((r) => r.method === 'GET' && r.pattern === '/cats/:id');
    assert(Boolean(route1), 'Route 1 found in table: GET /cats/:id');
    const route1FileContent = fs.readFileSync(path.join(nestRepo, route1!.filePath), 'utf8');
    assert(
      route1FileContent.includes("@Controller('cats')") && route1FileContent.includes("@Get(':id')"),
      'Route 1 confirmed in code: @Controller("cats") + @Get(":id") matches GET /cats/:id'
    );

    // Route 2: POST /cats
    const route2 = routes.find((r) => r.method === 'POST' && r.pattern === '/cats');
    assert(Boolean(route2), 'Route 2 found in table: POST /cats');
    const route2FileContent = fs.readFileSync(path.join(nestRepo, route2!.filePath), 'utf8');
    assert(
      route2FileContent.includes("@Controller('cats')") && route2FileContent.includes("@Post()"),
      'Route 2 confirmed in code: @Controller("cats") + @Post() matches POST /cats'
    );

    // Route 3: PUT /api/v1/users/:id
    const route3 = routes.find((r) => r.method === 'PUT' && r.pattern === '/api/v1/users/:id');
    assert(Boolean(route3), 'Route 3 found in table: PUT /api/v1/users/:id');
    const route3FileContent = fs.readFileSync(path.join(nestRepo, route3!.filePath), 'utf8');
    assert(
      route3FileContent.includes("@Controller('api/v1/users')") && route3FileContent.includes("@Put(':id')"),
      'Route 3 confirmed in code: @Controller("api/v1/users") + @Put(":id") matches PUT /api/v1/users/:id'
    );
  } finally {
    cleanupDir(nestRepo);
  }

  // --------------------------------------------------------------------------
  // Check 4: Repository Matching No Adapter
  // --------------------------------------------------------------------------
  console.log('\n--- Check 4: Repository Matching No Adapter ---');
  const genericRepo = createTempRepo('generic');
  try {
    writeFixtureFile(
      genericRepo,
      'package.json',
      JSON.stringify({
        name: 'pure-utils',
        version: '1.0.0',
        dependencies: { lodash: '^4.17.21' },
      })
    );
    writeFixtureFile(genericRepo, 'src/math.ts', 'export function add(a: number, b: number) { return a + b; }');
    writeFixtureFile(genericRepo, 'src/string.ts', 'export function upper(s: string) { return s.toUpperCase(); }');
    writeFixtureFile(
      genericRepo,
      'src/index.ts',
      'import { add } from "./math";\nimport { upper } from "./string";\nexport { add, upper };'
    );

    const genericResult = parseRepository(genericRepo);
    assert(genericResult.adapter === 'none', 'Generic repository resolves to fallback "none" adapter');

    // Roles are generic (null)
    const allRolesNull = genericResult.files.every((f) => f.role === null);
    assert(allRolesNull, 'All file roles in generic repository are generic (null)');

    // Route table is empty rather than wrong
    assert(
      Array.isArray(genericResult.routes) && genericResult.routes.length === 0,
      'Route table is empty rather than wrong (0 routes)'
    );

    // Left rail renders extension-based categories
    const categories = categorizeFiles(genericResult.files, genericResult.adapter);
    assert(
      categories.some((c) => c.name === '.ts'),
      'Generic repository left rail displays extension categories (.ts)'
    );
  } finally {
    cleanupDir(genericRepo);
  }

  // --------------------------------------------------------------------------
  // Check 5: Parser Core Contains Zero Occurrences of "nextjs"
  // --------------------------------------------------------------------------
  console.log('\n--- Check 5: Parser Core Nextjs Isolation Audit ---');
  const parserDir = path.resolve('lib/parser');
  const coreFiles = fs
    .readdirSync(parserDir)
    .filter((file) => file.endsWith('.ts') && !fs.statSync(path.join(parserDir, file)).isDirectory());

  console.log('  Auditing core parser files:', coreFiles);
  let nextjsCountInCore = 0;

  for (const file of coreFiles) {
    const fullPath = path.join(parserDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const matches = content.match(/nextjs/gi);
    if (matches) {
      console.error(`  [VIOLATION] Found ${matches.length} occurrence(s) of "nextjs" in core file: lib/parser/${file}`);
      nextjsCountInCore += matches.length;
    }
  }

  assert(
    nextjsCountInCore === 0,
    `Search parser core for "nextjs": found 0 occurrences (appears in adapter and nowhere else)`
  );

  const adapterFile = path.join(parserDir, 'adapters', 'nextjs.ts');
  assert(
    fs.existsSync(adapterFile),
    'Adapter file exists at lib/parser/adapters/nextjs.ts'
  );

  console.log('\n====================================================');
  console.log(`Phase 8 Acceptance Results: ${passCount} Passed, ${failCount} Failed`);
  console.log('====================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase08Verification().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});

