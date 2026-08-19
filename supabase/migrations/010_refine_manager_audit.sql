create or replace function public.capture_lead_audit()
returns trigger language plpgsql security definer set search_path=public as $$
declare oldj jsonb; newj jsonb; tid text; lid text; changed boolean;
begin
  oldj=case when tg_op='INSERT' then null else to_jsonb(old) end;
  newj=case when tg_op='DELETE' then null else to_jsonb(new) end;
  tid=coalesce(newj->>'team_id',oldj->>'team_id','');
  lid=coalesce(newj->>'local_id',oldj->>'local_id','');
  changed=tg_op<>'UPDATE' or (oldj - array['updated_at','sync_version','_sync_status','_sync_checked_at']) is distinct from (newj - array['updated_at','sync_version','_sync_status','_sync_checked_at']);
  -- Do not flood the manager timeline with bulk public-data imports or scheduled maintenance.
  if tg_op='INSERT' and coalesce(newj->>'source','')='pluto' and coalesce(newj->>'status','fresh')='fresh' then changed=false; end if;
  if tg_op='UPDATE' and auth.uid() is null then changed=false; end if;
  if changed and tid<>'' and lid<>'' then
    insert into public.lead_audit_events(team_id,lead_id,action,actor_id,actor_email,before_data,after_data)
    values(tid,lid,lower(tg_op),auth.uid(),auth.jwt()->>'email',oldj,newj);
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;$$;
revoke all on function public.capture_lead_audit() from public,anon,authenticated;
