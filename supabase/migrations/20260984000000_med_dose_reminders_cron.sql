-- Schedule med-dose-reminders every 5 minutes — the dose-time nudge to the
-- medication's own subject (distinct from med-reminders' 10-minute,
-- 30-min-late escalation to parents). Tighter interval since this
-- function's own catch-up window is only 10 minutes past the scheduled
-- dose time.

SELECT cron.schedule(
  'med-dose-reminders-five-minutely',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/med-dose-reminders',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
