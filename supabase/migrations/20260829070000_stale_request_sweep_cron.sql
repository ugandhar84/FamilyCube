-- Schedules stale-request-sweep hourly — deletes a kid's still-
-- approvalPending ride/event request once its own event time is more than
-- 24h in the past with nobody ever having approved/declined it. Same
-- current_setting('app.service_role_key')-based auth pattern as the other
-- active cron jobs (quest-sweep-cron, call-reminder-sweep-minutely).

SELECT cron.schedule(
  'stale-request-sweep-hourly',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/stale-request-sweep',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
