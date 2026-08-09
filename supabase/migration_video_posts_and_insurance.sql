-- Adds: (1) an admin-configurable app_settings table, used first to gate
-- video posting on/off; (2) video columns on social_posts; (3) a pet_insurance
-- table for uploading/tracking health insurance per pet.
--
-- Run once: psql $DATABASE_URL < supabase/migration_video_posts_and_insurance.sql

-- ── app_settings — small key/value config table for admin-toggleable features ──
CREATE TABLE IF NOT EXISTS app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES profiles(id)
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read settings (the app needs to check flags before
-- rendering UI); only admins can write.
DROP POLICY IF EXISTS app_settings_select ON app_settings;
CREATE POLICY app_settings_select ON app_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS app_settings_admin_write ON app_settings;
CREATE POLICY app_settings_admin_write ON app_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

INSERT INTO app_settings (key, value)
VALUES ('video_posts_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── social_posts — video support ────────────────────────────────────────────
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'photo',
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS video_thumbnail_url text;

ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_media_type_check;
ALTER TABLE social_posts
  ADD CONSTRAINT social_posts_media_type_check CHECK (media_type IN ('photo', 'video'));

-- ── pet_insurance — one active policy per pet at a time, full history kept ──
CREATE TABLE IF NOT EXISTS pet_insurance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id          uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  provider        text NOT NULL,
  policy_number   text,
  coverage_type   text,
  start_date      date,
  end_date        date,
  premium_amount  numeric(10,2),
  file_url        text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pet_insurance_pet_id ON pet_insurance (pet_id);

ALTER TABLE pet_insurance ENABLE ROW LEVEL SECURITY;

-- Same access model as other health tables: owner or family member (any role)
-- can read; owner or caretaker can write.
DROP POLICY IF EXISTS pet_insurance_select ON pet_insurance;
CREATE POLICY pet_insurance_select ON pet_insurance
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pets WHERE pets.id = pet_insurance.pet_id AND pets.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM pet_family WHERE pet_family.pet_id = pet_insurance.pet_id AND pet_family.user_id = auth.uid())
  );

DROP POLICY IF EXISTS pet_insurance_write ON pet_insurance;
CREATE POLICY pet_insurance_write ON pet_insurance
  FOR ALL USING (
    EXISTS (SELECT 1 FROM pets WHERE pets.id = pet_insurance.pet_id AND pets.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM pet_family WHERE pet_family.pet_id = pet_insurance.pet_id AND pet_family.user_id = auth.uid() AND pet_family.role = 'caretaker')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM pets WHERE pets.id = pet_insurance.pet_id AND pets.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM pet_family WHERE pet_family.pet_id = pet_insurance.pet_id AND pet_family.user_id = auth.uid() AND pet_family.role = 'caretaker')
  );
