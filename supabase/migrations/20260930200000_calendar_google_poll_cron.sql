-- Real inbound sync for Personal Google connections runs on a schedule,
-- not push — Google's channels.watch requires the webhook domain to be
-- verified in Search Console under the same Cloud project as the OAuth
-- client, which isn't achievable on a supabase.co domain we don't control
-- DNS for (confirmed live: watch registration succeeds but no push ever
-- arrives). HubScreen already triggers calendar-google-poll reactively
-- with a 10-minute throttle whenever the Hub is opened, but this cron
-- covers the gap when nobody has the app open — every 10 minutes, same
-- cadence as the reactive throttle, so a change made directly on Google
-- Calendar shows up in FamilyCube within 10 minutes even with the app
-- closed the whole time.

SELECT cron.schedule(
  'calendar-google-poll-10min',
  '*/10 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/calendar-google-poll',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
