/**
 * CodoGraph — Phase 7: GitHub Archive Fetcher & Extractor.
 *
 * Invariants:
 * 1. Fetches public repositories as unauthenticated archives.
 * 2. No repository scope is requested and NO token is ever stored.
 * 3. Records the exact commit SHA the archive came from.
 * 4. Extracts archive to an isolated temporary directory, with robust cleanup.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import * as tar from 'tar';

export interface GitHubCoordinates {
  owner: string;
  repo: string;
  ref?: string;
  canonicalUrl: string;
}

export interface FetchedRepository {
  /** Directory containing the extracted source code (inside the single root folder). */
  extractedDir: string;
  /** Parent temporary directory created for this fetch, to be removed on cleanup. */
  tempDir: string;
  /** The commit hash (full 40-char SHA if available, or 7-char short SHA). */
  commitHash: string;
  /** Canonical normalized repository URL (e.g. "https://github.com/owner/repo"). */
  canonicalUrl: string;
  /** Name of the repository (e.g. "tailwindcss"). */
  repoName: string;
  /** Target branch or ref (e.g. "main"). */
  branch: string;
  /** Cleans up the temporary directory. Safe to call multiple times. */
  cleanup: () => Promise<void>;
}

/**
 * Normalizes and parses various GitHub URL shapes into owner, repo, and optional ref.
 *
 * Supported patterns:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo.git
 * - https://github.com/owner/repo/tree/branch-name
 * - github.com/owner/repo
 * - owner/repo
 */
export function parseGitHubUrl(input: string): GitHubCoordinates {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Repository URL cannot be empty.');
  }

  const githubRegex = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/tree\/([a-zA-Z0-9_./-]+))?/;
  const shorthandRegex = /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:#([a-zA-Z0-9_./-]+))?$/;

  let owner = '';
  let repo = '';
  let ref: string | undefined = undefined;

  const ghMatch = trimmed.match(githubRegex);
  if (ghMatch) {
    owner = ghMatch[1];
    repo = ghMatch[2].replace(/\.git$/, '');
    ref = ghMatch[3];
  } else {
    const shortMatch = trimmed.match(shorthandRegex);
    if (shortMatch) {
      owner = shortMatch[1];
      repo = shortMatch[2].replace(/\.git$/, '');
      ref = shortMatch[3];
    } else {
      throw new Error(
        `Invalid GitHub repository URL: "${input}". Format should be https://github.com/owner/repo`
      );
    }
  }

  // Remove trailing slashes or .git
  repo = repo.replace(/\/+$/, '').replace(/\.git$/, '');

  return {
    owner,
    repo,
    ref: ref?.trim(),
    canonicalUrl: `https://github.com/${owner}/${repo}`,
  };
}

/**
 * Fetches commit metadata from GitHub public API without authentication.
 */
async function fetchCommitSha(coords: GitHubCoordinates): Promise<string | null> {
  const targetRef = coords.ref || 'HEAD';
  const url = `https://api.github.com/repos/${coords.owner}/${coords.repo}/commits/${targetRef}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CodoGraph/1.0',
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (res.status === 404) {
      throw new Error(
        `Repository not found or private: ${coords.owner}/${coords.repo}. Only public GitHub repositories are supported.`
      );
    }

    if (res.ok) {
      const data = (await res.json()) as { sha?: string };
      if (data?.sha) {
        return data.sha;
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Repository not found')) {
      throw err;
    }
    // Rate limit or network hiccup; fallback to header/archive inspection
  }

  return null;
}

/**
 * Fetches a public GitHub repository as an unauthenticated tarball archive,
 * extracts it to a temporary directory, and records the commit SHA.
 */
export async function fetchRepositoryArchive(inputUrl: string): Promise<FetchedRepository> {
  const coords = parseGitHubUrl(inputUrl);

  // 1. Resolve commit SHA if available via public commits API
  let commitHash = await fetchCommitSha(coords);

  // 2. Fetch the tarball archive
  const tarballEndpoint = coords.ref
    ? `https://api.github.com/repos/${coords.owner}/${coords.repo}/tarball/${coords.ref}`
    : `https://api.github.com/repos/${coords.owner}/${coords.repo}/tarball`;

  const response = await fetch(tarballEndpoint, {
    headers: {
      'User-Agent': 'CodoGraph/1.0',
      Accept: 'application/vnd.github.v3+json',
    },
    redirect: 'follow',
  });

  if (response.status === 404) {
    throw new Error(
      `Repository not found or private: ${coords.owner}/${coords.repo}. Only public repositories are supported.`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Failed to download repository archive from GitHub: HTTP ${response.status} ${response.statusText}`
    );
  }

  // 3. Fallback commit hash extraction from Content-Disposition header if not yet known
  if (!commitHash) {
    const contentDisp = response.headers.get('content-disposition');
    if (contentDisp) {
      // e.g. attachment; filename=octocat-Hello-World-7fd1a60.tar.gz
      const match = contentDisp.match(/-([0-9a-fA-F]{7,40})\.tar\.gz/);
      if (match) {
        commitHash = match[1];
      }
    }
  }

  // 4. Create isolated temporary directory
  const runId = crypto.randomUUID();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `codograph-${coords.repo}-${runId}-`));
  const tarballPath = path.join(tempDir, 'archive.tar.gz');
  const extractDir = path.join(tempDir, 'extracted');
  fs.mkdirSync(extractDir, { recursive: true });

  const cleanup = async () => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Best-effort cleanup
    }
  };

  try {
    // 5. Stream or write archive buffer to disk
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(tarballPath, Buffer.from(arrayBuffer));

    // 6. Extract archive using pure Node.js tar parser (avoids OS tar CLI differences and Windows colon C: issues)
    await tar.x({
      file: tarballPath,
      cwd: extractDir,
    });

    // 7. Locate root repository directory inside the extracted archive
    const entries = fs.readdirSync(extractDir);
    if (entries.length === 0) {
      throw new Error('Extracted repository archive is empty.');
    }

    const rootDirName = entries[0];
    const extractedDir = path.join(extractDir, rootDirName);

    // If commit hash was still not determined, extract it from the root directory name
    if (!commitHash) {
      const match = rootDirName.match(/-([0-9a-fA-F]{7,40})$/);
      if (match) {
        commitHash = match[1];
      } else {
        commitHash = 'unknown';
      }
    }

    return {
      extractedDir,
      tempDir,
      commitHash,
      canonicalUrl: coords.canonicalUrl,
      repoName: coords.repo,
      branch: coords.ref || 'main',
      cleanup,
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

