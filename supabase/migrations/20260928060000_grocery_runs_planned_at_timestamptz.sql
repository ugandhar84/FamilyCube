-- grocery_runs.planned_at was a bare `date` column — CreateRunSheet.tsx's
-- new date/time picker (and grocery-reminders' T-1h-before sweep) both
-- assume it holds a real instant. Storing a full ISO timestamp into a
-- `date` column silently truncates the time off (confirmed live: an insert
-- with a real timestamp came back as just "2026-08-30"), so every planned
-- run's chosen TIME was being thrown away before the reminder feature could
-- ever see it. No existing data relies on the date-only shape — this column
-- had no reminder feature reading it until grocery-reminders was added.
alter table public.grocery_runs
  alter column planned_at type timestamptz using planned_at::timestamptz;

comment on column public.grocery_runs.planned_at is 'Full instant (date + time) the shopping trip is planned for — set via CreateRunSheet''s optional date/time picker. grocery-reminders reminds the shopper/parents 1hr before. Was previously a date-only column with no time component.';
