-- Pet grooming schedule — user-defined interval per pet per type
CREATE TABLE IF NOT EXISTS pet_groom_settings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id        uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  type          text NOT NULL,          -- 'bath' | 'brush' | 'nails' | 'ear_clean' | 'trim' | 'dental'
  interval_days integer NOT NULL CHECK (interval_days > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pet_id, type)
);

-- RLS: owner can read/write their own pets' settings
ALTER TABLE pet_groom_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_read_groom_settings"  ON pet_groom_settings FOR SELECT
  USING (pet_id IN (SELECT id FROM pets WHERE owner_id = auth.uid()));

CREATE POLICY "owner_write_groom_settings" ON pet_groom_settings FOR ALL
  USING  (pet_id IN (SELECT id FROM pets WHERE owner_id = auth.uid()))
  WITH CHECK (pet_id IN (SELECT id FROM pets WHERE owner_id = auth.uid()));

-- Run once:
-- psql $DATABASE_URL < supabase/migration_pet_groom_settings.sql
