# CodoGraph

> Interactive Codebase Architecture Exploration & Autonomous Deep Agent Assistant.

CodoGraph parses repositories into high-fidelity dependency graphs, identifies architectural roles, calculates blast radius, tracks HTTP route tables, and provides an autonomous Deep Agent that answers architectural queries backed by real-time graph lookup tools.

---

## Features

- **Interactive Architecture Map**: Force-directed dependency graph canvas showing file connections, clusters, and entry points.
- **Deep Agent Streaming Assistant**: Autonomous agent built on Deep Agents and NVIDIA NIM (`meta/llama-3.3-70b-instruct`) with zero inference guesswork — every answer is grounded in graph lookup tools.
- **Blast Radius Analysis**: Transitive impact analysis showing what breaks when a file changes.
- **Route Manifests**: Automatic extraction of Next.js, Express, Fastify, and NestJS endpoints.
- **Multi-Tenant Workspaces**: Organization-scoped isolation powered by Clerk and Supabase Row Level Security (RLS).
- **Short-Lived HMAC Credentials**: Tamper-proof, signed credentials protecting read-only API surfaces from prompt injection.

---

## Quick Start (Local Development)

### 1. Prerequisites
- Node.js 22+
- pnpm 12+

### 2. Install Dependencies
```bash
# Install root dependencies
pnpm install

# Install agent service dependencies
cd codograph-agent && npm install && cd ..
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env.local` and add your keys:
```bash
cp .env.example .env.local
```

### 4. Start Development Servers
```bash
# Terminal 1: Run Next.js Web App
pnpm dev

# Terminal 2: Run CodoGraph Agent Service
pnpm agent
```

---

## Deployment

### Deploy to Vercel (Recommended for Web Application)
CodoGraph is optimized for zero-config deployment on [Vercel](https://vercel.com):
1. Import your repository into the Vercel Dashboard.
2. Add your environment variables (Clerk, Supabase, NVIDIA NIM).
3. Click **Deploy**.

For complete instructions, see the [Vercel Deployment Guide](DEPLOYMENT_VERCEL.md).

### Deploy to Render
For all-in-one or multi-service deployment with Docker or native Node:
1. Connect your repository to Render.
2. Select **Blueprint** using [`render.yaml`](render.yaml) or create a Web Service.

For complete instructions, see the [Render Deployment Guide](DEPLOYMENT_RENDER.md).

---

## Scripts & Verification

- `pnpm build`: Optimizes Next.js application for production.
- `pnpm start:render`: Production launcher that spins up both Next.js and the Agent service.
- `pnpm agent-check`: Runs the full 19-point HTTP and Deep Agent behavioral test suite.
- `pnpm lint`: Runs ESLint code quality checks.
