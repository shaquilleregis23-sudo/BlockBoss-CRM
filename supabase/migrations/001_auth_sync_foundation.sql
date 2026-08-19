-- M2 Hybrid: additive foundation. Safe to review before applying.
-- Does not remove existing policies or disable legacy PIN login.

create table if not exists public.crm_teams (
  id text primary key,
  name text not null default 'M2 Team',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.crm_teams enable row level security;

create table if not exists public.crm_team_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id text not null,
  role text not null default 'agent' check (role in ('master','manager','agent')),
  display_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

alter table public.crm_team_members enable row level security;

drop policy if exists "members can read own memberships" on public.crm_team_members;
create policy "members can read own memberships"
on public.crm_team_members for select to authenticated
using (user_id = (select auth.uid()));

-- Add conflict metadata without breaking current columns or clients.
alter table if exists public.leads add column if not exists sync_version bigint not null default 1;
alter table if exists public.leads add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table if exists public.leads add column if not exists deleted_at timestamptz;
alter table if exists public.leads add column if not exists address_key text;

create index if not exists leads_team_updated_idx on public.leads (team_id, updated_at desc);
create index if not exists leads_team_bbl_idx on public.leads (team_id, bbl) where bbl is not null and bbl <> '';
create index if not exists leads_team_address_key_idx on public.leads (team_id, address_key) where address_key is not null;

create or replace function public.is_crm_team_member(target_team text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.crm_team_members m
    where m.user_id = (select auth.uid()) and m.team_id = target_team
  );
$$;

revoke all on function public.is_crm_team_member(text) from public;
grant execute on function public.is_crm_team_member(text) to authenticated;

drop policy if exists "members can read own team" on public.crm_teams;
create policy "members can read own team"
on public.crm_teams for select to authenticated
using (public.is_crm_team_member(id));

create or replace function public.bootstrap_crm_team(company_name text, member_name text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare existing_team text; new_team text;
begin
  select team_id into existing_team from public.crm_team_members
  where user_id = (select auth.uid()) order by created_at limit 1;
  if existing_team is not null then return existing_team; end if;
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  new_team := gen_random_uuid()::text;
  insert into public.crm_teams(id, name, created_by)
  values (new_team, coalesce(nullif(trim(company_name),''),'M2 Team'), (select auth.uid()));
  insert into public.crm_team_members(user_id, team_id, role, display_name)
  values ((select auth.uid()), new_team, 'master', coalesce(member_name,''));
  return new_team;
end;
$$;
revoke all on function public.bootstrap_crm_team(text,text) from public;
grant execute on function public.bootstrap_crm_team(text,text) to authenticated;
