-- Per-member opt-out for the store_proximity_reminders geofence feature —
-- lets a member disable "you're near X, items pending" for themselves
-- specifically, via EditMemberModal (Roster tab), rather than the reminder
-- being all-or-nothing per family via the feature flag alone.
alter table public.members
  add column if not exists store_proximity_reminders_enabled boolean not null default true;
