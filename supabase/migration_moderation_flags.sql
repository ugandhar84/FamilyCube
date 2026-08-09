-- Content moderation columns on social_posts
-- Run once: psql $DATABASE_URL < supabase/migration_moderation_flags.sql

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS is_flagged  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS moderated   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_reason text;

CREATE INDEX IF NOT EXISTS idx_social_posts_flagged
  ON social_posts (is_flagged, moderated) WHERE is_flagged = true;
