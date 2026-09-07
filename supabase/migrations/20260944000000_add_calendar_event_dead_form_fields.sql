-- Adds real, persisted columns for 4 real EventFormModal.tsx UI fields
-- (Appointment type, Sport type, Kit reminder, Meeting link) that were
-- captured in local form state and passed into CategoryFields.tsx, but
-- never actually referenced in that file's own submit()/eventInput
-- construction — picked in the UI, then silently discarded on save, on
-- the real phone as well as kiosk. Purely additive/nullable so this has
-- no effect on the real mobile app's own current behavior (its form still
-- discards these on submit unless separately fixed); kiosk's own edit
-- form is the first real caller to actually read/write them.

alter table calendar_events
  add column if not exists appt_type text,
  add column if not exists sport_type text,
  add column if not exists kit_reminder boolean not null default false,
  add column if not exists meeting_url text;
