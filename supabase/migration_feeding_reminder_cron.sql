SELECT cron.unschedule('send-feeding-reminder') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-feeding-reminder'
);
SELECT cron.schedule(
  'send-feeding-reminder',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/send-feeding-reminder',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb
  )
  $$
);
