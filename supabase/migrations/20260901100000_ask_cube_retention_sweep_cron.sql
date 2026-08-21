-- Ask Cube conversation history — configurable hard-delete retention.
--
-- families.ask_cube_retention_days: household-configured window (default 7)
-- after which an ask_cube_conversations row (and its ask_cube_messages, via
-- the existing ON DELETE CASCADE FK — see 20260818233000_ask_cube_conversations.sql)
-- is HARD DELETED, not soft-hidden. Mirrors the existing settings-on-families
-- pattern (auto_approve_timeout_hours, teen_reward_cosign_threshold —
-- see 20260820220000_teen_reward_cosign_threshold.sql) rather than a magic
-- number scattered across files — the single place to change the window is
-- this column, defaulted per-family.
--
-- Actual deletion runs on a real schedule (pg_cron -> ask-cube-retention-sweep
-- edge function), same current_setting('app.service_role_key')-based cron
-- pattern as stale-request-sweep-hourly / quest-sweep-cron. Not a
-- filter-on-read — that would leave the rows (and their storage) behind
-- forever, which is explicitly not what was chosen here.

ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS ask_cube_retention_days integer NOT NULL DEFAULT 7;

SELECT cron.schedule(
  'ask-cube-retention-sweep-daily',
  '30 3 * * *',  -- once a day, off-peak
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/ask-cube-retention-sweep',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
