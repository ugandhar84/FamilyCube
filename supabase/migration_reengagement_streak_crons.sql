-- Re-engagement push: daily at 10:00 UTC
-- Targets users absent 3 / 7 / 14 days with escalating "We miss you" pushes
SELECT cron.unschedule('send-reengagement') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-reengagement'
);
SELECT cron.schedule(
  'send-reengagement',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/send-reengagement',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb
  )
  $$
);

-- Streak-break recovery push: daily at 21:00 UTC (before midnight streak reset)
-- Reminds users who had a streak ≥ 3 but haven't logged today
SELECT cron.unschedule('send-streak-recovery') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-streak-recovery'
);
SELECT cron.schedule(
  'send-streak-recovery',
  '0 21 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/send-streak-recovery',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb
  )
  $$
);
