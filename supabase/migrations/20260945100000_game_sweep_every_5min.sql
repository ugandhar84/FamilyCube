-- Tightens game-challenge-sweep from hourly to every 5 minutes. The sweep
-- now also abandons a 'active' game session stale for 30+ minutes (a
-- silent-disconnect fallback — see game-challenge-sweep/index.ts's own
-- updated comment) — checking that only once an hour would let a stuck
-- game sit for up to ~90 minutes before the other player got any
-- resolution, far past the intended 30-minute grace window. The original
-- 24h pending-challenge/lobby expiry logic is unaffected by the tighter
-- cadence, just checked more often.
SELECT cron.unschedule('game-challenge-sweep-hourly');

SELECT cron.schedule(
  'game-challenge-sweep-5min',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/game-challenge-sweep',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
