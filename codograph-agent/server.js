/**
 * CodoGraph Agent — Standalone HTTP Service & Streaming Server.
 *
 * Requirements (docs/specs/phase-12.md):
 * 1. "An agent project that runs as its own service, not inside this application."
 * 2. Reached over HTTP; streams SSE events with each tool call as it happens.
 * 3. Sets the short-lived signed credential in environment so tool calls hit Next.js read-only endpoints.
 */
import http from 'node:http';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCodoGraphAgent } from './agent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const PORT = parseInt(process.env.AGENT_PORT || process.env.PORT || '4000', 10);

let agentInstance = null;

async function getAgent() {
  if (!agentInstance) {
    agentInstance = await createCodoGraphAgent();
  }
  return agentInstance;
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Agent-Credential');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // Health check endpoint
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'codograph-agent', port: PORT }));
    return;
  }

  // Streaming ask endpoint
  if (req.method === 'POST' && (url.pathname === '/stream' || url.pathname === '/ask')) {
    let bodyText = '';
    req.on('data', (chunk) => {
      bodyText += chunk;
    });

    req.on('end', async () => {
      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const body = JSON.parse(bodyText || '{}');
        const rawMessages = body.messages || [];
        const credential = body.credential || req.headers['x-agent-credential'] || '';
        const selectedFile = body.selectedFile;

        if (credential) {
          process.env.CODOGRAPH_AGENT_CREDENTIAL = credential;
        }

        if (rawMessages.length === 0) {
          sendEvent('error', { error: 'No messages provided.' });
          res.end();
          return;
        }

        const agent = await getAgent();

        // Format messages for LangChain
        const messages = rawMessages.map((m, idx) => {
          let content = m.content;
          // If this is the latest user prompt and a file is selected, append the selected context subtly
          if (idx === rawMessages.length - 1 && m.role === 'user' && selectedFile) {
            content = `${content}\n\n[Context: User currently has file \`${selectedFile}\` selected on canvas]`;
          }
          return { role: m.role || 'user', content };
        });

        // Stream updates from LangGraph
        const stream = await agent.stream({ messages }, { streamMode: 'updates' });

        let accumulatedContent = '';

        for await (const chunk of stream) {
          for (const [, update] of Object.entries(chunk)) {
            const nodeMsgs = update?.messages || [];
            for (const msg of nodeMsgs) {
              // 1. Tool call started
              if (msg.tool_calls && msg.tool_calls.length > 0) {
                for (const tc of msg.tool_calls) {
                  sendEvent('tool_start', {
                    tool: tc.name,
                    args: tc.args,
                    id: tc.id || tc.name,
                  });
                }
              }
              // 2. Tool completed
              else if (msg._getType && msg._getType() === 'tool') {
                let parsedResult = null;
                try {
                  parsedResult = JSON.parse(msg.content);
                } catch {
                  parsedResult = msg.content?.slice(0, 100);
                }
                sendEvent('tool_end', {
                  tool: msg.name,
                  id: msg.tool_call_id || msg.name,
                  summary: typeof parsedResult === 'object' ? Object.keys(parsedResult).join(', ') : 'Done',
                });
              }
              // 3. Final AI answer chunk
              else if (msg.content) {
                accumulatedContent = msg.content;
                sendEvent('token', { text: msg.content });
              }
            }
          }
        }

        sendEvent('done', { content: accumulatedContent });
        res.end();
      } catch (err) {
        console.error('[CodoGraph Agent Stream Error]:', err);
        sendEvent('error', { error: err instanceof Error ? err.message : 'Agent stream error' });
        res.end();
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🤖 CodoGraph Deep Agent Service running on http://127.0.0.1:${PORT}`);
});
