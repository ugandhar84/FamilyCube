-- Tracks whether schedule-conflict-sweep has already pushed a notification
-- for this event's current conflict, so the sweep (run on a schedule) never
-- re-notifies the same still-unresolved conflict every time it runs.
-- Cleared back to null whenever the event's own driver/helper/time changes
-- (the sweep does this itself on each run when it detects the conflict no
-- longer matches what was last notified) or the conflict is acknowledged/
-- resolved, so a genuinely NEW conflict on the same event still notifies.
alter table public.calendar_events
  add column if not exists conflict_notified_at timestamptz;
