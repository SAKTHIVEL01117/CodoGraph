# Deploying CodoGraph to Vercel

This guide walks you through deploying **CodoGraph** to [Vercel](https://vercel.com).

---

## Architecture on Vercel

- **Next.js Web Application**: Runs entirely as Server Components and Serverless Functions on Vercel's global edge network.
- **Analysis Pipeline (`/api/analyze`)**: Executes via Next.js `after()` lifecycle and is configured with `maxDuration = 60` (the maximum supported duration on Vercel Hobby accounts).
- **CodoGraph Deep Agent Service**: The streaming agent service (`codograph-agent`) can run externally (e.g., on Render, Railway, Fly.io, or your local machine) and connects to Vercel via `AGENT_SERVICE_URL`. If the agent service is offline or unconfigured, the application gracefully keeps functioning.

---

## 1. Quick Deploy via Vercel Dashboard

1. Push your repository to **GitHub**, **GitLab**, or **Bitbucket**.
2. Go to [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New...** → **Project**.
3. Import your `codograph` repository.
4. Vercel will automatically detect **Next.js** using [`vercel.json`](file:///vercel.json).
5. Leave the default settings:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `./`
   - **Build Command**: `pnpm build` (or default)
   - **Install Command**: `pnpm install` (or default)

---

## 2. Environment Variables

Under **Environment Variables**, add the following keys for **Production**, **Preview**, and **Development**:

| Variable | Description / Value |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Publishable Key (`pk_live_...` or `pk_test_...`) |
| `CLERK_SECRET_KEY` | Clerk Secret Key (`sk_live_...` or `sk_test_...`) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/workspace` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/workspace` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<your-project-id>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Anon / Publishable Key |
| `SUPABASE_SECRET_KEY` | Supabase Secret / Service Role Key |
| `AGENT_CREDENTIAL_SECRET` | 32+ character random string (or your Clerk secret) |
| `NVIDIA_API_KEY` | NVIDIA NIM API Key (`nvapi-...`) |
| `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` |
| `NVIDIA_MODEL` | `meta/llama-3.3-70b-instruct` |
| `AGENT_SERVICE_URL` | *(Optional)* URL of external agent service (e.g. `https://codograph-agent.onrender.com`) |
| `LANGSMITH_API_KEY` | *(Optional)* LangSmith API key for agent tracing |

---

## 3. Post-Deployment Checklist

### 1. Clerk Authentication Configuration
In your [Clerk Dashboard](https://dashboard.clerk.com/):
1. Navigate to **Configure** → **Paths**.
2. Add your Vercel deployment URL (e.g. `https://your-project.vercel.app`) to your allowed domains.
3. If using Preview Deployments, also allow `*.vercel.app`.

### 2. Supabase Redirect URL Configuration
In your [Supabase Dashboard](https://supabase.com/dashboard/):
1. Navigate to **Authentication** → **URL Configuration**.
2. Set **Site URL** to: `https://your-project.vercel.app`
3. Add `https://your-project.vercel.app/**` to **Redirect URLs**.

---

## 4. Verification

After Vercel completes the build:
1. **Health Check**: Open `https://your-project.vercel.app/api/health` to confirm `{"status":"ok","service":"codograph"}`.
2. **Landing Page**: Visit `https://your-project.vercel.app/` and paste a GitHub repository URL.
3. **Workspace Canvas**: Log in via Clerk and explore the repository dependency graph.

