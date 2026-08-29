-- GpsTab's "Share my location" toggle only ever checked the live native
-- OS-level background task state (Location.hasStartedLocationUpdatesAsync)
-- to decide whether to show on/off — nothing persisted the user's actual
-- CHOICE anywhere. A fresh app reinstall wipes that OS-level task
-- registration along with the app itself, so the toggle silently reset to
-- "off" in the UI even though the person's real intent was still "on"
-- (direct report: "share my location toggle is not a DB one? i see it is
-- on reinstall reset to false in UI").
--
-- member_locations (not profiles) is the right home for this — profiles
-- is keyed by auth.users.id (one real account), but location sharing is a
-- per-MEMBER choice: a shared-device family can have a parent sharing and
-- a kid not, both under the same device/app install.
alter table public.member_locations
  add column if not exists share_location_enabled boolean not null default false;

comment on column public.member_locations.share_location_enabled is 'Persisted user intent for whether this member has location sharing turned on — independent of the live native background-task state, which a reinstall/OS-level wipe resets to stopped regardless of what the person actually chose. Read on app launch to auto-resume the native task after exactly that kind of reset, rather than silently showing "off" until the user re-toggles manually.';
