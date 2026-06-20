-- The production cron schedule was installed with CRM_PUSH_SECRET injected at deploy time.
-- Secrets are intentionally excluded from source control.
select 'BlockBoss push reminder schedule installed'::text;
