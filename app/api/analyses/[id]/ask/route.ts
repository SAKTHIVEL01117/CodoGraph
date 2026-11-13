/**
 * CodoGraph — Phase 12: Agent Streaming Ask Entrypoint.
 *
 * Requirements (docs/specs/phase-12.md):
 * 1. Proves the asker owns the analysis via Clerk authenticated org context.
 * 2. Mints the short-lived signed credential naming exactly one analysis and its organization.
 * 3. Opens a conversation with the external agent service and relays the stream back.
 * 4. Streaming required: shows each tool call as it happens.
 * 5. Fails gracefully if the agent process is stopped without crashing the rest of the application.
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAnalysisById } from '@/lib/pipeline/storage';
import { mintAgentCredential } from '@/lib/auth/agent-credential';
import { spawn } from 'node:child_process';
import path from 'node:path';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:4000';

let spawningPromise: Promise<boolean> | null = null;

async function ensureAgentRunning(url: string): Promise<boolean> {
  // 1. Quick probe
  try {
    const probe = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1200) });
    if (probe.ok) return true;
  } catch {
    // service not reachable yet
  }

  // 2. Only attempt auto-spawn for localhost/127.0.0.1
  const isLocal = url.includes('127.0.0.1') || url.includes('localhost');
  if (!isLocal) return false;

  if (spawningPromise) {
    return spawningPromise;
  }

  spawningPromise = (async () => {
    try {
      const agentDir = path.join(process.cwd(), 'codograph-agent');
      const child = spawn(process.execPath, ['server.js'], {
        cwd: agentDir,
        detached: true,
        stdio: 'ignore',
        shell: false,
      });
      child.unref();

      // Poll up to 6 times (3 seconds total)
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const check = await fetch(`${url}/health`, { signal: AbortSignal.timeout(800) });
          if (check.ok) return true;
        } catch {
          // retry
        }
      }
    } catch (err) {
      console.warn('[CodoGraph Auto-Spawn Warning]: Could not auto-launch agent process:', err);
    } finally {
      spawningPromise = null;
    }
    return false;
  })();

  return spawningPromise;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate user
    const ctx = await resolveOrgContext(false);
    if (!ctx.isAuthenticated || !ctx.userId || !ctx.orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    // 2. Strict RLS check: prove asker owns analysis
    const supabase = await createSupabaseServerClient();
    const analysis = await getAnalysisById(supabase, id);

    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found or inaccessible.' }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      messages?: Array<{ role: string; content: string }>;
      selectedFile?: string | null;
    };

    const messages = body.messages || [];
    if (messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required.' }, { status: 400 });
    }

    // 3. Mint short-lived signed credential naming this analysis and its organization
    const credential = mintAgentCredential({
      analysisId: analysis.id,
      orgId: ctx.orgId,
      ttlSeconds: 900,
    });

    // 4. Relay request to agent service (auto-spawning if stopped locally)
    try {
      await ensureAgentRunning(AGENT_SERVICE_URL);

      const agentRes = await fetch(`${AGENT_SERVICE_URL}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Credential': credential,
        },
        body: JSON.stringify({
          messages,
          credential,
          selectedFile: body.selectedFile,
          apiBaseUrl: process.env.CODOGRAPH_API_BASE_URL || req.nextUrl.origin,
        }),
      });

      if (!agentRes.ok || !agentRes.body) {
        throw new Error(`Agent service responded with status ${agentRes.status}`);
      }

      // Return streaming response directly
      return new Response(agentRes.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    } catch {
      // Agent is unreachable (e.g. process is not running)
      // Per spec constraint 5: When the agent is unreachable, the application keeps working
      const encoder = new TextEncoder();
      const customStream = new ReadableStream({
        start(controller) {
          const errData = JSON.stringify({
            error:
              'The CodoGraph Agent service is currently unreachable (port 4000). Start the agent process with `npm --prefix codograph-agent start` to enable live Ask mode.',
            unreachable: true,
          });
          controller.enqueue(encoder.encode(`event: error\ndata: ${errData}\n\n`));
          controller.close();
        },
      });

      return new Response(customStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });
    }
  } catch (error) {
    console.error('[CodoGraph /api/analyses/[id]/ask Error]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Ask server error' },
      { status: 500 }
    );
  }
}

