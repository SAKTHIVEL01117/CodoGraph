-- ==============================================================================
-- CodoGraph — Phase 2: Seeded Rows for Multi-Organization Testing
--
-- Seeds organizations with projects and analyses matching the reference workspace.
-- Includes:
-- 1. Automated test orgs (org_seed_alpha, org_seed_beta, org_seed_gamma_empty)
-- 2. Real user Clerk orgs (org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot, org_3Lmw76eq1UOXrjIxXVQCz2u4tQN, org_3Lmw8FmXBEWmfYn2jEGFko161Oa)
-- ==============================================================================

-- 1. Organizations
insert into public.organizations (id, name, slug)
values
  ('org_seed_alpha', 'Acme Frontend Platform', 'acme-frontend'),
  ('org_seed_beta', 'Starlight Autonomous Systems', 'starlight-core'),
  ('org_seed_gamma_empty', 'Zero Analyses Team', 'zero-team'),
  ('org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot', 'SAKTHIVEL''s Organization', 'sakthivel-s-organization-1794047968560798834'),
  ('org_3Lmw76eq1UOXrjIxXVQCz2u4tQN', 'Starlight Autonomous Core', 'starlight-autonomous-core'),
  ('org_3Lmw8FmXBEWmfYn2jEGFko161Oa', 'Zero Analyses Sandbox', 'zero-analyses-sandbox')
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug;

-- 2. Projects for Org Alpha & User Org 1
insert into public.projects (id, org_id, name, repository_url, default_branch)
values
  ('a0000000-0000-0000-0000-000000000001', 'org_seed_alpha', 'tailwindlabs/tailwindcss', 'https://github.com/tailwindlabs/tailwindcss', 'main'),
  ('a0000000-0000-0000-0000-000000000002', 'org_seed_alpha', 'vercel/next.js', 'https://github.com/vercel/next.js', 'canary'),
  ('a0000000-0000-0000-0000-000000000003', 'org_seed_alpha', 'shadcn-ui/ui', 'https://github.com/shadcn-ui/ui', 'main'),
  ('a0000000-0000-0000-0000-000000000004', 'org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot', 'tailwindlabs/tailwindcss', 'https://github.com/tailwindlabs/tailwindcss', 'main'),
  ('a0000000-0000-0000-0000-000000000005', 'org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot', 'vercel/next.js', 'https://github.com/vercel/next.js', 'canary'),
  ('a0000000-0000-0000-0000-000000000006', 'org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot', 'shadcn-ui/ui', 'https://github.com/shadcn-ui/ui', 'main')
on conflict (id) do update set
  name = excluded.name,
  repository_url = excluded.repository_url;

-- 3. Projects for Org Beta & User Org 2
insert into public.projects (id, org_id, name, repository_url, default_branch)
values
  ('b0000000-0000-0000-0000-000000000001', 'org_seed_beta', 'starlight/engine', 'https://github.com/starlight/engine', 'release-2.4'),
  ('b0000000-0000-0000-0000-000000000002', 'org_seed_beta', 'starlight/neural-planner', 'https://github.com/starlight/neural-planner', 'dev'),
  ('b0000000-0000-0000-0000-000000000003', 'org_3Lmw76eq1UOXrjIxXVQCz2u4tQN', 'starlight/engine', 'https://github.com/starlight/engine', 'release-2.4'),
  ('b0000000-0000-0000-0000-000000000004', 'org_3Lmw76eq1UOXrjIxXVQCz2u4tQN', 'starlight/neural-planner', 'https://github.com/starlight/neural-planner', 'dev')
on conflict (id) do update set
  name = excluded.name,
  repository_url = excluded.repository_url;

-- 4. Clean up only automated test orgs so re-running migrations never deletes real user analyses
delete from public.analyses where org_id in ('org_seed_alpha', 'org_seed_beta');

-- 5. Analyses for SAKTHIVEL's Organization & Org Alpha (5 analyses matching reference image)
insert into public.analyses (id, org_id, project_id, repository_url, branch, commit_hash, status, stage, error_message, created_at, updated_at)
values
  -- Row 1: tailwindlabs/tailwindcss | queued | - | 2m ago | -
  (
    'a1111111-0000-0000-0000-000000000001',
    'org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot',
    'a0000000-0000-0000-0000-000000000004',
    'https://github.com/tailwindlabs/tailwindcss',
    'main',
    null,
    'pending',
    'queued',
    null,
    now() - interval '2 minutes',
    now() - interval '2 minutes'
  ),
  -- Row 2: vercel/next.js | parsing | a93be01 | 3m ago | -
  (
    'a1111111-0000-0000-0000-000000000002',
    'org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot',
    'a0000000-0000-0000-0000-000000000005',
    'https://github.com/vercel/next.js',
    'canary',
    'a93be01',
    'parsing',
    'parsing',
    null,
    now() - interval '3 minutes',
    now() - interval '3 minutes'
  ),
  -- Row 3: shadcn-ui/ui | failed (Repository archive download timed out) | - | 5h ago | 5h ago
  (
    'a1111111-0000-0000-0000-000000000003',
    'org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot',
    'a0000000-0000-0000-0000-000000000006',
    'https://github.com/shadcn-ui/ui',
    'main',
    null,
    'failed',
    'fetch',
    'Repository archive download timed out',
    now() - interval '5 hours',
    now() - interval '5 hours'
  ),
  -- Row 4: shadcn-ui/ui | complete | 0c7d9e2 | 24h ago | 24h ago
  (
    'a1111111-0000-0000-0000-000000000004',
    'org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot',
    'a0000000-0000-0000-0000-000000000006',
    'https://github.com/shadcn-ui/ui',
    'main',
    '0c7d9e2',
    'completed',
    'complete',
    null,
    now() - interval '24 hours',
    now() - interval '24 hours'
  ),
  -- Row 5: vercel/next.js | complete | 4f1c2a9 | 3d ago | 3d ago
  (
    'a1111111-0000-0000-0000-000000000005',
    'org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot',
    'a0000000-0000-0000-0000-000000000005',
    'https://github.com/vercel/next.js',
    'canary',
    '4f1c2a9',
    'completed',
    'complete',
    null,
    now() - interval '3 days',
    now() - interval '3 days'
  ),

  -- Replicate for automated test org org_seed_alpha
  (
    'a1111111-0000-0000-0000-000000000011',
    'org_seed_alpha',
    'a0000000-0000-0000-0000-000000000001',
    'https://github.com/tailwindlabs/tailwindcss',
    'main',
    null,
    'pending',
    'queued',
    null,
    now() - interval '2 minutes',
    now() - interval '2 minutes'
  ),
  (
    'a1111111-0000-0000-0000-000000000012',
    'org_seed_alpha',
    'a0000000-0000-0000-0000-000000000002',
    'https://github.com/vercel/next.js',
    'canary',
    'a93be01',
    'parsing',
    'parsing',
    null,
    now() - interval '3 minutes',
    now() - interval '3 minutes'
  ),
  (
    'a1111111-0000-0000-0000-000000000013',
    'org_seed_alpha',
    'a0000000-0000-0000-0000-000000000003',
    'https://github.com/shadcn-ui/ui',
    'main',
    null,
    'failed',
    'fetch',
    'Repository archive download timed out',
    now() - interval '5 hours',
    now() - interval '5 hours'
  ),
  (
    'a1111111-0000-0000-0000-000000000014',
    'org_seed_alpha',
    'a0000000-0000-0000-0000-000000000003',
    'https://github.com/shadcn-ui/ui',
    'main',
    '0c7d9e2',
    'completed',
    'complete',
    null,
    now() - interval '24 hours',
    now() - interval '24 hours'
  ),
  (
    'a1111111-0000-0000-0000-000000000015',
    'org_seed_alpha',
    'a0000000-0000-0000-0000-000000000002',
    'https://github.com/vercel/next.js',
    'canary',
    '4f1c2a9',
    'completed',
    'complete',
    null,
    now() - interval '3 days',
    now() - interval '3 days'
  )
on conflict (id) do nothing;

-- 6. Analyses for Starlight Autonomous Core & Org Beta (2 analyses)
insert into public.analyses (id, org_id, project_id, repository_url, branch, commit_hash, status, stage, summary, created_at, updated_at)
values
  (
    'b1111111-0000-0000-0000-000000000001',
    'org_seed_beta',
    'b0000000-0000-0000-0000-000000000001',
    'https://github.com/starlight/engine',
    'release-2.4',
    '4c5d6e7f8a9b',
    'completed',
    'complete',
    '{"files_count": 312, "edges_count": 890, "routes_count": 28, "framework": "NestJS"}'::jsonb,
    now() - interval '1 day',
    now() - interval '1 day'
  ),
  (
    'b1111111-0000-0000-0000-000000000002',
    'org_seed_beta',
    'b0000000-0000-0000-0000-000000000002',
    'https://github.com/starlight/neural-planner',
    'dev',
    '1a2b3c4d5e6f',
    'pending',
    'queued',
    '{"files_count": 0, "edges_count": 0, "routes_count": 0}'::jsonb,
    now() - interval '2 hours',
    now() - interval '2 hours'
  ),
  (
    'b1111111-0000-0000-0000-000000000003',
    'org_3Lmw76eq1UOXrjIxXVQCz2u4tQN',
    'b0000000-0000-0000-0000-000000000003',
    'https://github.com/starlight/engine',
    'release-2.4',
    '4c5d6e7f8a9b',
    'completed',
    'complete',
    '{"files_count": 312, "edges_count": 890, "routes_count": 28, "framework": "NestJS"}'::jsonb,
    now() - interval '1 day',
    now() - interval '1 day'
  ),
  (
    'b1111111-0000-0000-0000-000000000004',
    'org_3Lmw76eq1UOXrjIxXVQCz2u4tQN',
    'b0000000-0000-0000-0000-000000000004',
    'https://github.com/starlight/neural-planner',
    'dev',
    '1a2b3c4d5e6f',
    'pending',
    'queued',
    '{"files_count": 0, "edges_count": 0, "routes_count": 0}'::jsonb,
    now() - interval '2 hours',
    now() - interval '2 hours'
  )
on conflict (id) do nothing;
