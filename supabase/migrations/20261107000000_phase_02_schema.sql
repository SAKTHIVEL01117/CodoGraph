-- ==============================================================================
-- CodoGraph — Phase 2: Core Database Schema and Row Level Security
--
-- Eight tables: projects, analyses, files, edges, routes, explanations, file_roles, insights.
-- Plus organizations table as the multitenant root.
-- Every table references organizations(id) with ON DELETE CASCADE.
-- Row Level Security (RLS) is enabled and enforced on ALL tables.
-- Predicates read the organization claim off the Clerk JWT via requesting_org_id().
-- ==============================================================================

-- 1. Helper function: requesting_org_id()
-- Reads active Clerk organization claim directly from the session JWT.
-- Supports standard Supabase auth.jwt() as well as request.jwt.claims.
create or replace function public.requesting_org_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'org_id', ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'org_id', '')
  )::text;
$$;

create or replace function public.requesting_user_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'sub', ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')
  )::text;
$$;

-- 2. Organizations Table (Root Multi-Tenant Entity)
create table if not exists public.organizations (
  id text primary key, -- Clerk Organization ID (e.g. 'org_...')
  name text not null,
  slug text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Projects Table
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id) on delete cascade,
  name text not null,
  repository_url text not null,
  default_branch text not null default 'main',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Analyses Table
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  repository_url text not null,
  branch text not null default 'main',
  commit_hash text,
  status text not null default 'pending' check (status in ('pending', 'fetching', 'parsing', 'completed', 'failed')),
  stage text,
  error_message text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Files Table
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  path text not null,
  folder text not null,
  extension text,
  lines integer not null default 0,
  size_bytes integer not null default 0,
  content_hash text,
  fan_in integer not null default 0,
  fan_out integer not null default 0,
  role text,
  created_at timestamptz not null default now()
);

-- 6. Edges Table
create table if not exists public.edges (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  source_file_id uuid references public.files(id) on delete cascade,
  target_file_id uuid references public.files(id) on delete cascade,
  source_path text not null,
  target_path text not null,
  kind text not null default 'import' check (kind in ('import', 're-export', 'dynamic_import', 'require')),
  created_at timestamptz not null default now()
);

-- 7. Routes Table
create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  file_id uuid references public.files(id) on delete cascade,
  method text not null,
  pattern text not null,
  framework text,
  created_at timestamptz not null default now()
);

-- 8. Explanations Table
create table if not exists public.explanations (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  file_path text not null,
  is_folder boolean not null default false,
  content text not null,
  content_hash text not null,
  model text not null,
  created_at timestamptz not null default now()
);

-- 9. File Roles Table
create table if not exists public.file_roles (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  file_id uuid references public.files(id) on delete cascade,
  file_path text not null,
  role text not null,
  source text not null default 'convention' check (source in ('convention', 'adapter', 'model')),
  confidence numeric(3, 2) not null default 1.0,
  created_at timestamptz not null default now()
);

-- 10. Insights Table
create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  kind text not null check (kind in ('cycle', 'unimported', 'popular', 'oversized')),
  severity text not null default 'info',
  title text not null,
  description text not null,
  target_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ==============================================================================
-- INDEXES (Foreign Keys & RLS Predicates for Performance)
-- ==============================================================================

create index if not exists idx_projects_org_id on public.projects(org_id);
create index if not exists idx_analyses_org_id on public.analyses(org_id);
create index if not exists idx_analyses_project_id on public.analyses(project_id);
create index if not exists idx_files_org_id on public.files(org_id);
create index if not exists idx_files_analysis_id on public.files(analysis_id);
create index if not exists idx_edges_org_id on public.edges(org_id);
create index if not exists idx_edges_analysis_id on public.edges(analysis_id);
create index if not exists idx_routes_org_id on public.routes(org_id);
create index if not exists idx_routes_analysis_id on public.routes(analysis_id);
create index if not exists idx_explanations_org_id on public.explanations(org_id);
create index if not exists idx_explanations_analysis_id on public.explanations(analysis_id);
create index if not exists idx_file_roles_org_id on public.file_roles(org_id);
create index if not exists idx_file_roles_analysis_id on public.file_roles(analysis_id);
create index if not exists idx_insights_org_id on public.insights(org_id);
create index if not exists idx_insights_analysis_id on public.insights(analysis_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) ENABLEMENT ON ALL EIGHT TABLES + ORGANIZATIONS
-- ==============================================================================

alter table public.organizations enable row level security;
alter table public.projects enable row level security;
alter table public.analyses enable row level security;
alter table public.files enable row level security;
alter table public.edges enable row level security;
alter table public.routes enable row level security;
alter table public.explanations enable row level security;
alter table public.file_roles enable row level security;
alter table public.insights enable row level security;

-- Force RLS so table owners/creators are also subject to policies when querying through the API
alter table public.organizations force row level security;
alter table public.projects force row level security;
alter table public.analyses force row level security;
alter table public.files force row level security;
alter table public.edges force row level security;
alter table public.routes force row level security;
alter table public.explanations force row level security;
alter table public.file_roles force row level security;
alter table public.insights force row level security;

-- ==============================================================================
-- RLS POLICIES — Predicate reads organization claim via (select public.requesting_org_id())
-- ==============================================================================

-- Organizations
drop policy if exists "Allow org members to view own organization" on public.organizations;
create policy "Allow org members to view own organization"
on public.organizations for select to authenticated
using (id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to insert/upsert own organization" on public.organizations;
create policy "Allow org members to insert/upsert own organization"
on public.organizations for insert to authenticated
with check (id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to update own organization" on public.organizations;
create policy "Allow org members to update own organization"
on public.organizations for update to authenticated
using (id = (select public.requesting_org_id()))
with check (id = (select public.requesting_org_id()));

-- Projects
drop policy if exists "Allow org members to select projects" on public.projects;
create policy "Allow org members to select projects"
on public.projects for select to authenticated
using (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to insert projects" on public.projects;
create policy "Allow org members to insert projects"
on public.projects for insert to authenticated
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to update projects" on public.projects;
create policy "Allow org members to update projects"
on public.projects for update to authenticated
using (org_id = (select public.requesting_org_id()))
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to delete projects" on public.projects;
create policy "Allow org members to delete projects"
on public.projects for delete to authenticated
using (org_id = (select public.requesting_org_id()));

-- Analyses
drop policy if exists "Allow org members to select analyses" on public.analyses;
create policy "Allow org members to select analyses"
on public.analyses for select to authenticated
using (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to insert analyses" on public.analyses;
create policy "Allow org members to insert analyses"
on public.analyses for insert to authenticated
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to update analyses" on public.analyses;
create policy "Allow org members to update analyses"
on public.analyses for update to authenticated
using (org_id = (select public.requesting_org_id()))
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to delete analyses" on public.analyses;
create policy "Allow org members to delete analyses"
on public.analyses for delete to authenticated
using (org_id = (select public.requesting_org_id()));

-- Files
drop policy if exists "Allow org members to select files" on public.files;
create policy "Allow org members to select files"
on public.files for select to authenticated
using (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to insert files" on public.files;
create policy "Allow org members to insert files"
on public.files for insert to authenticated
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to update files" on public.files;
create policy "Allow org members to update files"
on public.files for update to authenticated
using (org_id = (select public.requesting_org_id()))
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to delete files" on public.files;
create policy "Allow org members to delete files"
on public.files for delete to authenticated
using (org_id = (select public.requesting_org_id()));

-- Edges
drop policy if exists "Allow org members to select edges" on public.edges;
create policy "Allow org members to select edges"
on public.edges for select to authenticated
using (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to insert edges" on public.edges;
create policy "Allow org members to insert edges"
on public.edges for insert to authenticated
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to update edges" on public.edges;
create policy "Allow org members to update edges"
on public.edges for update to authenticated
using (org_id = (select public.requesting_org_id()))
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to delete edges" on public.edges;
create policy "Allow org members to delete edges"
on public.edges for delete to authenticated
using (org_id = (select public.requesting_org_id()));

-- Routes
drop policy if exists "Allow org members to select routes" on public.routes;
create policy "Allow org members to select routes"
on public.routes for select to authenticated
using (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to insert routes" on public.routes;
create policy "Allow org members to insert routes"
on public.routes for insert to authenticated
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to update routes" on public.routes;
create policy "Allow org members to update routes"
on public.routes for update to authenticated
using (org_id = (select public.requesting_org_id()))
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to delete routes" on public.routes;
create policy "Allow org members to delete routes"
on public.routes for delete to authenticated
using (org_id = (select public.requesting_org_id()));

-- Explanations
drop policy if exists "Allow org members to select explanations" on public.explanations;
create policy "Allow org members to select explanations"
on public.explanations for select to authenticated
using (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to insert explanations" on public.explanations;
create policy "Allow org members to insert explanations"
on public.explanations for insert to authenticated
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to update explanations" on public.explanations;
create policy "Allow org members to update explanations"
on public.explanations for update to authenticated
using (org_id = (select public.requesting_org_id()))
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to delete explanations" on public.explanations;
create policy "Allow org members to delete explanations"
on public.explanations for delete to authenticated
using (org_id = (select public.requesting_org_id()));

-- File Roles
drop policy if exists "Allow org members to select file_roles" on public.file_roles;
create policy "Allow org members to select file_roles"
on public.file_roles for select to authenticated
using (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to insert file_roles" on public.file_roles;
create policy "Allow org members to insert file_roles"
on public.file_roles for insert to authenticated
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to update file_roles" on public.file_roles;
create policy "Allow org members to update file_roles"
on public.file_roles for update to authenticated
using (org_id = (select public.requesting_org_id()))
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to delete file_roles" on public.file_roles;
create policy "Allow org members to delete file_roles"
on public.file_roles for delete to authenticated
using (org_id = (select public.requesting_org_id()));

-- Insights
drop policy if exists "Allow org members to select insights" on public.insights;
create policy "Allow org members to select insights"
on public.insights for select to authenticated
using (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to insert insights" on public.insights;
create policy "Allow org members to insert insights"
on public.insights for insert to authenticated
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to update insights" on public.insights;
create policy "Allow org members to update insights"
on public.insights for update to authenticated
using (org_id = (select public.requesting_org_id()))
with check (org_id = (select public.requesting_org_id()));

drop policy if exists "Allow org members to delete insights" on public.insights;
create policy "Allow org members to delete insights"
on public.insights for delete to authenticated
using (org_id = (select public.requesting_org_id()));

-- Permissions
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon; -- Read access gates on RLS policies; returns [] without matching policy
