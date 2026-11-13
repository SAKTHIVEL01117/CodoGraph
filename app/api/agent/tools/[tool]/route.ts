/**
 * CodoGraph — Phase 12: Read-Only HTTP Surface for Agent Tools.
 *
 * Requirements (docs/specs/phase-12.md):
 * 1. "A read-only HTTP surface for the tools, which reads an analysis without a signed-in user of its own."
 * 2. "A short-lived signed credential naming exactly one analysis and the organization it belongs to."
 * 3. "The agent is never told which analysis it's reading. That lives inside the signed credential."
 * 4. Calls the pure graph functions from '@/lib/canvas/metrics'.
 * 5. Returns deterministic JSON responses.
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  try {
    const credential = extractAndVerifyCredential(req);
    const { tool } = await params;
    const url = new URL(req.url);

    switch (tool.toLowerCase()) {
      case 'summary':
      case 'get_analysis_summary': {
        const summary = await executeSummaryTool(credential);
        return NextResponse.json(summary);
      }

      case 'search':
      case 'search_files': {
        const query = url.searchParams.get('q') || url.searchParams.get('query') || '';
        const results = await executeSearchFilesTool(credential, query);
        return NextResponse.json(results);
      }

      case 'roles':
      case 'list_files_by_role': {
        const role = url.searchParams.get('role') || '';
        const results = await executeListFilesByRoleTool(credential, role);
        return NextResponse.json(results);
      }

      case 'neighbours':
      case 'neighbors':
      case 'get_file_neighbours': {
        const filePath = url.searchParams.get('file') || url.searchParams.get('filePath') || '';
        const results = await executeGetFileNeighboursTool(credential, filePath);
        return NextResponse.json(results);
      }

      case 'walk':
      case 'transitive_walk': {
        const filePath = url.searchParams.get('file') || url.searchParams.get('filePath') || '';
        const direction = (url.searchParams.get('direction') || 'incoming') as 'incoming' | 'outgoing';
        const depth = parseInt(url.searchParams.get('depth') || '2', 10);
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
            error: `Unknown tool endpoint: '${tool}'. Available tools: summary, search, roles, neighbours, walk, routes.`,
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
    console.error('[CodoGraph /api/agent/tools/[tool] GET Error]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal tool execution error' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  try {
    const credential = extractAndVerifyCredential(req);
    const { tool } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    switch (tool.toLowerCase()) {
      case 'summary':
      case 'get_analysis_summary': {
        const summary = await executeSummaryTool(credential);
        return NextResponse.json(summary);
      }

      case 'search':
      case 'search_files': {
        const query = typeof body.query === 'string' ? body.query : typeof body.q === 'string' ? body.q : '';
        const results = await executeSearchFilesTool(credential, query);
        return NextResponse.json(results);
      }

      case 'roles':
      case 'list_files_by_role': {
        const role = typeof body.role === 'string' ? body.role : '';
        const results = await executeListFilesByRoleTool(credential, role);
        return NextResponse.json(results);
      }

      case 'neighbours':
      case 'neighbors':
      case 'get_file_neighbours': {
        const filePath =
          typeof body.file_path === 'string'
            ? body.file_path
            : typeof body.filePath === 'string'
            ? body.filePath
            : typeof body.file === 'string'
            ? body.file
            : '';
        const results = await executeGetFileNeighboursTool(credential, filePath);
        return NextResponse.json(results);
      }

      case 'walk':
      case 'transitive_walk': {
        const filePath =
          typeof body.file_path === 'string'
            ? body.file_path
            : typeof body.filePath === 'string'
            ? body.filePath
            : typeof body.file === 'string'
            ? body.file
            : '';
        const direction = body.direction === 'outgoing' ? 'outgoing' : 'incoming';
        const depth = typeof body.depth === 'number' ? body.depth : 2;
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
            error: `Unknown tool endpoint: '${tool}'. Available tools: summary, search, roles, neighbours, walk, routes.`,
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
    console.error('[CodoGraph /api/agent/tools/[tool] POST Error]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal tool execution error' },
      { status: 500 }
    );
  }
}
