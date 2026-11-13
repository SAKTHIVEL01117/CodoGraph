/**
 * CodoGraph — Script Environment Bootstrapper.
 *
 * Can be run directly via CLI to print loaded keys or imported by external scripts:
 * e.g. node --experimental-strip-types scripts/load-env.ts
 */
import { loadWorkspaceEnv } from '../lib/env-loader.ts';

const result = loadWorkspaceEnv({ quiet: false, validate: true });
console.log(`[CodoGraph] Environment loaded from ${result.loadedFiles.length} file(s):`);
result.loadedFiles.forEach((f) => console.log(`  - ${f}`));
console.log(`[CodoGraph] Loaded ${result.keysLoaded.length} environment keys.`);

