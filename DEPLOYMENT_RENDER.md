# Hosting CodoGraph on Render

This guide walks you through deploying **CodoGraph** to [Render](https://render.com) online.

---

## Architecture Overview

CodoGraph consists of two interconnected components:
1. **Next.js Web Application** — Interactive canvas, Clerk authentication, Supabase graph storage, and read-only HMAC-authenticated tool endpoints.
2. **CodoGraph Deep Agent Service** — Managed Deep Agents streaming service with real-time graph lookup tools powered by NVIDIA NIM & LangSmith.

We provide two deployment modes:
- **Mode 1: Unified All-in-One Service (Recommended)** — Runs both Next.js and the Agent inside a single Render Web Service via `scripts/render-start.mjs`. Fits inside **Render's Free Tier** ($0/month), zero cross-service network latency, and zero configuration overhead.
- **Mode 2: Multi-Service Blueprint** — Deploys Next.js and the Agent as two independent services using `render.yaml`.

---

## Prerequisites

Before deploying, ensure you have credentials from:
1. **[Render Account](https://dashboard.render.com/)** (free or paid)
2. **[Clerk Account](https://dashboard.clerk.com/)** (for user auth & organization workspaces)
3. **[Supabase Project](https://supabase.com/dashboard/)** (for PostgreSQL graph persistence)
4. **[NVIDIA NIM API Key](https://build.nvidia.com/)** (for agent reasoning model `meta/llama-3.3-70b-instruct`)
5. *(Optional)* **[LangSmith](https://smith.langchain.com/)** (for agent traces & monitoring)

---

## Method 1: 1-Click / Blueprint Deployment (Recommended)

1. Push your repository to **GitHub** or **GitLab**.
2. Go to the [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** in the top navigation and select **Blueprint**.
4. Connect your CodoGraph repository.
5. Render will automatically detect [`render.yaml`](file:///render.yaml).
6. Fill in the prompted secret environment variables:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `NVIDIA_API_KEY`
   - `LANGSMITH_API_KEY` (optional)
7. Click **Apply**. Render will automatically build and deploy both Next.js and the agent!

---

## Method 2: Manual Web Service Setup (Render Dashboard)

If you prefer setting up via the Render Web UI manually:

1. Click **New +** → **Web Service**.
2. Connect your Git repository.
3. Configure the service settings:
   - **Name**: `codograph`
   - **Language / Runtime**: `Node`
   - **Region**: Choose closest to your database (e.g. `Oregon (US West)` or `Frankfurt (EU)`)
   - **Branch**: `main`
   - **Build Command**:
     ```bash
     npm install -g pnpm && pnpm install && cd codograph-agent && npm install && cd .. && pnpm build
     ```
   - **Start Command**:
     ```bash
     node scripts/render-start.mjs
     ```
   - **Plan**: `Free` or `Starter` ($7/mo)
4. Under **Advanced**:
   - **Health Check Path**: `/api/health`
5. Under **Environment Variables**, add:

| Key | Description / Value |
|---|---|
| `NODE_VERSION` | `22.14.0` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Publishable Key (`pk_live_...` or `pk_test_...`) |
| `CLERK_SECRET_KEY` | Clerk Secret Key (`sk_live_...` or `sk_test_...`) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/workspace` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/workspace` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<your-project>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Anon / Publishable Key |
| `SUPABASE_SECRET_KEY` | Supabase Secret / Service Role Key |
| `AGENT_CREDENTIAL_SECRET` | 32+ character random hex string (or your Clerk secret) |
| `NVIDIA_API_KEY` | NVIDIA NIM API Key (`nvapi-...`) |
| `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` |
| `NVIDIA_MODEL` | `meta/llama-3.3-70b-instruct` |
| `LANGSMITH_TRACING` | `true` |
| `LANGSMITH_ENDPOINT` | `https://api.smith.langchain.com` |
| `LANGSMITH_PROJECT` | `codograph-production` |
| `LANGSMITH_API_KEY` | *(Optional)* LangSmith API key |

6. Click **Create Web Service**.

---

## Method 3: Docker Deployment

Render also natively supports container deployment via the included multi-stage [`Dockerfile`](file:///Dockerfile).

1. Click **New +** → **Web Service**.
2. Connect your Git repository.
3. Select **Docker** as the environment.
4. Set **Health Check Path** to `/api/health`.
5. Enter the Environment Variables listed in the table above.
6. Click **Create Web Service**.

---

## Post-Deployment Configuration

### 1. Configure Clerk Allowed Origins & Redirects
In your [Clerk Dashboard](https://dashboard.clerk.com/):
1. Navigate to **Configure** → **Paths**.
2. Ensure your Render domain (e.g. `https://codograph.onrender.com` or custom domain) is registered under production domains.
3. If using a development Clerk key (`pk_test_...`), verify your local and Render domains are permitted.

### 2. Configure Supabase Authentication Redirects
In your [Supabase Dashboard](https://supabase.com/dashboard/):
1. Navigate to **Authentication** → **URL Configuration**.
2. Set **Site URL** to: `https://your-app-name.onrender.com`
3. Add `https://your-app-name.onrender.com/**` to **Redirect URLs**.

---

## Verification & Health Check

Once Render finishes deploying:
1. **Health Probes**:
   - Web application: `curl https://<your-app>.onrender.com/api/health`
   - Returns: `{"status":"ok","service":"codograph","timestamp":"...","uptime":...}`
2. **Landing Page**:
   - Visit `https://<your-app>.onrender.com/`
   - Enter a public GitHub repository (e.g. `https://github.com/facebook/lexical` or your own repo)
3. **Workspace Canvas**:
   - Sign in through Clerk, create or pick an organization workspace.
   - Inspect graph nodes, architecture roles, blast radius, and route endpoints.
4. **Live Streaming Agent**:
   - Open the right pane and click **Ask**.
   - Query: *"Where is authentication handled?"* or *"What does this repository do?"*
   - Observe live Server-Sent Events (SSE) streaming with visible tool lookups.

