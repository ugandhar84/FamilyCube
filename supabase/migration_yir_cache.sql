-- YIR cache: store AI-generated half-year reviews per pet per period
-- period = '2026_H1' or '2026_H2' — two generations per year max
-- Run once: psql $DATABASE_URL < supabase/migration_yir_cache.sql

-- Drop old version if it exists (year column → period column)
DROP TABLE IF EXISTS yir_cache;

CREATE TABLE IF NOT EXISTS yir_cache (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id     uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  period     text NOT NULL,   -- e.g. '2026_H1', '2026_H2'
  curation   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pet_id, period)
);

ALTER TABLE yir_cache ENABLE ROW LEVEL SECURITY;

-- Owner can read/write their pet's YIR cache
CREATE POLICY "yir_cache_owner" ON yir_cache
  USING (pet_id IN (SELECT id FROM pets WHERE owner_id = auth.uid()))
  WITH CHECK (pet_id IN (SELECT id FROM pets WHERE owner_id = auth.uid()));
