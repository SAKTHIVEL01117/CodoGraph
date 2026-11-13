/**
 * CodoGraph — Phase 12: Comprehensive Agent & Tool Verification.
 *
 * Runs via: pnpm agent-check
 *
 * Verifies:
 * 1. Part A: Short-lived signed credentials, cryptographic tamper rejection, and read-only HTTP endpoints.
 * 2. Part B: Deep agent behavioral checks (never-infer rule, context resolution, subjective refusal).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

function runSubprocess(cmd: string, args: string[], cwd = process.cwd()): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    console.log(`\n>>> Running: ${cmd} ${args.join(' ')} (in ${cwd})`);
    const child = spawn(cmd, args, {
      cwd,
      shell: true,
      stdio: 'inherit',
      env: process.env,
    });

    child.on('close', (code) => {
      resolve({ code: code ?? 0, stdout: '' });
    });
  });
}

async function main() {
  console.log('====================================================');
  console.log('CodoGraph Phase 12 — Agent Check Full Suite');
  console.log('====================================================\n');

  // Step 1: Run HTTP Tools & Cryptographic Credential Checks
  console.log('=== PART 1: HTTP Tools & Signed Credential Checks ===');
  const part1 = await runSubprocess('node', [
    '--experimental-strip-types',
    path.join('scripts', 'verify-phase-12-http-tools.ts'),
  ]);

  if (part1.code !== 0) {
    console.error('\n[FAIL] Part 1 (HTTP Tools & Signed Credential) failed.');
    process.exit(1);
  }

  // Step 2: Run Deep Agent Execution Checks
  console.log('\n=== PART 2: Deep Agent Execution & Behavioral Constraints ===');
  const part2 = await runSubprocess('node', ['test-agent.js'], path.join(process.cwd(), 'codograph-agent'));

  if (part2.code !== 0) {
    console.error('\n[FAIL] Part 2 (Deep Agent Invariants) failed.');
    process.exit(1);
  }

  console.log('\n====================================================');
  console.log('Phase 12 Agent Check: ALL SUITES PASSED CLEANLY');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('[FATAL]:', err);
  process.exit(1);
});

