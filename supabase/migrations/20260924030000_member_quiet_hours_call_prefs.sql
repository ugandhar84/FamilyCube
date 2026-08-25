-- Quiet hours + call-alert opt-out, per member — real backing for the
-- Profile page's Notifications section, per user request ("user should be
-- able to configure individual notifications including call alerts, quiet
-- periods etc"). Mirrors the shape PawBond's own profiles.quiet_hours_*
-- columns already use (supabase/functions/_shared/prefs.ts's
-- inQuietHours()), but on members — the real per-person entity Family
-- Cube's own notification system (family-notifier) is scoped by — not
-- profiles, which is one row per auth'd login and doesn't exist for a
-- PIN-only kid/senior member at all.
alter table public.members
  add column if not exists quiet_hours_enabled boolean not null default false,
  add column if not exists quiet_hours_start text,  -- 'HH:MM' 24h, local to the member's device
  add column if not exists quiet_hours_end text,    -- 'HH:MM' 24h
  add column if not exists call_alerts_enabled boolean not null default true;
