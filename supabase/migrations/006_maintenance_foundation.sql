create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

alter table public.leads add column if not exists owner_refreshed_at timestamptz;
alter table public.leads add column if not exists owner_refresh_status text;
alter table public.leads add column if not exists pluto_owner_name text;
create index if not exists leads_owner_refresh_idx on public.leads(team_id,owner_refreshed_at) where bbl is not null and bbl<>'';

create table if not exists public.maintenance_runs(
  id bigint generated always as identity primary key,
  team_id text,
  job_type text not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  processed integer not null default 0,
  changed integer not null default 0,
  error text,
  details jsonb not null default '{}'::jsonb
);
alter table public.maintenance_runs enable row level security;
drop policy if exists "team members read maintenance" on public.maintenance_runs;
create policy "team members read maintenance" on public.maintenance_runs for select to authenticated
using (team_id is null or public.is_crm_team_member(team_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('crm-backups','crm-backups',false,52428800,array['application/gzip'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;

drop policy if exists "team masters read crm backups" on storage.objects;
create policy "team masters read crm backups" on storage.objects for select to authenticated
using(bucket_id='crm-backups' and exists(
  select 1 from public.crm_team_members m
  where m.user_id=(select auth.uid()) and m.team_id=(storage.foldername(name))[1] and m.role in ('master','manager')
));

create or replace function public.apply_scheduled_owner_refresh(payload jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  update public.leads l set
    pluto_owner_name=coalesce(nullif(x.owner_name,''),l.pluto_owner_name),
    owner_refreshed_at=now(), owner_refresh_status=case when x.owner_name='' then 'not_found' else 'fresh' end,
    first=case when x.owner_name<>'' and (coalesce(l.first,'')='' or l.raw_data->>'entity'='true' or l.raw_data->>'needs_verify'='true') then x.first_name else l.first end,
    last=case when x.owner_name<>'' and (coalesce(l.last,'')='' or l.raw_data->>'entity'='true' or l.raw_data->>'needs_verify'='true') then x.last_name else l.last end,
    raw_data=coalesce(l.raw_data,'{}'::jsonb)||jsonb_build_object('pluto_owner_name',x.owner_name,'owner_refreshed_at',now(),'scheduled_owner_refresh',true)
  from jsonb_to_recordset(payload) as x(local_id text,team_id text,owner_name text,first_name text,last_name text)
  where l.local_id=x.local_id and l.team_id::text=x.team_id;
  get diagnostics n=row_count; return n;
end; $$;
revoke all on function public.apply_scheduled_owner_refresh(jsonb) from public,anon,authenticated;
grant execute on function public.apply_scheduled_owner_refresh(jsonb) to service_role;
