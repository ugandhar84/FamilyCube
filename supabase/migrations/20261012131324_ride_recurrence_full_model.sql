-- Widen the kid ride form's recurrence to match the parent "Describe It"
-- composer's model (JustDescribeItScreen.tsx): once/daily/weekly/monthly,
-- optional day-of-week selection (weekly only), optional end date. The
-- original ride_recurrence column (20261012010000_ride_request_fields.sql)
-- only supported once/weekly via a CHECK constraint — drop that constraint
-- and widen it, and add the two new columns alongside it.
alter table public.calendar_events
  drop constraint if exists calendar_events_ride_recurrence_check;

alter table public.calendar_events
  add constraint calendar_events_ride_recurrence_check
  check (ride_recurrence in ('once', 'daily', 'weekly', 'monthly'));

alter table public.calendar_events
  add column if not exists ride_recurrence_days int[],
  add column if not exists ride_recurrence_end_date date;
