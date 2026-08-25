-- Schedules member-purge-sweep once daily — permanently deletes members
-- rows soft-deleted more than 7 days ago (Roster's "delete profile") and
-- profiles rows soft-deleted more than 7 days ago (Profile's own "delete
-- account" self-service flow), releasing any still-live chore assignment
-- back to the pool first. Same current_setting('app.service_role_key')-
-- based auth pattern as the other active cron jobs (quest-sweep-cron,
-- stale-request-sweep-hourly, call-reminder-sweep-minutely).

SELECT cron.schedule(
  'member-purge-sweep-daily',
  '0 4 * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/member-purge-sweep',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
