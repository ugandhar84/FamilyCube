-- Schedule milestone-cron edge function to run daily at 06:00 UTC
-- Requires pg_cron and pg_net extensions (enabled by default on Supabase)

SELECT cron.schedule(
  'milestone-cron-daily',
  '0 6 * * *',
  $$
    SELECT net.http_post(
      url     := (SELECT value FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/milestone-cron',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);
