/**
 * CodoGraph — Framework Adapters Registry.
 *
 * Invariant: Detection runs in a fixed order and the first match wins.
 * A repository matching nothing resolves to the fallback adapter ("none")
 * with generic roles and an empty route table.
 */
import type { FrameworkAdapter } from './types.ts';
import type { DiscoveredFile } from '../types.ts';
import { nextjsAdapter } from './nextjs.ts';
import { nestjsAdapter } from './nestjs.ts';
import { expressAdapter } from './express.ts';
import { reactAdapter } from './react.ts';
import { fallbackAdapter } from './fallback.ts';

export const REGISTERED_ADAPTERS: readonly FrameworkAdapter[] = [
  nextjsAdapter,
  nestjsAdapter,
  expressAdapter,
  reactAdapter,
  fallbackAdapter,
] as const;

/**
 * Evaluates registered framework adapters in fixed priority order.
 * First adapter whose detect() returns true is selected.
 */
export function detectAdapter(
  repositoryRoot: string,
  files: DiscoveredFile[]
): FrameworkAdapter {
  for (const adapter of REGISTERED_ADAPTERS) {
    if (adapter.detect(repositoryRoot, files)) {
      return adapter;
    }
  }
  return fallbackAdapter;
}

export * from './types.ts';
export * from './fallback.ts';
export * from './nextjs.ts';
export * from './nestjs.ts';
export * from './express.ts';
export * from './react.ts';

