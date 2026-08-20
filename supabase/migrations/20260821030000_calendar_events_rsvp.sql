-- Scenario 2.11 — Event RSVP / attendance confirmation.
--
-- Genuinely distinct from the existing acknowledged_by column (a binary
-- "I've seen this" for mandatory logistics events) — an optional group
-- event (e.g. "cousin's graduation party") needs a real Going/Not-Going/
-- Maybe headcount signal instead. calendar_events.rsvps is a JSONB map of
-- member_id -> 'going' | 'not_going' | 'maybe'; is_optional_rsvp marks
-- which events actually use this model (set by the creator at creation
-- time) rather than every event growing RSVP UI by default.
--
-- See store/eventStore.ts's respondToRsvp() and the reserved (previously
-- unused) 'event_rsvp' notification-type enum value in
-- 20260729000001_notif_type_check_complete.sql, which this finally gives a
-- real producer for.

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS is_optional_rsvp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rsvps jsonb NOT NULL DEFAULT '{}'::jsonb;
