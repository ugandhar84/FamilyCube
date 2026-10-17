-- trips: optional pickup coordinates for real GPS-driven automation.
--
-- Live direction: "as parent starts a trip ... it should automatically do
-- all its own" — the phase track (20260985000000_trips_phase_and_notes.sql)
-- only ever advanced on a manual driver tap. member_locations already
-- tracks every member's live lat/lng (background task,
-- lib/locationTracking.ts) and store_locations/storeGeofencing.ts already
-- proves the geofence-on-enter pattern for a different feature (grocery
-- store arrival) — this reuses both for trips: once a trip has a pinned
-- pickup point, lib/tripGeofencing.ts registers a geofence there and
-- calls advance_trip_phase(trip_id, 'picked_up') automatically on enter,
-- the same way storeGeofencing's task calls its own notification on enter.
--
-- Nullable and purely additive — a trip dispatched without a pinned
-- pickup location (the common case today, since DispatchRideSheet has no
-- location step yet) just never geofences and falls back to the existing
-- fully-manual advance_trip_phase tap flow. No existing behavior changes
-- for a trip with no pickup coordinates set.

alter table public.trips
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision,
  add column if not exists pickup_label text;

comment on column public.trips.pickup_lat is 'Optional pinned pickup latitude — enables automatic geofence-triggered phase advance (lib/tripGeofencing.ts). Null = fully manual trip, unchanged behavior.';
comment on column public.trips.pickup_lng is 'Optional pinned pickup longitude — see pickup_lat.';
comment on column public.trips.pickup_label is 'Human-readable label for the pinned pickup point (e.g. the event location text), shown in the UI next to the pin.';
