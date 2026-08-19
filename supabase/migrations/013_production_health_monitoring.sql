create table if not exists public.crm_health_events(
  id bigint generated always as identity primary key,
  team_id text not null,
  user_id uuid not null,
  level text not null check(level in ('info','warning','error')),
  category text not null,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists crm_health_team_time_idx on public.crm_health_events(team_id,created_at desc);
alter table public.crm_health_events enable row level security;
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname='public' and tablename='crm_health_events' loop execute format('drop policy if exists %I on public.crm_health_events',p.policyname);end loop;end $$;
create policy "members report own health" on public.crm_health_events for insert to authenticated with check(user_id=(select auth.uid()) and public.is_crm_team_member(team_id));
create policy "managers read team health" on public.crm_health_events for select to authenticated using(public.is_crm_team_manager(team_id));
revoke update,delete on public.crm_health_events from anon,authenticated;
