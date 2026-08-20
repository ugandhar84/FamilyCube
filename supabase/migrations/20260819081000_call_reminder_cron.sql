-- Schedule call-reminder-sweeper to run every minute — lead-time windows
-- (e.g. "10 min before") are minute-grained, so this needs tighter cadence
-- than the hourly appointment-reminder sweep. Uses the same
-- current_setting('app.service_role_key')-based auth pattern as the other
-- active cron jobs (quest-sweep-cron etc.) — the vault.decrypted_secrets
-- pattern in the older milestone-cron migration doesn't resolve against
-- this project's actual secret storage.

SELECT cron.schedule(
  'call-reminder-sweep-minutely',
  '* * * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/call-reminder-sweeper',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
