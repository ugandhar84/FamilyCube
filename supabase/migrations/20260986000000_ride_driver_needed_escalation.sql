-- Tracking column for ride-driver-needed-sweeper (edge function) — a ride
-- that's gone driverless (driver decline/removal leaves driver_id/driver_name
-- empty on a rideRequired event) gets an immediate all-parents notification
-- from the client (store/eventStore.ts's declineEventAssignment/updateEvent),
-- but nothing previously re-escalated if it STAYED driverless as the event
-- time approached — a parent could see one ping, get distracted, and the
-- ride would just silently stay unassigned with no further nudge.
--
-- Mirrors schedule-conflict-sweep's own conflict_notified_at/
-- conflict_notified_pair pattern: stamp when the sweeper last escalated this
-- specific driverless state, so re-running the sweep doesn't re-notify every
-- pass — only once a cooldown window has passed AND the event is still
-- genuinely driverless (a parent picking it up since the last escalation
-- clears driver_id, which the sweeper's own WHERE clause already excludes).
alter table public.calendar_events
  add column if not exists driver_needed_last_notified_at timestamptz;

comment on column public.calendar_events.driver_needed_last_notified_at is
  'Last time ride-driver-needed-sweeper broadcast a "still no driver" escalation for this event. Null until the first escalation fires. Cleared implicitly in effect once driver_id is set again (the sweeper only ever selects still-driverless rows).';
