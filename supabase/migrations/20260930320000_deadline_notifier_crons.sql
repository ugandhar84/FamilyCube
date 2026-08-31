-- Registers the cron schedule for ride-deadline-notifier — the ride
-- equivalent of chore-deadline-notifier's pool-unclaimed-urgent and
-- claimed-but-silent check-in nudges, which calendar_events/rides had no
-- equivalent of at all (master-flow-v2 QA audit, case C2, gap #4/#26/#27).
--
-- NOTE on chore-deadline-notifier: two earlier audit passes (the 27-gap
-- master-flow sweep and this session's own case-C2 trace) both flagged it
-- as "no committed cron migration found, presumed unscheduled." Direct
-- query against cron.job before writing this migration found that's
-- WRONG — it's already live via 'chore-deadline-notifier-8am' (08:00),
-- 'chore-deadline-notifier-4pm' (16:00), and a separate
-- 'chore-overdue-check-midnight' (00:30), all active=true, just never
-- registered through a committed migration file (set up some other way,
-- e.g. directly in the dashboard). Not re-registering it here — doing so
-- would double-fire every notification it sends twice a day. This
-- migration only adds what's actually still missing: the ride side.

SELECT cron.schedule(
  'ride-deadline-notifier-15min',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/ride-deadline-notifier',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
