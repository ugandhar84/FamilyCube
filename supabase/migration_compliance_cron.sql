-- ── pg_cron schedules for medical compliance + daily tips ────────────────────

-- Appointment reminders: every hour
SELECT cron.unschedule('send-appointment-reminders') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-appointment-reminders'
);
SELECT cron.schedule(
  'send-appointment-reminders',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/send-appointment-reminder',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb
  )
  $$
);

-- Med compliance check: every 30 minutes
SELECT cron.unschedule('med-compliance-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'med-compliance-check'
);
SELECT cron.schedule(
  'med-compliance-check',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/med-compliance-check',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb
  )
  $$
);

-- Daily care tips: every hour (delivers at 8 AM local per user)
SELECT cron.unschedule('send-daily-tip') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-daily-tip'
);
SELECT cron.schedule(
  'send-daily-tip',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/send-daily-tip',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb
  )
  $$
);
