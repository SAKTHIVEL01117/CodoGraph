-- ==============================================================================
-- CodoGraph — Clerk Session Token v2 RLS & Realtime Support Migration
--
-- Fixes Row Level Security evaluation for Clerk Session Token v2 JWTs where
-- active organization claims live at `jwt.o.id` (with `jwt.o.rol` and `jwt.o.slg`),
-- while preserving backward compatibility with legacy top-level `org_id` claims.
-- ==============================================================================

-- 1. Update requesting_org_id() to read both legacy `org_id` and Clerk v2 `o.id`
create or replace function public.requesting_org_id()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'org_id', ''),
    nullif((auth.jwt() -> 'o') ->> 'id', ''),
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id', ''),
    nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'o') ->> 'id', '')
  )::text;
$$;

-- 2. Update requesting_user_id() safely handling empty jwt.claims
create or replace function public.requesting_user_id()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'sub', ''),
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')
  )::text;
$$;

-- 3. Add requesting_org_role() supporting legacy `org_role` and Clerk v2 `o.rol`
create or replace function public.requesting_org_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'org_role', ''),
    nullif((auth.jwt() -> 'o') ->> 'rol', ''),
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_role', ''),
    nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'o') ->> 'rol', '')
  )::text;
$$;

grant execute on function public.requesting_org_id() to anon, authenticated;
grant execute on function public.requesting_user_id() to anon, authenticated;
grant execute on function public.requesting_org_role() to anon, authenticated;

-- 4. Idempotently ensure Phase 7 columns, constraints, and indexes exist
alter table public.edges add column if not exists specifier text;

alter table public.analyses drop constraint if exists analyses_status_check;
alter table public.analyses add constraint analyses_status_check
  check (status in ('pending', 'fetching', 'selecting', 'parsing', 'storing', 'completed', 'failed'));

create index if not exists idx_analyses_org_repo
  on public.analyses(org_id, repository_url);

-- 5. Keep broadcast trigger emitting complete stage & commit metadata
create or replace function public.broadcast_analysis_stage_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Per-analysis private channel: 'analysis:<id>'
  begin
    perform realtime.send(
      jsonb_build_object(
        'analysis_id', NEW.id,
        'status', NEW.status,
        'stage', NEW.stage,
        'commit_hash', NEW.commit_hash,
        'error_message', NEW.error_message,
        'updated_at', NEW.updated_at
      ),
      'stage_change',
      'analysis:' || NEW.id::text,
      true
    );
  exception when others then
    null;
  end;

  -- Per-organization private channel: 'org:<org_id>'
  begin
    perform realtime.send(
      jsonb_build_object(
        'analysis_id', NEW.id,
        'org_id', NEW.org_id,
        'repository_url', NEW.repository_url,
        'branch', NEW.branch,
        'commit_hash', NEW.commit_hash,
        'status', NEW.status,
        'stage', NEW.stage,
        'error_message', NEW.error_message,
        'updated_at', NEW.updated_at
      ),
      'analysis_updated',
      'org:' || NEW.org_id,
      true
    );
  exception when others then
    null;
  end;

  return NEW;
end;
$$;

drop trigger if exists trigger_broadcast_analysis_stage on public.analyses;
create trigger trigger_broadcast_analysis_stage
after insert or update of status, stage, error_message, commit_hash on public.analyses
for each row
execute function public.broadcast_analysis_stage_change();

-- 6. Re-ensure Realtime authorization policies use requesting_org_id()
do $$
begin
  alter table if exists realtime.messages enable row level security;
exception when others then
  null;
end;
$$;

drop policy if exists "org_members_can_receive_analysis_broadcast" on realtime.messages;
create policy "org_members_can_receive_analysis_broadcast"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1 from public.analyses
    where ('analysis:' || analyses.id::text) = realtime.topic()
      and analyses.org_id = (select public.requesting_org_id())
  )
);

drop policy if exists "org_members_can_receive_org_broadcast" on realtime.messages;
create policy "org_members_can_receive_org_broadcast"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() = ('org:' || (select public.requesting_org_id()))
);

-- 7. Ensure PostgREST Data API permissions exist for authenticated users (gated by RLS)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

