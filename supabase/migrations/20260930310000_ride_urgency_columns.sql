-- Backing columns for the new ride-deadline-notifier sweep (master-flow-v2
-- gap #4/#26/#27: "Nobody took this" pool-urgent broadcast and "Still on?"
-- check-in for a claimed-but-silent ride — both already exist for chores
-- via chore_tasks.pool_urgent_notified_at, but calendar_events had no
-- equivalent at all, confirmed by the master-flow QA audit (case C2).
alter table public.calendar_events
  add column if not exists ride_pool_urgent_notified_at timestamptz,
  add column if not exists ride_checkin_notified_at timestamptz;

comment on column public.calendar_events.ride_pool_urgent_notified_at is
  'One-shot guard: set once the "nobody has claimed this ride yet, time is close" broadcast fires, so a repeat cron run does not re-fire it. Cleared implicitly once the ride is claimed (driver_id/helper_id set), which naturally stops matching the sweep query again.';
comment on column public.calendar_events.ride_checkin_notified_at is
  'One-shot guard for the "still on?" check-in nudge sent to a confirmed driver/helper shortly before the ride time, mirroring chore_tasks'' claimed-but-silent check-in.';
