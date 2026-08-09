-- Event feedback: star rating + optional text from RSVPed attendees only
-- Run once: psql $DATABASE_URL < supabase/migration_event_feedback.sql

CREATE TABLE IF NOT EXISTS event_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review      text CHECK (char_length(review) <= 300),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)          -- one review per attendee per event
);

CREATE INDEX IF NOT EXISTS event_feedback_event_idx    ON event_feedback(event_id);
CREATE INDEX IF NOT EXISTS event_feedback_user_idx     ON event_feedback(user_id);

-- Aggregate view: avg rating + count per event organizer
CREATE OR REPLACE VIEW user_event_rating_stats AS
SELECT
  ce.organizer_id                   AS user_id,
  ROUND(AVG(ef.rating), 2)          AS avg_rating,
  COUNT(ef.id)::int                 AS total_ratings
FROM event_feedback ef
JOIN community_events ce ON ce.id = ef.event_id
GROUP BY ce.organizer_id;

ALTER TABLE event_feedback ENABLE ROW LEVEL SECURITY;

-- Anyone can read feedback
CREATE POLICY "Read event feedback" ON event_feedback
  FOR SELECT USING (true);

-- Only users who RSVPed can insert (and only once, enforced by UNIQUE)
CREATE POLICY "RSVPed attendee can leave feedback" ON event_feedback
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM event_rsvps
      WHERE event_rsvps.event_id = event_feedback.event_id
        AND event_rsvps.user_id  = auth.uid()
    )
  );

-- Author can update/delete their own feedback
CREATE POLICY "Author can update feedback" ON event_feedback
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Author can delete feedback" ON event_feedback
  FOR DELETE USING (auth.uid() = user_id);
