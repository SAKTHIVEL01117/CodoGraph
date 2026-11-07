-- ==============================================================================
-- CodoGraph — Row Level Security (RLS) Architecture for Clerk + Supabase
--
-- Connects Supabase Postgres to Clerk via Native Third-Party Authentication.
-- Supabase extracts user identity (sub) and active organization claims (org_id, org_role)
-- directly from the verified Clerk session JWT.
-- ==============================================================================

-- 1. Helper function: Authenticated Clerk User ID
create or replace function requesting_user_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::text;
$$;

-- 2. Helper function: Active Clerk Organization ID
create or replace function requesting_org_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'org_id', '')::text;
$$;

-- 3. Helper function: Active Clerk Organization Role (e.g. 'org:admin', 'org:member')
create or replace function requesting_org_role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'org_role', '')::text;
$$;

-- 4. Example: Multi-Tenant Organization Table Policy Template (for future application tables)
/*
-- Enable RLS on repository analyses
alter table public.repositories enable row level security;

-- SELECT policy: Users can only view repositories belonging to their active organization
create policy "Allow org members to view repositories"
on public.repositories
for select
using (
  org_id = requesting_org_id()
);

-- INSERT policy: Organization members can create repositories in their active organization
create policy "Allow org members to insert repositories"
on public.repositories
for insert
with check (
  org_id = requesting_org_id()
  and requesting_user_id() is not null
);

-- UPDATE/DELETE policy: Only organization admins can modify or delete repositories
create policy "Allow org admins to manage repositories"
on public.repositories
for all
using (
  org_id = requesting_org_id()
  and requesting_org_role() = 'org:admin'
);
*/
