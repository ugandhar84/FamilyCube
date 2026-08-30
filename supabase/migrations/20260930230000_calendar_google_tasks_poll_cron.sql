-- Same rationale as calendar-google-poll's cron (20260930200000): Google
-- Tasks has no push mechanism reachable from this project either, and
-- HubScreen's reactive 10-minute-throttled call only covers members who
-- actually open the app. This cron covers the gap when nobody has it open.

SELECT cron.schedule(
  'calendar-google-tasks-poll-10min',
  '*/10 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/calendar-google-tasks-poll',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
