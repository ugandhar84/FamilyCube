-- Schedules smart-device-sync every 5 minutes — refreshes tokens close to
-- expiry, pulls current device state/program/filter data for every
-- connected account. Same current_setting('app.service_role_key')-based
-- auth pattern as the other active cron jobs (game-challenge-sweep, etc).
SELECT cron.schedule(
  'smart-device-sync-5min',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/smart-device-sync',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
