-- Adds a retention category for social post media (photos & videos), and a
-- video_column_name field since social_posts (unlike the other 4 categories)
-- can have media in either photo_url OR video_url depending on the post.
--
-- Run once: psql $DATABASE_URL < supabase/migration_social_media_retention.sql

ALTER TABLE media_retention_config
  ADD COLUMN IF NOT EXISTS video_column_name text;

INSERT INTO media_retention_config
  (category, label, enabled, retain_days, table_name, column_name, video_column_name, date_column, storage_path_prefix, description)
VALUES
  ('social_post', 'Post media (photos & videos)', false, 365,
   'social_posts', 'photo_url', 'video_url', 'created_at', 'users',
   'Social feed post photos/videos under pets/users/<userId>/social/ — the post itself (caption, likes, comments) is kept, only the media is removed.')
ON CONFLICT (category) DO NOTHING;

-- The original RLS only let admins read this table — but the retention
-- window itself (e.g. "365 days") is shown to regular users in Settings for
-- transparency, and isn't sensitive. Widen SELECT to any signed-in user;
-- writes (enable/disable, change days) stay admin-only via the existing
-- "admin write" policy.
DROP POLICY IF EXISTS "admin read" ON media_retention_config;
CREATE POLICY "authenticated read" ON media_retention_config
  FOR SELECT USING (auth.uid() IS NOT NULL);
