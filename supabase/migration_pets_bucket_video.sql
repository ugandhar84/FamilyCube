-- The 'pets' storage bucket (migration_pet_photos.sql) was created photo-only:
-- allowed_mime_types = images only, file_size_limit = 5 MB. Social video posts
-- upload into this same bucket (see uploadSocialVideo in lib/supabase.ts) and
-- fail outright — mime type rejected, and even a mime-allowed video would
-- usually exceed 5 MB. Widen both.
--
-- 100 MB matches the client-side gate (MAX_VIDEO_BYTES in app/(tabs)/social.tsx,
-- enforced after compression, before upload even starts) — this is a backstop
-- for anything that slips past the client check, not the primary size control
-- (compression + the client check do the real work). Keep both in sync if
-- either changes.
--
-- Run once: psql $DATABASE_URL < supabase/migration_pets_bucket_video.sql

UPDATE storage.buckets
SET
  file_size_limit = 104857600,  -- 100 MB
  allowed_mime_types = (
    SELECT array_agg(DISTINCT t) FROM unnest(
      COALESCE(allowed_mime_types, ARRAY[]::text[]) ||
      ARRAY['video/mp4', 'video/quicktime']::text[]
    ) AS t
  )
WHERE id = 'pets';
