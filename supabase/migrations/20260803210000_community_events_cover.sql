ALTER TABLE community_events
  ADD COLUMN IF NOT EXISTS event_end_date date,
  ADD COLUMN IF NOT EXISTS event_end_time text,
  ADD COLUMN IF NOT EXISTS cover_url      text;

NOTIFY pgrst, 'reload schema';
