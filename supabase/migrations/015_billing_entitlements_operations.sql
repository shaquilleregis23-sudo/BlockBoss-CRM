create table if not exists public.crm_entitlements(
  team_id text primary key,
  plan_key text not null default 'solo',
  status text not null default 'pending',
  agent_limit integer not null default 0,
  lead_limit integer not null default 0,
  period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  source text not null default 'stripe',
  updated_at timestamptz not null default now()
);
alter table public.crm_entitlements enable row level security;
create policy "team members read entitlements" on public.crm_entitlements for select to authenticated
using(public.is_crm_team_member(team_id));
revoke insert,update,delete on public.crm_entitlements from anon,authenticated;

insert into public.crm_entitlements(team_id,plan_key,status,agent_limit,lead_limit,period_end,stripe_customer_id,stripe_subscription_id,source)
select m.team_id::text,
  regexp_replace(coalesce(m.plan_key,'solo'),'_annual$',''),
  coalesce(m.plan_status,'pending'),
  case regexp_replace(coalesce(m.plan_key,'solo'),'_annual$','') when 'agency' then 999 when 'team' then 5 else 0 end,
  case regexp_replace(coalesce(m.plan_key,'solo'),'_annual$','') when 'agency' then 999999 when 'team' then 25000 else 5000 end,
  m.plan_expires_at,m.stripe_customer_id,m.stripe_subscription_id,'backfill'
from public.master_accounts m where m.team_id is not null
on conflict(team_id) do update set plan_key=excluded.plan_key,status=excluded.status,agent_limit=excluded.agent_limit,
lead_limit=excluded.lead_limit,period_end=excluded.period_end,stripe_customer_id=excluded.stripe_customer_id,
stripe_subscription_id=excluded.stripe_subscription_id,updated_at=now();

create or replace function public.crm_entitlement_active(target_team text)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select status in ('active','trialing','trial') or (status='canceled' and period_end>now())
    from public.crm_entitlements where team_id=target_team),true);
$$;
revoke all on function public.crm_entitlement_active(text) from public,anon;
grant execute on function public.crm_entitlement_active(text) to authenticated;

create or replace function public.enforce_crm_lead_entitlement()
returns trigger language plpgsql security definer set search_path=public as $$
declare e public.crm_entitlements; used bigint;
begin
  select * into e from public.crm_entitlements where team_id=new.team_id::text;
  if not found then return new; end if;
  if not (e.status in ('active','trialing','trial') or (e.status='canceled' and e.period_end>now())) then
    raise exception 'Active BlockBoss subscription required' using errcode='P0001';
  end if;
  select count(*) into used from public.leads where team_id::text=e.team_id and deleted_at is null;
  if used>=e.lead_limit then raise exception 'BlockBoss lead limit reached' using errcode='P0001'; end if;
  return new;
end;$$;
revoke all on function public.enforce_crm_lead_entitlement() from public,anon,authenticated;
drop trigger if exists leads_entitlement_guard on public.leads;
create trigger leads_entitlement_guard before insert on public.leads for each row execute function public.enforce_crm_lead_entitlement();

create or replace function public.enforce_crm_agent_entitlement()
returns trigger language plpgsql security definer set search_path=public as $$
declare e public.crm_entitlements; used bigint;
begin
  if new.role<>'agent' or coalesce(new.status,'active') not in ('active','pending','invited') then return new; end if;
  select * into e from public.crm_entitlements where team_id=new.team_id;
  if not found then return new; end if;
  if not (e.status in ('active','trialing','trial') or (e.status='canceled' and e.period_end>now())) then
    raise exception 'Active BlockBoss subscription required' using errcode='P0001';
  end if;
  select count(*) into used from public.crm_team_members where team_id=e.team_id and role='agent' and status in ('active','pending','invited') and user_id<>new.user_id;
  if used>=e.agent_limit then raise exception 'BlockBoss agent limit reached' using errcode='P0001'; end if;
  return new;
end;$$;
revoke all on function public.enforce_crm_agent_entitlement() from public,anon,authenticated;
drop trigger if exists crm_members_entitlement_guard on public.crm_team_members;
create trigger crm_members_entitlement_guard before insert or update of role,status on public.crm_team_members for each row execute function public.enforce_crm_agent_entitlement();

create table if not exists public.stripe_webhook_events(
  event_id text primary key,
  event_type text not null,
  status text not null default 'processing' check(status in ('processing','processed','failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon,authenticated;

create table if not exists public.crm_lifecycle_messages(
  id bigint generated always as identity primary key,
  team_id text not null,
  email text not null,
  campaign text not null,
  status text not null default 'sent',
  provider_id text,
  sent_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(team_id,campaign)
);
alter table public.crm_lifecycle_messages enable row level security;
create policy "managers read lifecycle messages" on public.crm_lifecycle_messages for select to authenticated
using(public.is_crm_team_manager(team_id));
revoke insert,update,delete on public.crm_lifecycle_messages from anon,authenticated;
