-- Schedule meal-reminders every 15 minutes — tighter than schedule-alerts'
-- 30min cadence since a meal reminder's T-1h window is proportionally
-- narrower relative to how soon people need to act on it (start cooking).

SELECT cron.schedule(
  'meal-reminders-quarter-hourly',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/meal-reminders',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
