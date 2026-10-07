-- 016: add the master_accounts columns the client has always selected but that
-- no migration ever created. Missing any one of them made Postgres fail the whole
-- billing select (42703 undefined_column), so a paid plan never activated in-app.
-- Safe + idempotent: re-running changes nothing.

alter table if exists public.master_accounts
  add column if not exists email_verified   boolean not null default true,
  add column if not exists referral_code    text,
  add column if not exists referral_credits integer not null default 0,
  add column if not exists logo_url         text,
  add column if not exists accent_color     text;

-- A referral code has to be unique to be worth anything, but existing rows are
-- NULL, so the index only covers rows that actually have one.
create unique index if not exists master_accounts_referral_code_key
  on public.master_accounts (referral_code)
  where referral_code is not null;

-- Give every existing account a referral code so the Referral card works for
-- accounts created before this migration.
update public.master_accounts
   set referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
 where referral_code is null;
