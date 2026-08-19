-- Fix PL/pgSQL output-column ambiguity from migration 003.
-- The frontend does not depend on a tabular result, so return JSON instead.

drop function if exists public.migrate_legacy_account(text,text,text);

create function public.migrate_legacy_account(
  legacy_email text,
  legacy_pin text,
  requested_role text default 'master'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_auth_email text;
  v_team text;
  v_name text;
  v_role text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select lower(u.email) into v_auth_email from auth.users u where u.id = v_uid;
  if v_auth_email is null or v_auth_email <> lower(trim(legacy_email)) then
    raise exception 'Authenticated email does not match legacy account';
  end if;

  v_role := case when lower(requested_role) = 'agent' then 'agent' else 'master' end;
  if v_role = 'agent' then
    select a.team_id::text, coalesce(nullif(a.name,''), a.email)
      into v_team, v_name
      from public.agent_accounts a
     where lower(a.email) = v_auth_email and a.pin::text = legacy_pin
     limit 1;
  else
    select m.team_id::text, coalesce(nullif(m.name,''), m.email)
      into v_team, v_name
      from public.master_accounts m
     where lower(m.email) = v_auth_email and m.pin::text = legacy_pin
     limit 1;
  end if;

  if v_team is null then raise exception 'Legacy email or PIN did not match'; end if;

  insert into public.crm_teams(id, name, created_by)
  values (v_team, coalesce(v_name,'M2 Team'), v_uid)
  on conflict on constraint crm_teams_pkey do nothing;

  insert into public.crm_team_members(user_id, team_id, role, display_name)
  values (v_uid, v_team, v_role, coalesce(v_name,''))
  on conflict on constraint crm_team_members_pkey do update
    set role = excluded.role, display_name = excluded.display_name;

  return jsonb_build_object('team_id',v_team,'role',v_role,'display_name',coalesce(v_name,''));
end;
$$;

revoke all on function public.migrate_legacy_account(text,text,text) from public, anon;
grant execute on function public.migrate_legacy_account(text,text,text) to authenticated;
