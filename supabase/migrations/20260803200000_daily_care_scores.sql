-- Daily care progress scores — one row per pet per day.
-- score is 0–100 (integer), upserted from the client after any care action.
-- Enables consistent historical reports and avoids recomputing on every load.

CREATE TABLE IF NOT EXISTS daily_care_scores (
  pet_id      uuid        NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  date        date        NOT NULL,
  score       smallint    NOT NULL CHECK (score BETWEEN 0 AND 100),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pet_id, date)
);

-- Owners and family members with care roles can read/write their own pets' scores.
ALTER TABLE daily_care_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_care_scores: owner read"
  ON daily_care_scores FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM pets WHERE id = daily_care_scores.pet_id AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM pet_family WHERE pet_id = daily_care_scores.pet_id AND user_id = auth.uid())
  );

CREATE POLICY "daily_care_scores: care roles write"
  ON daily_care_scores FOR ALL
  USING (can_log_daily_care(pet_id))
  WITH CHECK (can_log_daily_care(pet_id));

-- Fast range queries for history / reports
CREATE INDEX IF NOT EXISTS daily_care_scores_pet_date_idx
  ON daily_care_scores (pet_id, date DESC);
