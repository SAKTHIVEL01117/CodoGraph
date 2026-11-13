# Deploying CodoGraph to Netlify

This guide walks you through deploying **CodoGraph** to [Netlify](https://netlify.com).

---

## 1. Quick Deploy via Netlify Dashboard

1. Push your repository to **GitHub** or **GitLab**.
2. Go to the [Netlify Dashboard](https://app.netlify.com/) and click **Add new site** → **Import an existing project**.
3. Select your `CodoGraph` repository.
4. Netlify will automatically detect Next.js and read [`netlify.toml`](file:///netlify.toml).
5. Build settings (pre-configured):
   - **Base directory**: (leave blank / root)
   - **Build command**: `pnpm build`
   - **Publish directory**: `.next`

---

## 2. Environment Variables

In the Netlify setup screen (or under **Site configuration** → **Environment variables**), add the following:

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
2. Add your Netlify deployment URL (e.g. `https://your-site-name.netlify.app`) to your allowed domains.
3. If using branch/PR deploy previews, also allow `*.netlify.app`.

### 2. Supabase Redirect URL Configuration
In your [Supabase Dashboard](https://supabase.com/dashboard/):
1. Navigate to **Authentication** → **URL Configuration**.
2. Set **Site URL** to: `https://your-site-name.netlify.app`
3. Add `https://your-site-name.netlify.app/**` to **Redirect URLs**.

---

## 4. Verification

After Netlify deploys:
1. **Health Check**: Open `https://your-site-name.netlify.app/api/health` to confirm `{"status":"ok","service":"codograph"}`.
2. **Landing Page**: Visit `https://your-site-name.netlify.app/` and paste a GitHub repository URL.
3. **Workspace Canvas**: Log in via Clerk and explore the repository dependency graph.

