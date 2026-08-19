alter table public.crm_team_members add column if not exists email text;
alter table public.crm_team_members add column if not exists territory text not null default '';
alter table public.crm_team_members add column if not exists status text not null default 'active';
alter table public.crm_team_members add column if not exists invited_by uuid references auth.users(id) on delete set null;
alter table public.crm_team_members add column if not exists invited_at timestamptz;
update public.crm_team_members m set email=u.email from auth.users u where u.id=m.user_id and m.email is null;

create or replace function public.is_crm_team_member(target_team text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.crm_team_members m where m.user_id=(select auth.uid()) and m.team_id=target_team and m.status='active');
$$;
revoke all on function public.is_crm_team_member(text) from public,anon;
grant execute on function public.is_crm_team_member(text) to authenticated;

create or replace function public.is_crm_team_manager(target_team text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.crm_team_members m where m.user_id=(select auth.uid()) and m.team_id=target_team and m.role in ('master','manager') and m.status='active');
$$;
revoke all on function public.is_crm_team_manager(text) from public,anon;
grant execute on function public.is_crm_team_manager(text) to authenticated;

drop policy if exists "members can read own memberships" on public.crm_team_members;
drop policy if exists "members read team memberships" on public.crm_team_members;
create policy "members read team memberships" on public.crm_team_members for select to authenticated
using(user_id=(select auth.uid()) or public.is_crm_team_manager(team_id));

do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='leads'
  loop execute format('drop policy if exists %I on public.leads',p.policyname);end loop;
end $$;
create policy "managers read team leads" on public.leads for select to authenticated using(public.is_crm_team_manager(team_id::text));
create policy "agents read assigned leads" on public.leads for select to authenticated using(
  public.is_crm_team_member(team_id::text) and not public.is_crm_team_manager(team_id::text) and
  (assigned_user_id::text=(select auth.uid())::text or lower(assigned_user_email)=lower((select auth.jwt()->>'email')))
);
create policy "managers insert team leads" on public.leads for insert to authenticated with check(public.is_crm_team_manager(team_id::text));
create policy "agents insert self leads" on public.leads for insert to authenticated with check(public.is_crm_team_member(team_id::text) and assigned_user_id::text=(select auth.uid())::text);
create policy "managers update team leads" on public.leads for update to authenticated using(public.is_crm_team_manager(team_id::text)) with check(public.is_crm_team_manager(team_id::text));
create policy "agents update assigned leads" on public.leads for update to authenticated using(public.is_crm_team_member(team_id::text) and assigned_user_id::text=(select auth.uid())::text) with check(public.is_crm_team_member(team_id::text) and assigned_user_id::text=(select auth.uid())::text);
create policy "managers delete team leads" on public.leads for delete to authenticated using(public.is_crm_team_manager(team_id::text));

create or replace function public.activate_my_crm_membership()
returns boolean language plpgsql security definer set search_path=public as $$
begin update public.crm_team_members set status='active' where user_id=(select auth.uid());return found;end;$$;
revoke all on function public.activate_my_crm_membership() from public,anon;
grant execute on function public.activate_my_crm_membership() to authenticated;
