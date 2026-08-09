CREATE TABLE IF NOT EXISTS daily_scan_counts (
  pet_id  uuid  NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  date    date  NOT NULL,
  count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (pet_id, date)
);

-- Only the pet owner can read/write their own rows
ALTER TABLE daily_scan_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner can manage scan counts" ON daily_scan_counts;
DROP POLICY IF EXISTS "pet members can manage scan counts" ON daily_scan_counts;
CREATE POLICY "pet members can manage scan counts"
  ON daily_scan_counts
  FOR ALL
  USING (is_pet_member(pet_id));

ALTER TABLE daily_scan_counts
  ADD COLUMN IF NOT EXISTS ai_attempts  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slot_counter integer NOT NULL DEFAULT 0;

-- Increments saved-scan count (called only on successful save)
CREATE OR REPLACE FUNCTION increment_scan_count(p_pet_id uuid, p_date date)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO daily_scan_counts (pet_id, date, count, ai_attempts, slot_counter)
  VALUES (p_pet_id, p_date, 1, 0, 0)
  ON CONFLICT (pet_id, date)
  DO UPDATE SET count = daily_scan_counts.count + 1;
$$;

-- Increments slot_counter at the START of every scan attempt; returns new slot value.
-- Even slot → AI turn, odd slot → gimmick turn.
CREATE OR REPLACE FUNCTION start_scan_slot(p_pet_id uuid, p_date date)
RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO daily_scan_counts (pet_id, date, count, ai_attempts, slot_counter)
  VALUES (p_pet_id, p_date, 0, 0, 1)
  ON CONFLICT (pet_id, date)
  DO UPDATE SET slot_counter = daily_scan_counts.slot_counter + 1
  RETURNING slot_counter;
$$;

-- Increments ai_attempts for analytics/cost tracking (called on every Gemini call)
CREATE OR REPLACE FUNCTION record_ai_attempt(p_pet_id uuid, p_date date)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO daily_scan_counts (pet_id, date, count, ai_attempts, slot_counter)
  VALUES (p_pet_id, p_date, 0, 1, 0)
  ON CONFLICT (pet_id, date)
  DO UPDATE SET ai_attempts = daily_scan_counts.ai_attempts + 1;
$$;
