create table if not exists public.lead_audit_events(
  id bigint generated always as identity primary key,
  team_id text not null,
  lead_id text not null,
  action text not null check(action in ('insert','update','delete')),
  actor_id uuid,
  actor_email text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists lead_audit_team_time_idx on public.lead_audit_events(team_id,created_at desc);
create index if not exists lead_audit_lead_idx on public.lead_audit_events(team_id,lead_id,created_at desc);
alter table public.lead_audit_events enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='lead_audit_events'
  loop execute format('drop policy if exists %I on public.lead_audit_events',p.policyname);end loop;
end $$;
create policy "managers read team audit" on public.lead_audit_events for select to authenticated
using(public.is_crm_team_manager(team_id));

create or replace function public.capture_lead_audit()
returns trigger language plpgsql security definer set search_path=public as $$
declare oldj jsonb; newj jsonb; tid text; lid text; changed boolean;
begin
  oldj=case when tg_op='INSERT' then null else to_jsonb(old) end;
  newj=case when tg_op='DELETE' then null else to_jsonb(new) end;
  tid=coalesce(newj->>'team_id',oldj->>'team_id','');
  lid=coalesce(newj->>'local_id',oldj->>'local_id','');
  changed=tg_op<>'UPDATE' or (oldj - array['updated_at','sync_version']) is distinct from (newj - array['updated_at','sync_version']);
  if changed and tid<>'' and lid<>'' then
    insert into public.lead_audit_events(team_id,lead_id,action,actor_id,actor_email,before_data,after_data)
    values(tid,lid,lower(tg_op),auth.uid(),auth.jwt()->>'email',oldj,newj);
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;$$;
revoke all on function public.capture_lead_audit() from public,anon,authenticated;
drop trigger if exists leads_manager_audit on public.leads;
create trigger leads_manager_audit after insert or update or delete on public.leads
for each row execute function public.capture_lead_audit();
