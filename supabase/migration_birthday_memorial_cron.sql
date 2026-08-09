-- Birthday & memorial anniversary push notification cron job
-- Run once in Supabase Dashboard → SQL Editor

-- Schedule the edge function to fire every day at 9:00 AM UTC
SELECT cron.schedule(
  'send-birthday-memorial-daily',
  '0 9 * * *',
  $$
    SELECT net.http_post(
      url      := current_setting('app.supabase_url') || '/functions/v1/send-birthday-memorial',
      headers  := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body     := '{}'::jsonb
    )
  $$
);
