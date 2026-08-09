SELECT cron.unschedule('send-mood-reminder') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-mood-reminder'
);
SELECT cron.schedule(
  'send-mood-reminder',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/send-mood-reminder',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb
  )
  $$
);
