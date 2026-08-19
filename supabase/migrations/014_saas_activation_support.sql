create table if not exists public.crm_activation_events(
  id bigint generated always as identity primary key,
  team_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone text not null,
  completed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(team_id,user_id,milestone)
);
create index if not exists crm_activation_team_time_idx on public.crm_activation_events(team_id,completed_at desc);
alter table public.crm_activation_events enable row level security;
create policy "members record own activation" on public.crm_activation_events for insert to authenticated
with check(user_id=(select auth.uid()) and public.is_crm_team_member(team_id));
create policy "members update own activation" on public.crm_activation_events for update to authenticated
using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and public.is_crm_team_member(team_id));
create policy "members read activation" on public.crm_activation_events for select to authenticated
using(user_id=(select auth.uid()) or public.is_crm_team_manager(team_id));

create table if not exists public.crm_support_requests(
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  reporter_email text,
  category text not null default 'question',
  priority text not null default 'normal' check(priority in ('normal','urgent')),
  subject text not null,
  description text not null,
  status text not null default 'open' check(status in ('open','in_progress','resolved')),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_support_team_time_idx on public.crm_support_requests(team_id,created_at desc);
alter table public.crm_support_requests enable row level security;
create policy "members create support requests" on public.crm_support_requests for insert to authenticated
with check(user_id=(select auth.uid()) and public.is_crm_team_member(team_id));
create policy "members read team support" on public.crm_support_requests for select to authenticated
using(user_id=(select auth.uid()) or public.is_crm_team_manager(team_id));
create policy "managers update support requests" on public.crm_support_requests for update to authenticated
using(public.is_crm_team_manager(team_id)) with check(public.is_crm_team_manager(team_id));
