-- Appointment reminder cron job — fires every hour
-- Run once in Supabase Dashboard → SQL Editor

SELECT cron.schedule(
  'send-appointment-reminder-hourly',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url      := current_setting('app.supabase_url') || '/functions/v1/send-appointment-reminder',
      headers  := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body     := '{}'::jsonb
    )
  $$
);
