-- Per-family driving-report settings — configurable speeding threshold and
-- display unit, per live request. Stored on `families` (one setting per
-- family, not per member) since a speed limit is a household policy, not
-- an individual preference — mirrors the existing add-column-to-families
-- precedent (20260903130000_add_per_device_chat_encryption.sql).
-- speeding_threshold_mph is ALWAYS stored in mph regardless of display
-- unit — speed_unit only controls how it's rendered/edited in the UI, so
-- lib/locationTracking.ts's comparison logic never needs to convert units.
-- Default 70mph — the metric equivalent (113 km/h) is applied client-side
-- via display conversion, not a second stored value, so there's exactly
-- one source of truth for the actual threshold.
alter table families add column if not exists speed_unit text not null default 'mph' check (speed_unit in ('mph', 'kmh'));
alter table families add column if not exists speeding_threshold_mph integer not null default 70;

-- Driving Reports — one row per detected drive session, derived from the
-- existing background location task's own fixes (no new native tracking).
-- Parent-only visibility: kid drivers' trip data is for parents to review,
-- not siblings — mirrors 20260930540000_rewards_parent_only_write_rls.sql's
-- exists-check pattern, applied to SELECT here instead of a write policy.
create table if not exists driving_trips (
  id bigint generated always as identity primary key,
  member_id text not null,
  family_id text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  max_speed_mph integer not null default 0,
  distance_miles double precision not null default 0,
  start_lat double precision, start_lng double precision,
  end_lat double precision, end_lng double precision,
  -- Dedupe flags — each alert fires once per trip, not once per qualifying
  -- fix (a trip can hold >80mph for several consecutive fixes).
  speeding_alerted boolean not null default false,
  possible_crash_alerted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists driving_trips_member_idx
  on driving_trips (member_id, started_at desc);

alter table driving_trips enable row level security;

create policy driving_trips_select on driving_trips
  for select using (
    family_id = (current_user_family_id())::text
    and exists (
      select 1 from public.members
      where members.id = resolve_active_member_id() and members.role = 'parent'
    )
  );

-- Insert/update come from the background task running under the DRIVING
-- member's own session (a kid's own phone writes these rows about
-- themselves) — family-scoped only, no role restriction, same as
-- member_location_history's own write policies.
create policy driving_trips_insert on driving_trips
  for insert with check (family_id = (current_user_family_id())::text);

create policy driving_trips_update on driving_trips
  for update using (family_id = (current_user_family_id())::text);
