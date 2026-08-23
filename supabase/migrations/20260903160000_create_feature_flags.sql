-- feature_flags did not exist in production — lib/featureFlags.ts's
-- fetchRemoteFlags() was silently failing on every call (caught, falls
-- back to DEFAULTS), meaning every flag in the app has only ever run on
-- its local hardcoded default, never an actual remote override. This
-- creates the table lib/featureFlags.ts already expects: key, enabled,
-- readable by any authenticated user (flags are not sensitive), writable
-- only for admin use (Table Editor / SQL — no app-side write path today).

create table if not exists feature_flags (
  key         text primary key,
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now()
);

alter table feature_flags enable row level security;

create policy feature_flags_select on feature_flags
  for select using (auth.uid() is not null);

-- Seed the flags this app currently defines (lib/featureFlags.ts DEFAULTS)
-- so an admin can find and toggle them without knowing to insert a new row
-- first. Values here match lib/featureFlags.ts DEFAULTS as of this
-- migration — kept in sync only at creation time, not automatically.
insert into feature_flags (key, enabled) values
  ('gamification', true),
  ('daily_quests', false),
  ('leaderboard', false),
  ('cuteness_arena', false),
  ('pet_report_card', false),
  ('seasonal_events', false),
  ('rewards_marketplace', false),
  ('sponsored_ads', true),
  ('per_device_e2e', false)
on conflict (key) do nothing;
