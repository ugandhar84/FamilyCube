-- Schedules homeowner-notes-sweeper once daily at 13:00 UTC (roughly
-- morning across US timezones) — sends "due in a week"/"due today" pushes
-- for home maintenance reminders [live-requested: "a week before and on
-- the day"]. Same current_setting('app.service_role_key')-based auth
-- pattern as the other active cron jobs.
SELECT cron.schedule(
  'homeowner-notes-sweeper-daily',
  '0 13 * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/homeowner-notes-sweeper',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
