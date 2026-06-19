-- APPLY ONLY AFTER every master/agent has a Supabase Auth user and a
-- crm_team_members row. This intentionally replaces permissive legacy policies.

begin;

-- Leads
alter table public.leads enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='leads'
  loop execute format('drop policy if exists %I on public.leads', p.policyname); end loop;
end $$;
create policy "team members read leads" on public.leads for select to authenticated
using (public.is_crm_team_member(team_id::text));
create policy "team members insert leads" on public.leads for insert to authenticated
with check (public.is_crm_team_member(team_id::text));
create policy "team members update leads" on public.leads for update to authenticated
using (public.is_crm_team_member(team_id::text))
with check (public.is_crm_team_member(team_id::text));
create policy "team members delete leads" on public.leads for delete to authenticated
using (public.is_crm_team_member(team_id::text));

-- Agent locations
alter table public.agent_locations enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='agent_locations'
  loop execute format('drop policy if exists %I on public.agent_locations', p.policyname); end loop;
end $$;
create policy "team members read locations" on public.agent_locations for select to authenticated
using (public.is_crm_team_member(team_id::text));
create policy "members write own location" on public.agent_locations for insert to authenticated
with check (public.is_crm_team_member(team_id::text));
create policy "members update own location" on public.agent_locations for update to authenticated
using (public.is_crm_team_member(team_id::text))
with check (public.is_crm_team_member(team_id::text));

-- Legacy credential tables should no longer be browser-readable after cutover.
alter table if exists public.master_accounts enable row level security;
alter table if exists public.agent_accounts enable row level security;
revoke all on table public.master_accounts from anon, authenticated;
revoke all on table public.agent_accounts from anon, authenticated;

-- Realtime tables; ignore if already present.
do $$ begin
  alter publication supabase_realtime add table public.leads;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.agent_locations;
exception when duplicate_object then null; end $$;

commit;
