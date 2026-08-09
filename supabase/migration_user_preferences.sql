alter table profiles
  add column if not exists pet_switch_style text check (pet_switch_style in ('bottom-sheet', 'dropdown', 'carousel')) default 'bottom-sheet',
  add column if not exists sos_radius integer check (sos_radius in (3, 5, 10)) default 10,
  add column if not exists country text check (country in ('US', 'IN')) default 'US',
  -- care notifications
  add column if not exists notif_daily boolean default true,
  add column if not exists notif_health boolean default true,
  add column if not exists notif_appointment boolean default true,
  -- social notifications
  add column if not exists notif_lost boolean default true,
  add column if not exists notif_family boolean default true,
  add column if not exists notif_playdate boolean default true,
  add column if not exists notif_chat boolean default true,
  add column if not exists notif_event boolean default true,
  -- quiet hours
  add column if not exists quiet_hours_enabled boolean default false,
  add column if not exists quiet_hours_start text default '22:00',
  add column if not exists quiet_hours_end text default '07:00';

-- Upgrade nudge notification preference (added for context-aware Ultimate nudges)
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS notif_upgrade boolean DEFAULT true;
