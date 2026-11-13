#!/usr/bin/env node
/**
 * CodoGraph — Production Launcher for Render.
 *
 * Supports both:
 * 1. All-in-One Deployment (Default on Render single web service / free tier):
 *    Spawns both the CodoGraph Next.js Web App and the CodoGraph Deep Agent Service.
 * 2. Multi-Service Deployment:
 *    If AGENT_SERVICE_URL points to an external host, launches only Next.js.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PORT = process.env.PORT || '3000';
const AGENT_PORT = process.env.AGENT_PORT || '4000';
const externalAgentUrl = process.env.AGENT_SERVICE_URL;

// Determine if we should spawn the agent locally
const shouldSpawnAgent =
  !externalAgentUrl ||
  externalAgentUrl.includes('127.0.0.1') ||
  externalAgentUrl.includes('localhost');

console.log('====================================================');
console.log('🚀 CodoGraph Production Launcher Starting...');
console.log(`- Web App Port: ${PORT}`);
console.log(`- Mode: ${shouldSpawnAgent ? 'All-in-One (Next.js + Agent)' : 'Web Only (External Agent)'}`);
if (shouldSpawnAgent) {
  console.log(`- Local Agent Port: ${AGENT_PORT}`);
} else {
  console.log(`- Connected to Agent Service: ${externalAgentUrl}`);
}
console.log('====================================================');

const children = [];

function cleanup() {
  console.log('\n🛑 Shutting down CodoGraph production services...');
  for (const child of children) {
    try {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    } catch {
      // ignore
    }
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

// 1. Spawn Agent Service if running in all-in-one mode
if (shouldSpawnAgent) {
  const agentEnv = {
    ...process.env,
    PORT: AGENT_PORT,
    HOST: '127.0.0.1',
    CODOGRAPH_API_BASE_URL: process.env.CODOGRAPH_API_BASE_URL || `http://127.0.0.1:${PORT}`,
  };

  const agentChild = spawn(
    process.execPath,
    ['--experimental-strip-types', path.join(rootDir, 'codograph-agent', 'server.js')],
    {
      cwd: path.join(rootDir, 'codograph-agent'),
      env: agentEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  agentChild.stdout.on('data', (data) => {
    process.stdout.write(`[agent] ${data}`);
  });

  agentChild.stderr.on('data', (data) => {
    process.stderr.write(`[agent] ${data}`);
  });

  agentChild.on('exit', (code, signal) => {
    console.warn(`[agent] Agent process exited with code ${code} (${signal})`);
  });

  children.push(agentChild);
}

// 2. Spawn Next.js Web App
const nextBin = path.join(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next');
const nextEnv = {
  ...process.env,
  PORT,
  HOSTNAME: '0.0.0.0',
  AGENT_SERVICE_URL: shouldSpawnAgent ? `http://127.0.0.1:${AGENT_PORT}` : externalAgentUrl,
};

const nextArgs = ['start', '-p', PORT, '-H', '0.0.0.0'];

const nextChild = spawn(process.execPath, [nextBin, ...nextArgs], {
  cwd: rootDir,
  env: nextEnv,
  stdio: 'inherit',
});

nextChild.on('exit', (code, signal) => {
  console.log(`[web] Next.js process exited with code ${code} (${signal})`);
  cleanup();
  process.exit(code ?? 0);
});

children.push(nextChild);

