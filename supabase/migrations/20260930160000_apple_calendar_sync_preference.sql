-- Apple/EventKit 2-way sync (lib/calendarSync2Way.ts) — a per-member
-- opt-in toggle, same shape as store_proximity_reminders_enabled. Off by
-- default: writing into someone's device Calendar app should be a
-- deliberate choice, not a silent side effect of opening the app.
alter table public.members
  add column if not exists apple_calendar_sync_enabled boolean not null default false;

comment on column public.members.apple_calendar_sync_enabled is 'Opt-in for lib/calendarSync2Way.ts — writes FamilyCube events into the device Calendar app (EventKit) and pulls the device calendar''s own events back in via a foreground reconciliation sweep. Off by default.';
