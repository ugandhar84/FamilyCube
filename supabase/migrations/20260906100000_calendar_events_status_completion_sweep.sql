-- NOTE (added after the fact): the `ADD COLUMN IF NOT EXISTS status ...`
-- below silently no-op'd — calendar_events already had an unrelated,
-- pre-existing `status` column in production (every row 'approved', an
-- approval-workflow value with no migration history in this repo). This
-- migration's CHECK/default never actually applied. The real completion-
-- tracking column is `completion_status`, added properly in
-- 20260906110000_calendar_events_completion_status_rename.sql — this file
-- is kept as-is (already applied to the remote migration history) rather
-- than edited after the fact.
--
-- Original intent: a real lifecycle field for the event itself, distinct
-- from helper_status/driver_status (which track a PARTICIPANT's
-- assignment, not whether the event itself has happened yet). "Past" has
-- always been a pure client-side derivation (hoursUntilEvent(...) < 0 in
-- hubUtils.ts) with nothing persisted — this adds an automatic sweep so
-- the DB reflects "this already happened" on its own, not just dimmed
-- styling client-side.

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed'));

-- Same current_setting('app.service_role_key')-based cron auth pattern as
-- the other active jobs (stale-request-sweep-hourly, call-reminder-sweep-
-- minutely). Runs every 15 minutes — end-of-event completion isn't
-- minute-grained like a call reminder, but hourly (the stale-request
-- cadence) would leave a finished event showing "scheduled" for up to an
-- hour after it's clearly over.
SELECT cron.schedule(
  'event-completion-sweep-15min',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/event-completion-sweep',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
