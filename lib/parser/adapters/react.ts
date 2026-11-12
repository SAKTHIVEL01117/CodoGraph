/**
 * CodoGraph — React Framework Adapter.
 *
 * Implements Phase 8 React support:
 * 1. Activates for standalone React repositories (runs after Next.js in detection order).
 * 2. Role classification:
 *    - Views: views/**, pages/**
 *    - Components: components/** or *.component.tsx
 *    - Hooks: hooks/** or use*.ts(x)
 *    - Contexts: contexts/** or *context*.ts(x)
 * 3. Route extraction:
 *    - Plain React applications have no static path-convention routes recoverable
 *      with zero inference without a router adapter; returns an empty route table.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { FrameworkAdapter } from './types.ts';
import type { DiscoveredFile, ExtractedRoute } from '../types.ts';

export const reactAdapter: FrameworkAdapter = {
  name: 'react',

  detect(repositoryRoot: string): boolean {
    const pkgPath = path.join(repositoryRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.dependencies?.react || pkg.devDependencies?.react) {
          return true;
        }
      } catch {
        // Continue if malformed JSON
      }
    }
    return false;
  },

  classifyFile(file: DiscoveredFile): string | null {
    const norm = file.path.replace(/\\/g, '/');
    const base = path.basename(norm);

    // 1. Views / Pages
    if (/(?:^|\/)(?:views|pages)\/.+\.(tsx|jsx|js|ts)$/.test(norm)) {
      return 'Views';
    }

    // 2. Custom hooks
    if (
      /(?:^|\/)hooks\/.+\.(ts|js|tsx|jsx)$/.test(norm) ||
      /^use[A-Z].*\.(ts|js|tsx|jsx)$/.test(base)
    ) {
      return 'Hooks';
    }

    // 3. Contexts / State
    if (
      /(?:^|\/)contexts?\/.+\.(ts|js|tsx|jsx)$/.test(norm) ||
      /(?:context|provider)\.(ts|js|tsx|jsx)$/i.test(base)
    ) {
      return 'Contexts';
    }

    // 4. Components
    if (
      /(?:^|\/)components?\/.+\.(tsx|jsx)$/.test(norm) ||
      /\.component\.(tsx|jsx)$/.test(base) ||
      file.extension === '.tsx' ||
      file.extension === '.jsx'
    ) {
      return 'Components';
    }

    return null;
  },

  extractRoutes(): ExtractedRoute[] {
    // Standalone React SPA has no framework-level route conventions
    return [];
  },
};

