-- Schedules the media-retention-cleanup edge function to run nightly at
-- midnight. Requires the pg_cron and pg_net extensions (already used by the
-- other scheduled jobs in this project — see purge-deleted-accounts and the
-- playdates 'reminders' cron for the same pattern) and the app.supabase_url /
-- app.service_role_key database settings to already be configured.
--
-- The function itself only processes categories with enabled = true in
-- media_retention_config, so this single nightly schedule serves every
-- category — admins turn cleanup on/off per category from
-- /admin/media-retention, not by adding/removing cron jobs.
--
-- Run once, AFTER deploying the function:
--   supabase functions deploy media-retention-cleanup
--   psql $DATABASE_URL < supabase/migration_media_retention_cron.sql

-- cron.schedule() upserts by jobname, so this is safe to re-run.
SELECT cron.schedule(
  'media-retention-cleanup',
  '0 0 * * *',  -- 00:00 every night
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/media-retention-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  )$$
);
