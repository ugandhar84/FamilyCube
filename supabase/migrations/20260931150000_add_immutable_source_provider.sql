-- Live-requested: the sync badge should show where an event was
-- ORIGINALLY created ("source of truth"), not whichever provider's sync
-- happened to touch it most recently. `last_external_sync_provider` is
-- mutable by design (every push/pull/dedup-merge re-stamps it — that's
-- correct for its OWN purpose: "which connected account last touched
-- this event," used for staleness/debugging). Conflating that with
-- "where did this come from" caused a real live bug: an event added into
-- the Apple/EventKit-synced calendar showed the Google icon minutes
-- later, once Google's own poll happened to dedup-match it.
--
-- `source_provider` is a NEW, WRITE-ONCE field: stamped exactly once, at
-- the moment an event first becomes known to FamilyCube (either created
-- in-app, or first pulled in from an external provider), and never
-- touched again by any later sync pass. 'app' covers every event created
-- directly through FamilyCube's own UI — including recurring-event
-- expansion, quest-to-event conversions, etc. — as opposed to an event
-- that first entered FamilyCube's knowledge via an inbound Google/Apple/
-- Outlook pull.
alter table public.calendar_events
  add column if not exists source_provider text
    check (source_provider is null or source_provider in ('app', 'google', 'apple', 'outlook'));

-- Backfill: every existing row's origin is inferred as best-effort from
-- current state. An event with an event_external_links row (any provider)
-- but originally UNKNOWABLE prior origin is treated as 'app' unless
-- there's stronger signal — this backfill can't recover TRUE history for
-- rows written before this column existed, only make a reasonable guess
-- so existing rows aren't left null forever. New rows going forward get
-- an exact, correct stamp from the write-site changes accompanying this
-- migration (calendar-oauth-exchange is NOT the place; the actual write
-- sites are eventStore.ts's addEvent, googleReconcile.ts/outlook-webhook/
-- calendarSync2Way.ts's "genuinely new external item" insert branches).
update public.calendar_events
set source_provider = coalesce(source_provider, 'app')
where source_provider is null and deleted_at is null;
