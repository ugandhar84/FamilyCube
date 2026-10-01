-- med-dose-reminders (new edge function) needs to dedupe "dose is due now"
-- nudges per dose-time entry, same encoding as taken_dates
-- (encodeTakenEntry: "YYYY-MM-DD" for a single-dose med, "YYYY-MM-DD@HH:MM"
-- for a multi-dose one) — otherwise a 5-minute cron re-notifies the same
-- dose on every tick within its 10-minute catch-up window instead of once.
alter table public.family_medications
  add column if not exists dose_notified_entries text[] not null default '{}';
