-- Supabase may grant new public functions to API roles by default.
-- The claim RPC must only be callable with a valid Auth JWT.
revoke all on function public.migrate_legacy_account(text,text,text) from public, anon;
grant execute on function public.migrate_legacy_account(text,text,text) to authenticated;
