-- Schedules game-challenge-sweep hourly — expires a pending Tic-Tac-Toe/
-- Memory challenge nobody accepted/declined within its own expires_at
-- (default 24h after creation), and marks an Uno lobby that never filled
-- its seats as abandoned after the same 24h window. Same
-- current_setting('app.service_role_key')-based auth pattern as
-- stale-request-sweep-hourly and the other active cron jobs.
SELECT cron.schedule(
  'game-challenge-sweep-hourly',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/game-challenge-sweep',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
