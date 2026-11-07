-- ==============================================================================
-- CodoGraph — User Synchronization Table in Supabase (Public Schema)
--
-- Stores application user profiles synced from verified Clerk sessions.
-- This allows user details to be queried and viewed directly in Supabase.
-- ==============================================================================

create table if not exists public.users (
  id text primary key, -- Clerk User ID (e.g. 'user_...')
  email text not null,
  full_name text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security (RLS)
alter table public.users enable row level security;

-- Policy: Users can read their own profile
create policy "Allow users to read own profile"
on public.users
for select
using (
  id = nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::text
);

-- Policy: Users can insert/upsert their own profile
create policy "Allow users to insert/upsert own profile"
on public.users
for insert
with check (
  id = nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::text
);

-- Policy: Users can update their own profile
create policy "Allow users to update own profile"
on public.users
for update
using (
  id = nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::text
);

