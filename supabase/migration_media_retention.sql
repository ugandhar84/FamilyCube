-- Media retention config — admin-managed per-category cleanup rules
-- Run once: psql $DATABASE_URL < supabase/migration_media_retention.sql

CREATE TABLE IF NOT EXISTS media_retention_config (
  id           serial       PRIMARY KEY,
  category     text         UNIQUE NOT NULL,
  label        text         NOT NULL,
  enabled      boolean      NOT NULL DEFAULT true,
  retain_days  int          NOT NULL DEFAULT 180,
  table_name   text         NOT NULL,           -- DB table holding photo_url
  column_name  text         NOT NULL DEFAULT 'photo_url',
  date_column  text         NOT NULL,           -- column used to age the row
  storage_path_prefix text  NOT NULL,           -- storage path prefix after bucket root, e.g. 'daily/meal'
  description  text,
  updated_at   timestamptz  NOT NULL DEFAULT now()
);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_media_retention_updated_at ON media_retention_config;
CREATE TRIGGER trg_media_retention_updated_at
  BEFORE UPDATE ON media_retention_config
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- Seed default config rows
INSERT INTO media_retention_config
  (category, label, retain_days, table_name, date_column, storage_path_prefix, description)
VALUES
  ('mood',            'Mood scan photos',      180, 'mood_logs',        'created_at', 'mood',           'AI mood-scan captures under pets/<petId>/mood/'),
  ('daily/meal',      'Meal proof photos',     180, 'feeding_logs',     'fed_at',     'daily/meal',     'Food proof shots under pets/<petId>/daily/meal/'),
  ('daily/activity',  'Activity proof photos', 180, 'daily_checklist',  'completed_at','daily/activity','Walk / play proof shots under pets/<petId>/daily/activity/'),
  ('daily/grooming',  'Grooming proof photos', 180, 'grooming_logs',    'done_at',    'daily/grooming', 'Grooming proof shots under pets/<petId>/daily/grooming/')
ON CONFLICT (category) DO NOTHING;

-- Add is_admin flag to profiles if not already present
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- RLS: regular users cannot see or touch this table at all.
-- Only the service role (edge function) and rows where profiles.is_admin = true.
ALTER TABLE media_retention_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read" ON media_retention_config
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

CREATE POLICY "admin write" ON media_retention_config
  FOR ALL USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );
