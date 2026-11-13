/**
 * CodoGraph — Phase 12: Unified Agent Tools Dispatcher & Catalog.
 *
 * Exposes:
 * - GET: Manifest of all six registered read-only tools and their invocation contracts.
 * - POST: Universal tool execution dispatch using the short-lived signed credential.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  extractAndVerifyCredential,
  AgentCredentialError,
} from '@/lib/auth/agent-credential';
import {
  executeSummaryTool,
  executeSearchFilesTool,
  executeListFilesByRoleTool,
  executeGetFileNeighboursTool,
  executeTransitiveWalkTool,
  executeGetRouteTableTool,
  ToolExecutionError,
} from '@/lib/agent/tools-service';

export async function GET(req: NextRequest) {
  try {
    // Optionally validates credential if provided, but catalog description is public
    let boundAnalysis: string | null = null;
    try {
      const credential = extractAndVerifyCredential(req);
      boundAnalysis = credential.analysisId;
    } catch {
      // Unauthenticated callers may still read the tool manifest
    }

    return NextResponse.json({
      status: 'ready',
      version: '1.0.0',
      boundAnalysis,
      tools: [
        {
          name: 'get_analysis_summary',
          description: 'Returns a high-level summary of the entire repository analysis graph.',
          parameters: {},
        },
        {
          name: 'search_files',
          description: 'Searches repository files by path substring match.',
          parameters: { query: { type: 'string', required: true } },
        },
        {
          name: 'list_files_by_role',
          description: 'Lists all files assigned a specific architectural role.',
          parameters: { role: { type: 'string', required: true } },
        },
        {
          name: 'get_file_neighbours',
          description: 'Looks up the direct import dependencies and callers of a file.',
          parameters: { file_path: { type: 'string', required: true } },
        },
        {
          name: 'transitive_walk',
          description: 'Traverses the graph transitively in direction incoming (blast radius) or outgoing (dependencies).',
          parameters: {
            file_path: { type: 'string', required: true },
            direction: { type: 'string', enum: ['incoming', 'outgoing'], default: 'incoming' },
            depth: { type: 'number', minimum: 1, maximum: 5, default: 2 },
          },
        },
        {
          name: 'get_route_table',
          description: 'Retrieves all declared HTTP API and page routes.',
          parameters: {},
        },
      ],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const credential = extractAndVerifyCredential(req);
    const body = (await req.json().catch(() => ({}))) as {
      tool?: string;
      name?: string;
      args?: Record<string, unknown>;
      parameters?: Record<string, unknown>;
    };

    const toolName = body.tool || body.name;
    const args = body.args || body.parameters || {};

    if (!toolName || typeof toolName !== 'string') {
      return NextResponse.json(
        { error: 'Missing required "tool" field in request body.' },
        { status: 400 }
      );
    }

    switch (toolName.toLowerCase()) {
      case 'summary':
      case 'get_analysis_summary': {
        const summary = await executeSummaryTool(credential);
        return NextResponse.json(summary);
      }

      case 'search':
      case 'search_files': {
        const query = typeof args.query === 'string' ? args.query : typeof args.q === 'string' ? args.q : '';
        const results = await executeSearchFilesTool(credential, query);
        return NextResponse.json(results);
      }

      case 'roles':
      case 'list_files_by_role': {
        const role = typeof args.role === 'string' ? args.role : '';
        const results = await executeListFilesByRoleTool(credential, role);
        return NextResponse.json(results);
      }

      case 'neighbours':
      case 'neighbors':
      case 'get_file_neighbours': {
        const filePath =
          typeof args.file_path === 'string'
            ? args.file_path
            : typeof args.filePath === 'string'
            ? args.filePath
            : typeof args.file === 'string'
            ? args.file
            : '';
        const results = await executeGetFileNeighboursTool(credential, filePath);
        return NextResponse.json(results);
      }

      case 'walk':
      case 'transitive_walk': {
        const filePath =
          typeof args.file_path === 'string'
            ? args.file_path
            : typeof args.filePath === 'string'
            ? args.filePath
            : typeof args.file === 'string'
            ? args.file
            : '';
        const direction = args.direction === 'outgoing' ? 'outgoing' : 'incoming';
        const depth = typeof args.depth === 'number' ? args.depth : 2;
        const results = await executeTransitiveWalkTool(credential, filePath, direction, depth);
        return NextResponse.json(results);
      }

      case 'routes':
      case 'get_route_table': {
        const routes = await executeGetRouteTableTool(credential);
        return NextResponse.json(routes);
      }

      default:
        return NextResponse.json(
          {
            error: `Unknown tool name: '${toolName}'. Available tools: get_analysis_summary, search_files, list_files_by_role, get_file_neighbours, transitive_walk, get_route_table.`,
          },
          { status: 404 }
        );
    }
  } catch (error) {
    if (error instanceof AgentCredentialError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof ToolExecutionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[CodoGraph /api/agent/tools POST Error]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal tool execution error' },
      { status: 500 }
    );
  }
}
