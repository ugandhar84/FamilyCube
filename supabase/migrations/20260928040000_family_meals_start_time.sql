-- MealsTab's "Add/Edit Meal" only ever captured day + meal type (Breakfast/
-- Lunch/Dinner/Snack), never a clock time — so a "dinner reminder" had
-- nothing to anchor to. start_time follows calendar_events' own convention
-- (a display string like "6:00 PM" from the app's time picker, not a real
-- time/timestamptz column) so the new meal-reminders sweep can reuse
-- schedule-alerts' existing to24Hour/localWallClockToUTC helpers verbatim
-- instead of a second time-parsing implementation. timezone mirrors
-- calendar_events.timezone for the same reason (schedule-alerts' local
-- wall-clock-to-UTC conversion needs the IANA zone the time was entered in,
-- not just the bare string).
alter table public.family_meals
  add column if not exists start_time text,
  add column if not exists timezone text,
  add column if not exists reminder_sent boolean not null default false;

comment on column public.family_meals.start_time is 'Display time string from the app''s time picker (e.g. "6:00 PM"), optional — meals without a time set get no reminder.';
comment on column public.family_meals.timezone is 'IANA timezone the start_time was entered in, e.g. "America/Los_Angeles" — needed to convert the wall-clock string to a real instant for the reminder sweep.';
comment on column public.family_meals.reminder_sent is 'Set once the T-1h meal reminder has fired for this meal — prevents re-firing on every cron tick within the notify window.';
