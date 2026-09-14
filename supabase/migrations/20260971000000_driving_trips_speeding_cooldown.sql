-- Speeding alerts were "once per trip, ever" (driving_trips.speeding_alerted,
-- a plain boolean) — live-requested: re-alert if the driver crosses the
-- threshold again after staying under it for a while, not just once per
-- entire drive. speeding_last_alerted_at tracks when the most recent alert
-- actually fired; lib/locationTracking.ts's handleDrivingTrip now gates a
-- new alert on 5+ minutes since this timestamp, not on the boolean alone.
-- speeding_alerted itself is kept (still used to mean "has this trip EVER
-- had a speeding alert," e.g. for a trip-summary "speeding" badge) rather
-- than dropped.

alter table public.driving_trips
  add column if not exists speeding_last_alerted_at timestamptz;
