# Supabase security rollout

1. Review and run `001_auth_sync_foundation.sql` first. It is additive.
2. Create/migrate Supabase Auth users and populate `crm_team_members`.
3. Confirm the Hybrid login works with Supabase Auth.
4. Export a database backup.
5. Only then run `002_enforce_rls_after_user_migration.sql`.

Do not run migration 002 while the original Netlify CRM still depends exclusively on legacy email/PIN table queries. The Hybrid frontend keeps a legacy fallback during transition.
