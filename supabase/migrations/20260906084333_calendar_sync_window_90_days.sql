-- Limits external calendar 2-way sync to a rolling 90-day window.
--
-- Outlook and Apple already re-apply a date bound on every sync (Outlook's
-- calendarView/delta stays scoped to its original startDateTime/endDateTime
-- for the life of the delta chain; Apple's EventKit sweep is a fresh
-- windowed query every time) — those just had the bound set to 365 days,
-- changed to 90 in the function code alongside this migration.
--
-- Google is structurally different: Events.list's syncToken cannot be
-- combined with timeMin/timeMax (Google rejects the request), so the
-- 90-day timeMax in googleReconcile.ts only ever bounds the very FIRST
-- sync for a connection — every poll after that uses syncToken alone with
-- no date bound at all, and a recurring series created on Google months
-- into the connection's life would still get pulled in full, unbounded.
--
-- Fix: last_full_sync_at tracks when a Google connection's sync_token was
-- last (re)seeded from a fresh, date-bounded initial sync. A new cron
-- (calendar-google-reseed) periodically nulls sync_token for connections
-- overdue for reseed — reconcileGoogleChanges already has a real, tested
-- "no sync_token -> fresh bounded sync" path (it's what runs on first
-- connect and after a Google-returned 410), so nulling the token is
-- sufficient; no new sync logic needed for the actual refetch.
alter table public.calendar_connections
  add column if not exists last_full_sync_at timestamptz;

-- Backfill: treat every existing connection as freshly seeded as of now,
-- so this migration doesn't immediately force-reseed every connection in
-- the same run the reseed cron next fires (that would burn a large batch
-- of Google API calls all at once for connections that were already
-- perfectly in sync). New connections set this at initial-sync time.
update public.calendar_connections
  set last_full_sync_at = coalesce(last_full_sync_at, created_at)
  where provider = 'google' and last_full_sync_at is null;

comment on column public.calendar_connections.last_full_sync_at is
  'Google only: when sync_token was last (re)seeded from a fresh, 90-day-bounded initial sync. calendar-google-reseed nulls sync_token for connections overdue for reseed so the 90-day window stays enforced over time, not just on first connect.';

-- Daily cron: reseed any Google connection whose last full sync is more
-- than 7 days old. 7 days (not e.g. 90) because the goal is keeping the
-- window itself fresh (an event added on Google today should fall inside
-- SOME future reseed's 90-day bound reasonably soon), not matching the
-- window's own length — a 90-day reseed cadence would mean a newly added
-- far-future recurring event could go unseen for up to 90 days.
select cron.schedule(
  'calendar-google-reseed-daily',
  '0 5 * * *',
  $$
    SELECT net.http_post(
      url := 'https://gqzdbxrqpkwvwcwvdnix.supabase.co/functions/v1/calendar-google-reseed',
      headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
