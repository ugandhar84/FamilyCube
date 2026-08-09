-- Playdate ratings: each parent rates the OTHER pet after a completed playdate
CREATE TABLE IF NOT EXISTS playdate_ratings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playdate_request_id  uuid        NOT NULL REFERENCES playdate_requests(id) ON DELETE CASCADE,
  rater_pet_id         uuid        NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  rated_pet_id         uuid        NOT NULL REFERENCES pets(id) ON DELETE CASCADE,

  -- Per-category scores 1–5
  friendliness         smallint    NOT NULL CHECK (friendliness BETWEEN 1 AND 5),
  energy_match         smallint    NOT NULL CHECK (energy_match BETWEEN 1 AND 5),
  punctuality          smallint    NOT NULL CHECK (punctuality BETWEEN 1 AND 5),
  well_behaved         smallint    NOT NULL CHECK (well_behaved BETWEEN 1 AND 5),
  would_play_again     smallint    NOT NULL CHECK (would_play_again BETWEEN 1 AND 5),

  -- Composite average (stored for fast aggregate queries)
  overall_rating       numeric(3,2) GENERATED ALWAYS AS (
    (friendliness + energy_match + punctuality + well_behaved + would_play_again)::numeric / 5
  ) STORED,

  review               text,
  created_at           timestamptz NOT NULL DEFAULT now(),

  -- One rating per rater per playdate
  UNIQUE (playdate_request_id, rater_pet_id)
);

-- RLS: rater can INSERT their own row; anyone can SELECT
ALTER TABLE playdate_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rater can insert"
  ON playdate_ratings FOR INSERT
  WITH CHECK (
    rater_pet_id IN (SELECT id FROM pets WHERE owner_id = auth.uid())
  );

CREATE POLICY "anyone can read"
  ON playdate_ratings FOR SELECT
  USING (true);

-- Fast aggregate view: avg + count per rated pet
CREATE OR REPLACE VIEW pet_rating_stats AS
SELECT
  rated_pet_id                     AS pet_id,
  ROUND(AVG(overall_rating), 2)    AS avg_rating,
  COUNT(*)::int                    AS total_ratings
FROM playdate_ratings
GROUP BY rated_pet_id;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_playdate_ratings_rated_pet ON playdate_ratings (rated_pet_id);
CREATE INDEX IF NOT EXISTS idx_playdate_ratings_rater_pet ON playdate_ratings (rater_pet_id);
CREATE INDEX IF NOT EXISTS idx_playdate_ratings_request   ON playdate_ratings (playdate_request_id);

-- Aggregate view: avg playdate rating per user (based on their pets' ratings)
CREATE OR REPLACE VIEW user_playdate_rating_stats AS
SELECT
  p.owner_id                       AS user_id,
  ROUND(AVG(pr.overall_rating), 2) AS avg_rating,
  COUNT(pr.id)::int                AS total_ratings
FROM playdate_ratings pr
JOIN pets p ON p.id = pr.rated_pet_id
GROUP BY p.owner_id;
