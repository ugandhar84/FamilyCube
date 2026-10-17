-- Nightly safety net for appointment-recording audio (see supabase/functions/visit-audio-sweeper).
SELECT cron.schedule(
  'visit-audio-sweeper-nightly',
  '0 3 * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/visit-audio-sweeper',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
