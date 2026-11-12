/**
 * CodoGraph — Phase 9 Acceptance Verification Script.
 *
 * Verifies all build items, constraints, and acceptance checks from docs/specs/phase-09.md:
 * 1. Express CommonJS repository using require() produces a real dependency graph
 *    (non-zero edges, working relative/parent index resolution, and extracted CommonJS exports).
 * 2. Coverage on that repository reports a real denominator (> 0) rather than 100% over 0 / 0,
 *    and accurately tracks resolved vs unresolved require() calls.
 * 3. Express adapter assigns roles from directory conventions accepting both singular and
 *    plural folder names, agrees with the browser-safe taxonomy rail, and returns [].
 * 4. Mixed require() and import in the same file reports both without duplicate edges or
 *    inflated fanIn/fanOut.
 * 5. Detection precedence (NestJS + express -> nestjs; React + devexpress -> react; generic -> none)
 *    and parser core isolation (zero framework names in lib/parser/*.ts).
 * 6. Zero CommonJS regressions on existing ESM/TypeScript repository (Codograph self-parse).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseRepository, expressAdapter } from '../lib/parser/index.ts';
import { categorizeFiles } from '../lib/canvas/taxonomy.ts';

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

function createTempRepo(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `codograph-p9-${prefix}-`));
}

function cleanupDir(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore Windows cleanup locks
  }
}

function writeFixtureFile(root: string, relPath: string, content: string) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

async function runPhase09Verification() {
  console.log('====================================================');
  console.log('CodoGraph Phase 9 CommonJS & Express Verification');
  console.log('====================================================\n');

  // --------------------------------------------------------------------------
  // Check 1 & 2: Express CommonJS Repo (Edges, Real Coverage Denominator, Exports, Roles)
  // --------------------------------------------------------------------------
  console.log('--- Check 1 & 2: Express CommonJS Graph, Coverage, Exports & Roles ---');
  const expressRepo = createTempRepo('express-cjs');
  try {
    writeFixtureFile(
      expressRepo,
      'package.json',
      JSON.stringify({
        name: 'acme-express-api',
        dependencies: { express: '^4.19.2' },
      })
    );

    // Plural & singular routes
    writeFixtureFile(
      expressRepo,
      'routes/users.js',
      `const express = require('express');
const { listUsers, createUser } = require('../controllers/userController');
const { requireAuth } = require('../middlewares/auth');
const router = express.Router();
router.get('/', requireAuth, listUsers);
router.post('/', requireAuth, createUser);
module.exports = router;`
    );
    writeFixtureFile(
      expressRepo,
      'route/health.js',
      `const express = require('express');
exports.healthRouter = express.Router();`
    );

    // Plural & singular controllers
    writeFixtureFile(
      expressRepo,
      'controllers/userController.js',
      `const userService = require('../services/userService');
exports.listUsers = async (req, res) => res.json(await userService.findAll());
exports.createUser = async (req, res) => res.json(await userService.create(req.body));`
    );
    writeFixtureFile(
      expressRepo,
      'controller/authController.js',
      `const authValidator = require('../validator/authValidator');
const login = () => authValidator;
const logout = () => true;
module.exports = { login, logout };`
    );

    // Plural & singular middlewares
    writeFixtureFile(
      expressRepo,
      'middlewares/auth.js',
      `const jwt = require('../utils/jwt');
module.exports.requireAuth = (req, res, next) => jwt.verify() && next();`
    );
    writeFixtureFile(
      expressRepo,
      'middleware/errorHandler.js',
      `module.exports = function handleErrors(err, req, res, next) { res.status(500).end(); };`
    );

    // Validator, Service, Repository, Models, Schema, View, Config, Util
    writeFixtureFile(
      expressRepo,
      'validator/authValidator.js',
      `Object.defineProperty(exports, 'loginSchema', { value: { required: ['email'] } });`
    );
    writeFixtureFile(
      expressRepo,
      'services/userService.js',
      `const User = require('../models/User');
const repo = require('../repositories/userRepo');
const api = {
  findAll: () => repo.findById(User),
  create: (input) => repo.save(input),
};
module.exports = api;`
    );
    writeFixtureFile(
      expressRepo,
      'repositories/userRepo.js',
      `const Session = require('../model/Session');
const findById = (id) => Session;
const save = (doc) => doc;
Object.assign(exports, { findById, save });`
    );
    writeFixtureFile(
      expressRepo,
      'models/User.js',
      `function User() {}
exports = module.exports = User;`
    );
    writeFixtureFile(
      expressRepo,
      'model/Session.js',
      `module.exports = class SessionModel {};`
    );
    writeFixtureFile(
      expressRepo,
      'schema/auditSchema.js',
      `module.exports = { event: 'string', actor: 'string' };`
    );
    writeFixtureFile(
      expressRepo,
      'views/email.js',
      `exports.renderWelcome = (name) => 'Welcome ' + name;`
    );
    writeFixtureFile(
      expressRepo,
      'utils/jwt.js',
      `const crypto = require('node:crypto');
exports.verify = () => Boolean(crypto);`
    );
    writeFixtureFile(
      expressRepo,
      'config/db.js',
      `module.exports = { url: 'postgres://localhost/db' };`
    );
    writeFixtureFile(
      expressRepo,
      'configs/redis.js',
      `module.exports = { host: '127.0.0.1' };`
    );

    // App entrypoint & intentional unresolved + dynamic require to verify real denominator
    writeFixtureFile(
      expressRepo,
      'app.js',
      `const express = require('express');
const usersRouter = require('./routes/users');
const { healthRouter } = require('./route/health');
const handleErrors = require('./middleware/errorHandler');
const authCtrl = require('./controller/authController');
const audit = require('./schema/auditSchema');
const emailView = require('./views/email');
const db = require('./config/db');
const missing = require('./non-existent-plugin');
const dynName = 'dynamic';
const dynamicMod = require(dynName);
module.exports = { express, usersRouter, healthRouter, handleErrors, authCtrl, audit, emailView, db, missing, dynamicMod };`
    );
    writeFixtureFile(
      expressRepo,
      'index.js',
      `const app = require('./app');
const redis = require('./configs/redis');
module.exports = { app, redis };`
    );

    // Singular & plural test directories (including Mocha file in test/ calling require('..'))
    writeFixtureFile(
      expressRepo,
      'test/app.js',
      `const entry = require('..');
module.exports = entry;`
    );
    writeFixtureFile(
      expressRepo,
      'tests/users.test.js',
      `const users = require('../routes/users');
module.exports = users;`
    );

    const result = parseRepository(expressRepo);
    assert(result.adapter === 'express', `Adapter is 'express' (got '${result.adapter}')`);
    assert(
      Array.isArray(result.routes) && result.routes.length === 0,
      `Express routes are NOT extracted (routes.length === ${result.routes.length})`
    );
    assert(
      result.edges.length >= 16,
      `Real dependency graph created with edges from require() (got ${result.edges.length} edges)`
    );
    assert(
      result.edges.every((e) => e.kind === 'require'),
      'All CommonJS dependency edges carry kind === "require"'
    );
    assert(
      result.edges.some((e) => e.sourcePath === 'test/app.js' && e.targetPath === 'index.js'),
      'Parent directory index resolution require("..") from test/app.js resolved to index.js'
    );

    // Real denominator check (Acceptance check 2)
    const cov = result.coverage;
    const denominator = cov.importsResolvedInternal + cov.importsUnresolved;
    const ratio = denominator > 0 ? Number(((cov.importsResolvedInternal / denominator) * 100).toFixed(1)) : 100;
    assert(cov.importsTotal > 0, `importsTotal has real non-zero count (${cov.importsTotal})`);
    assert(
      (cov.requiresTotal ?? 0) === cov.importsTotal && (cov.requiresResolvedInternal ?? 0) === cov.importsResolvedInternal,
      `requiresTotal (${cov.requiresTotal}) and requiresResolvedInternal (${cov.requiresResolvedInternal}) match`
    );
    assert(denominator > 0, `Coverage denominator is non-zero (${denominator})`);
    assert(cov.importsUnresolved === 2, `Detected exact 2 unresolved requires (missing + dynamic), got ${cov.importsUnresolved}`);
    assert(ratio < 100, `Coverage no longer falsely reports 100% over 0/0 (real ratio = ${ratio}%)`);

    // Check roles for both singular and plural folder conventions
    const byPath = new Map(result.files.map((f) => [f.path, f]));
    const expectedRoles: Array<[string, string | null]> = [
      ['routes/users.js', 'Routes'],
      ['route/health.js', 'Routes'],
      ['controllers/userController.js', 'Controllers'],
      ['controller/authController.js', 'Controllers'],
      ['middlewares/auth.js', 'Middleware'],
      ['middleware/errorHandler.js', 'Middleware'],
      ['validator/authValidator.js', 'Validators'],
      ['services/userService.js', 'Services'],
      ['repositories/userRepo.js', 'Repositories'],
      ['models/User.js', 'Models'],
      ['model/Session.js', 'Models'],
      ['schema/auditSchema.js', 'Schemas'],
      ['views/email.js', 'Views'],
      ['utils/jwt.js', 'Utils'],
      ['config/db.js', 'Config files'],
      ['configs/redis.js', 'Config files'],
      ['test/app.js', 'Tests'],
      ['tests/users.test.js', 'Tests'],
      ['app.js', null],
      ['index.js', null],
    ];

    for (const [filePath, role] of expectedRoles) {
      const actual = byPath.get(filePath)?.role;
      assert(actual === role, `Express role for '${filePath}' is ${String(role)}`, `got ${String(actual)}`);
    }

    // Check CommonJS exported symbol names
    const exportChecks: Array<[string, string[]]> = [
      ['routes/users.js', ['router']],
      ['route/health.js', ['healthRouter']],
      ['controllers/userController.js', ['listUsers', 'createUser']],
      ['controller/authController.js', ['login', 'logout']],
      ['middlewares/auth.js', ['requireAuth']],
      ['middleware/errorHandler.js', ['handleErrors']],
      ['validator/authValidator.js', ['loginSchema']],
      ['services/userService.js', ['findAll', 'create']],
      ['repositories/userRepo.js', ['findById', 'save']],
      ['models/User.js', ['User']],
      ['model/Session.js', ['SessionModel']],
    ];
    for (const [filePath, expectedExports] of exportChecks) {
      const actualExports = byPath.get(filePath)?.exports ?? [];
      assert(
        JSON.stringify(actualExports) === JSON.stringify(expectedExports),
        `CommonJS exports read for '${filePath}': ${JSON.stringify(actualExports)}`,
        `expected ${JSON.stringify(expectedExports)}`
      );
    }

    // Left-rail taxonomy parity (with roles populated AND with roles cleared for legacy fallback parity)
    const railWithRoles = categorizeFiles(result.files, 'express');
    const railWithoutRoles = categorizeFiles(
      result.files.map((f) => ({ ...f, role: null })),
      'express'
    );
    assert(
      JSON.stringify(railWithRoles.map((c) => [c.name, c.count])) ===
        JSON.stringify(railWithoutRoles.map((c) => [c.name, c.count])),
      'Browser-safe taxonomy fallback agrees 100% with expressAdapter.classifyFile'
    );
    assert(
      railWithRoles[0]?.name === 'Routes' && railWithRoles[0]?.count === 2,
      'Express rail reading order puts Routes first with count 2'
    );
  } finally {
    cleanupDir(expressRepo);
  }

  // --------------------------------------------------------------------------
  // Check 3: Mixed require() and import in the Same File Without Duplicates
  // --------------------------------------------------------------------------
  console.log('\n--- Check 3: Mixed require() and import Deduplication ---');
  const mixedRepo = createTempRepo('mixed');
  try {
    writeFixtureFile(mixedRepo, 'src/modA.ts', 'export const a = 1; exports.legacyA = 2;');
    writeFixtureFile(mixedRepo, 'src/modB.js', 'exports.b = 3;');
    writeFixtureFile(mixedRepo, 'src/modC.ts', 'export = { c: 4 };');
    writeFixtureFile(mixedRepo, 'src/modD.js', 'module.exports.d = 5;');
    writeFixtureFile(mixedRepo, 'src/util.ts', 'export const util = 6;');
    writeFixtureFile(
      mixedRepo,
      'src/entry.ts',
      `import { a } from './modA';
import { a as aDup } from './modA';
const modACjs = require('./modA');
const modB = require('./modB');
const modBDup = require('./modB');
import modC = require('./modC');
const modD = require(\`./modD\`);
export { util } from './util';
console.log(a, aDup, modACjs, modB, modBDup, modC, modD);`
    );

    const mixedResult = parseRepository(mixedRepo);
    const entryEdges = mixedResult.edges.filter((e) => e.sourcePath === 'src/entry.ts');
    assert(
      entryEdges.length === 6,
      `Mixed file reports both import and require without duplicate edges per kind (expected 6, got ${entryEdges.length})`
    );
    assert(
      entryEdges.some((e) => e.targetPath === 'src/modA.ts' && e.kind === 'import') &&
        entryEdges.some((e) => e.targetPath === 'src/modA.ts' && e.kind === 'require') &&
        entryEdges.some((e) => e.targetPath === 'src/modB.js' && e.kind === 'require') &&
        entryEdges.some((e) => e.targetPath === 'src/modC.ts' && e.kind === 'require') &&
        entryEdges.some((e) => e.targetPath === 'src/modD.js' && e.kind === 'require') &&
        entryEdges.some((e) => e.targetPath === 'src/util.ts' && e.kind === 're-export'),
      'All edge kinds (import, require, TypeScript import=require, template require, re-export) recorded accurately'
    );

    const entryNode = mixedResult.files.find((f) => f.path === 'src/entry.ts');
    const modANode = mixedResult.files.find((f) => f.path === 'src/modA.ts');
    const modCNode = mixedResult.files.find((f) => f.path === 'src/modC.ts');
    assert(entryNode?.fanOut === 5, `entry.ts fanOut counts 5 distinct files without inflating (${entryNode?.fanOut})`);
    assert(modANode?.fanIn === 1, `modA.ts fanIn is 1 even when reached via both import and require (${modANode?.fanIn})`);
    assert(
      JSON.stringify(modCNode?.exports) === JSON.stringify(['c']),
      `TypeScript "export = { c: 4 }" exports extracted cleanly: ${JSON.stringify(modCNode?.exports)}`
    );
  } finally {
    cleanupDir(mixedRepo);
  }

  // --------------------------------------------------------------------------
  // Check 4: Detection Precedence & Parser Core Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- Check 4: Detection Precedence & Parser Core Isolation ---');
  const nestPlusExpress = createTempRepo('nest-express');
  const reactPlusDevExpress = createTempRepo('react-devexpress');
  const exprNoPkg = createTempRepo('express-nopkg');
  try {
    writeFixtureFile(
      nestPlusExpress,
      'package.json',
      JSON.stringify({
        dependencies: { '@nestjs/core': '^10.0.0', express: '^4.19.0' },
      })
    );
    writeFixtureFile(nestPlusExpress, 'src/app.controller.ts', 'export class AppController {}');
    assert(parseRepository(nestPlusExpress).adapter === 'nestjs', 'NestJS wins over Express when both dependencies exist');

    writeFixtureFile(
      reactPlusDevExpress,
      'package.json',
      JSON.stringify({
        dependencies: { react: '^19.0.0' },
        devDependencies: { express: '^4.19.0' },
      })
    );
    writeFixtureFile(reactPlusDevExpress, 'src/App.tsx', 'export function App() { return null; }');
    assert(parseRepository(reactPlusDevExpress).adapter === 'react', 'React SPA with Express only in devDependencies remains react');

    writeFixtureFile(exprNoPkg, 'app.js', `const express = require('express');\nmodule.exports = express();`);
    assert(parseRepository(exprNoPkg).adapter === 'express', 'Package-less Express repo detected from require("express")');
  } finally {
    cleanupDir(nestPlusExpress);
    cleanupDir(reactPlusDevExpress);
    cleanupDir(exprNoPkg);
  }

  // Parser core isolation audit
  const parserDir = path.resolve('lib/parser');
  const coreFiles = fs
    .readdirSync(parserDir)
    .filter((f) => f.endsWith('.ts') && !fs.statSync(path.join(parserDir, f)).isDirectory());
  let expressInCore = 0;
  for (const file of coreFiles) {
    const text = fs.readFileSync(path.join(parserDir, file), 'utf8');
    const hits = text.match(/\bexpress\b/gi);
    if (hits) {
      console.error(`  [VIOLATION] Found "express" in core file lib/parser/${file}`);
      expressInCore += hits.length;
    }
  }
  assert(expressInCore === 0, 'Parser core (lib/parser/*.ts) contains 0 standalone occurrences of "express"');
  assert(expressAdapter.name === 'express', 'expressAdapter exported with name "express"');

  // --------------------------------------------------------------------------
  // Check 5: Determinism & Zero Regressions on Existing ESM/TypeScript Repo
  // --------------------------------------------------------------------------
  console.log('\n--- Check 5: Determinism & Existing ESM Repository Regression Check ---');
  const run1 = parseRepository('.');
  const run2 = parseRepository('.');
  const hash1 = crypto.createHash('sha256').update(JSON.stringify(run1.edges)).digest('hex');
  const hash2 = crypto.createHash('sha256').update(JSON.stringify(run2.edges)).digest('hex');
  assert(hash1 === hash2, `Codograph self-parse edge list is deterministic (SHA-256: ${hash1.slice(0, 12)}...)`);
  assert(
    run1.edges.every((e) => e.kind !== 'require') &&
      run1.files.every((f) => !f.exports || f.exports.length === 0),
    'Existing Next.js/TypeScript repository emits zero false require edges or CJS exports'
  );

  console.log('\n====================================================');
  console.log(`Phase 9 Acceptance Results: ${passCount} Passed, ${failCount} Failed`);
  console.log('====================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase09Verification().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
