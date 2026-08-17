-- The client (store/familyStore.ts fromRow/toRow) has always read/written
-- gp_cheerleader_mode / gp_drive_window_days / gp_drive_window_start /
-- gp_drive_window_end / gp_weekly_ride_cap on members, but no migration
-- ever added these columns — every write was silently a no-op against a
-- nonexistent column (or erroring, depending on RLS/PostgREST behavior),
-- so a GP's stated ride-dispatch preferences never actually persisted.
-- Needed now so process-task-assignment's zero-touch ride auto-dispatch
-- (RideRequestCard.tsx) can honor Cheerleader Mode / weekly cap / drive
-- window instead of ignoring them.

alter table public.members
  add column if not exists gp_cheerleader_mode boolean not null default false,
  add column if not exists gp_drive_window_days integer[] not null default '{2,4}',
  add column if not exists gp_drive_window_start text not null default '14:00',
  add column if not exists gp_drive_window_end text not null default '17:30',
  add column if not exists gp_weekly_ride_cap integer not null default 2;
