-- Daily renewal of Google watch channels (weekly expiry) and Outlook
-- calendar subscriptions (~3-day expiry) — both silently stop delivering
-- webhooks once expired, with no error surfaced anywhere, so this must run
-- proactively rather than reactively. Daily cadence comfortably covers
-- Outlook's shorter window with margin.

SELECT cron.schedule(
  'calendar-channel-renewal-daily',
  '0 6 * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/calendar-channel-renewal',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
