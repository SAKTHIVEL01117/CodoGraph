/**
 * CodoGraph Agent — Six Core Graph Tools.
 *
 * Requirements (Phase 12):
 * 1. a summary of the whole analysis
 * 2. searching files by part of a path
 * 3. listing files by role
 * 4. direct neighbours of a file
 * 5. a transitive walk in either direction
 * 6. the route table.
 *
 * Constraint:
 * "Those tools call the SAME graph functions that draw the canvas. They do not reimplement any of it."
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  getAnalysisSummary,
  searchFiles,
  listFilesByRole,
  getFileNeighbours,
  getTransitiveWalk,
  getRouteTable,
} from '../graph-provider.js';

/**
 * Tool 1: Summary of the whole analysis
 */
export const toolAnalysisSummary = tool(
  async () => {
    const summary = await getAnalysisSummary();
    return JSON.stringify(
      {
        repositoryName: summary.repositoryName,
        framework: summary.frameworkDetected,
        totalFiles: summary.filesCount,
        totalImports: summary.importsCount,
        totalRoutes: summary.routesCount,
        unidentifiedFilesCount: summary.unidentifiedCount,
        topDependedOnFiles: summary.mostDependedOn.slice(0, 5).map((f) => ({
          path: f.path,
          role: f.role,
          fanIn: f.fanIn,
        })),
        readingEntryPoints: summary.readingStarts.slice(0, 5).map((f) => ({
          path: f.path,
          role: f.role,
        })),
      },
      null,
      2
    );
  },
  {
    name: 'get_analysis_summary',
    description:
      'Get a high-level summary of the entire repository analysis, including detected framework, file and import counts, route counts, and key architectural entry points.',
    schema: z.object({}),
  }
);

/**
 * Tool 2: Searching files by part of a path
 */
export const toolSearchFiles = tool(
  async ({ query }) => {
    const matches = await searchFiles(query);
    return JSON.stringify(matches, null, 2);
  },
  {
    name: 'search_files',
    description:
      'Search for files in the repository by part of their file path or filename (substring match).',
    schema: z.object({
      query: z
        .string()
        .describe(
          'Substring of the file path or name to search for (e.g. "auth", "user", "page", "route", "service")'
        ),
    }),
  }
);

/**
 * Tool 3: Listing files by role
 */
export const toolListFilesByRole = tool(
  async ({ role }) => {
    const files = await listFilesByRole(role);
    return JSON.stringify(files, null, 2);
  },
  {
    name: 'list_files_by_role',
    description:
      'List all files in the repository matching an architectural role (e.g. "service", "repository", "model", "util", "config", "component", "hook", "page", "route", "controller").',
    schema: z.object({
      role: z
        .string()
        .describe(
          'The architectural role to filter by (e.g. "service", "repository", "model", "util", "component", "hook", "page", "route")'
        ),
    }),
  }
);

/**
 * Tool 4: Direct neighbours of a file
 */
export const toolGetFileNeighbours = tool(
  async ({ file_path }) => {
    const neighbours = await getFileNeighbours(file_path);
    return JSON.stringify(
      {
        filePath: neighbours.filePath,
        dependencies: neighbours.dependencies,
        dependents: neighbours.dependents,
        totalDependencies: neighbours.dependencies.length,
        totalDependents: neighbours.dependents.length,
      },
      null,
      2
    );
  },
  {
    name: 'get_file_neighbours',
    description:
      'Get direct incoming and outgoing neighbours of a file in the dependency graph. Shows dependencies (files it imports) and dependents (files importing it).',
    schema: z.object({
      file_path: z.string().describe('Exact relative path of the file to inspect (e.g. "services/auth-service.ts")'),
    }),
  }
);

/**
 * Tool 5: Transitive walk in either direction
 */
export const toolTransitiveWalk = tool(
  async ({ file_path, direction, depth = 2 }) => {
    const walk = await getTransitiveWalk(file_path, direction, depth);
    return JSON.stringify(
      {
        startPath: walk.startPath,
        direction: walk.direction,
        maxDepth: walk.maxDepth,
        level1Count: walk.level1.length,
        level2Count: walk.level2.length,
        totalAffected: walk.all.length,
        level1: walk.level1,
        level2: walk.level2,
        allNodesWithDepth: walk.all,
      },
      null,
      2
    );
  },
  {
    name: 'transitive_walk',
    description:
      'Perform a transitive walk across the dependency graph in either direction up to 2 levels deep. Use direction "incoming" for blast radius (all modules that break if this file changes) or "outgoing" for the full dependency chain.',
    schema: z.object({
      file_path: z.string().describe('Exact relative file path from which to begin the transitive walk'),
      direction: z
        .enum(['incoming', 'outgoing'])
        .describe(
          'Direction of walk: "incoming" = blast radius (who imports/breaks if changed); "outgoing" = dependencies (what it needs)'
        ),
      depth: z.number().optional().default(2).describe('Maximum transitive depth to walk (default: 2)'),
    }),
  }
);

/**
 * Tool 6: The route table
 */
export const toolGetRouteTable = tool(
  async () => {
    const routes = await getRouteTable();
    return JSON.stringify(routes, null, 2);
  },
  {
    name: 'get_route_table',
    description:
      'Retrieve the declared route table of the repository, including HTTP methods, URL patterns, handling file paths, and line numbers.',
    schema: z.object({}),
  }
);

export const allAgentTools = [
  toolAnalysisSummary,
  toolSearchFiles,
  toolListFilesByRole,
  toolGetFileNeighbours,
  toolTransitiveWalk,
  toolGetRouteTable,
];
