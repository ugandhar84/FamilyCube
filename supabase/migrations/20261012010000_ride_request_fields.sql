-- Figma ride-form rhythm: a kid's requested driver preference (free text,
-- distinct from driver_name/driver_id which hold the actual assignment once
-- a parent picks a driver) and a lightweight once/weekly toggle (distinct
-- from the full recurrence_rule/series_id materialized-rows engine, which
-- this simple kid-facing ask doesn't need).
alter table public.calendar_events
  add column if not exists driver_preference text,
  add column if not exists ride_recurrence text check (ride_recurrence in ('once', 'weekly'));
