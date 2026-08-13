-- Add 'Other' and 'Errand' to calendar_events category constraint
-- Run once: psql $DATABASE_URL < supabase/migration_calendar_categories_v2.sql

ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_category_check;

ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_category_check
    CHECK (category IN ('Medical','Sports','Study','Ride','Work','Event','Birthday','Errand','Other'));
