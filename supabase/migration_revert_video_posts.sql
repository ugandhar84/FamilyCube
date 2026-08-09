-- Reverts the video-posts feature at the DB level, if migration_video_posts_and_insurance.sql
-- was already applied. Safe to run even if it wasn't (every statement is
-- IF EXISTS / conditional) — this only removes the video-specific pieces.
-- pet_insurance is UNRELATED and untouched — it's kept.
--
-- Run once: psql $DATABASE_URL < supabase/migration_revert_video_posts.sql

-- app_settings table was created only to hold the video_posts_enabled admin
-- flag — drop it entirely along with its RLS policies.
DROP TABLE IF EXISTS app_settings CASCADE;

-- social_posts video columns + their check constraint
ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_media_type_check;
ALTER TABLE social_posts
  DROP COLUMN IF EXISTS media_type,
  DROP COLUMN IF EXISTS video_url,
  DROP COLUMN IF EXISTS video_thumbnail_url;

-- Restore the 'pets' storage bucket to its original photo-only limits, in case
-- migration_pets_bucket_video.sql was run (it widened mime types + size limit).
UPDATE storage.buckets
SET
  file_size_limit = 5242880,  -- 5 MB, original limit
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
WHERE id = 'pets';
