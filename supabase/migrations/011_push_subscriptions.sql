create table if not exists public.push_subscriptions(
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_team_idx on public.push_subscriptions(team_id,user_id);
alter table public.push_subscriptions enable row level security;
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname='public' and tablename='push_subscriptions' loop execute format('drop policy if exists %I on public.push_subscriptions',p.policyname);end loop;end $$;
create policy "users manage own push subscription" on public.push_subscriptions for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and public.is_crm_team_member(team_id));

create table if not exists public.push_reminder_log(
  reminder_key text primary key,
  team_id text not null,
  lead_id text not null,
  user_id uuid not null,
  sent_at timestamptz not null default now()
);
alter table public.push_reminder_log enable row level security;
revoke all on table public.push_reminder_log from anon,authenticated;
