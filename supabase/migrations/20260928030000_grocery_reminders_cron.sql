-- Schedule grocery-reminders hourly — covers both the once-daily pending-
-- items digest (self-gated to each family's local 6pm inside the function)
-- and the T-1h-before grocery-run reminder. Same net.http_post +
-- app.service_role_key pattern as the other active cron jobs
-- (schedule-alerts, call-reminder-sweep, etc).

SELECT cron.schedule(
  'grocery-reminders-hourly',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/grocery-reminders',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
