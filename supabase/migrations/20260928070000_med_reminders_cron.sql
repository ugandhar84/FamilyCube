-- Schedule med-reminders every 10 minutes — tighter than most sweeps in
-- this app since a missed-medication alert is health-relevant, not just
-- convenience, and the default 30min escalation window is itself fairly
-- tight.

SELECT cron.schedule(
  'med-reminders-ten-minutely',
  '*/10 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/med-reminders',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
