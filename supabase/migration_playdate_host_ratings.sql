-- Playdate host ratings: each pet parent rates the OTHER pet PARENT after a playdate
-- Separate from playdate_ratings (which rates the PET's behavior)
-- These aggregate onto the user profile as a "host reputation" score
--
-- Run once: psql $DATABASE_URL < supabase/migration_playdate_host_ratings.sql

CREATE TABLE IF NOT EXISTS playdate_host_ratings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playdate_request_id  uuid        NOT NULL REFERENCES playdate_requests(id) ON DELETE CASCADE,
  rater_user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rated_user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Human-focused categories 1–5
  communication        smallint    NOT NULL CHECK (communication BETWEEN 1 AND 5),    -- replied promptly, clear
  punctuality          smallint    NOT NULL CHECK (punctuality   BETWEEN 1 AND 5),    -- showed up on time
  friendliness         smallint    NOT NULL CHECK (friendliness  BETWEEN 1 AND 5),    -- warm and welcoming
  would_meet_again     smallint    NOT NULL CHECK (would_meet_again BETWEEN 1 AND 5), -- overall vibe

  overall_rating       numeric(3,2) GENERATED ALWAYS AS (
    (communication + punctuality + friendliness + would_meet_again)::numeric / 4
  ) STORED,

  review               text CHECK (char_length(review) <= 300),
  created_at           timestamptz NOT NULL DEFAULT now(),

  UNIQUE (playdate_request_id, rater_user_id)
);

CREATE INDEX IF NOT EXISTS idx_phr_rated_user ON playdate_host_ratings(rated_user_id);
CREATE INDEX IF NOT EXISTS idx_phr_request    ON playdate_host_ratings(playdate_request_id);

ALTER TABLE playdate_host_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rater can insert host rating" ON playdate_host_ratings
  FOR INSERT WITH CHECK (auth.uid() = rater_user_id);

CREATE POLICY "anyone can read host ratings" ON playdate_host_ratings
  FOR SELECT USING (true);

CREATE POLICY "rater can update own host rating" ON playdate_host_ratings
  FOR UPDATE USING (auth.uid() = rater_user_id);

-- Aggregate view: avg host rating per user
CREATE OR REPLACE VIEW user_host_rating_stats AS
SELECT
  rated_user_id                    AS user_id,
  ROUND(AVG(overall_rating), 2)    AS avg_rating,
  COUNT(id)::int                   AS total_ratings
FROM playdate_host_ratings
GROUP BY rated_user_id;
