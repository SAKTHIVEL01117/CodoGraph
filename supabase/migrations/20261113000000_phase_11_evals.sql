-- ==============================================================================
-- CodoGraph — Phase 11: Evals Schema Migration
--
-- Implements persistence for:
-- 1. eval_experiments: Side-by-side prompt version experiments, role accuracy
--    runs, and aggregate evaluation benchmarks with strict RLS.
-- 2. explanations table enhancements: Tracking invented_paths, eval_score, and is_clean
--    for live evaluation over real traffic.
-- ==============================================================================

-- 1. Create eval_experiments table
create table if not exists public.eval_experiments (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id) on delete cascade,
  experiment_name text not null,
  dataset_name text not null default 'default',
  score_a numeric(5, 2),
  score_b numeric(5, 2),
  delta numeric(5, 2),
  winner text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 2. Indexes for eval_experiments
create index if not exists idx_eval_experiments_org_id on public.eval_experiments(org_id);
create index if not exists idx_eval_experiments_name on public.eval_experiments(experiment_name);
create index if not exists idx_eval_experiments_created_at on public.eval_experiments(created_at desc);

-- 3. Enhance explanations table for live evaluation against real traffic
alter table public.explanations add column if not exists invented_paths text[] default '{}'::text[];
alter table public.explanations add column if not exists eval_score numeric(5, 2);
alter table public.explanations add column if not exists is_clean boolean default true;

create index if not exists idx_explanations_is_clean on public.explanations(is_clean);

-- 4. Enable and enforce RLS on eval_experiments
alter table public.eval_experiments enable row level security;
alter table public.eval_experiments force row level security;

-- 5. RLS Policies on eval_experiments (Scoped to Clerk requesting_org_id())
drop policy if exists "Allow org members to select eval_experiments" on public.eval_experiments;
create policy "Allow org members to select eval_experiments"
on public.eval_experiments for select to authenticated
using (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to insert eval_experiments" on public.eval_experiments;
create policy "Allow org members to insert eval_experiments"
on public.eval_experiments for insert to authenticated
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to update eval_experiments" on public.eval_experiments;
create policy "Allow org members to update eval_experiments"
on public.eval_experiments for update to authenticated
using (org_id = (select public.requesting_org_id()))
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to delete eval_experiments" on public.eval_experiments;
create policy "Allow org members to delete eval_experiments"
on public.eval_experiments for delete to authenticated
using (org_id = (select public.requesting_org_id()));

-- 6. Permissions for anon and authenticated
grant select, insert, update, delete on public.eval_experiments to authenticated;
grant select on public.eval_experiments to anon;

