-- Migration: photo privacy — restrict pet gallery and mood photos to family only
-- Problem: the `pets` storage bucket is public = true, meaning any URL is accessible
--          to anyone with the link, bypassing DB-level RLS on pet_photos and mood_logs.
-- Fix:
--   1. Create a private `pet-media` bucket for gallery + mood photos.
--   2. RLS on storage.objects restricts to owner + pet_family members.
--   3. New uploads (via updated app code) go to `pet-media` with signed URLs.
--      Existing public `pets` bucket URLs continue working for legacy data.
--
-- Run once: psql $DATABASE_URL < supabase/migration_photo_privacy.sql

-- ── 0. Add storage_path column to pet_photos (stores path for signed URL refresh) ─
ALTER TABLE pet_photos ADD COLUMN IF NOT EXISTS storage_path text;

-- ── 1. Create private pet-media bucket ───────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pet-media',
  'pet-media',
  false,
  10485760,   -- 10 MB (larger than pets bucket to allow quality photos)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public          = false,
  file_size_limit = EXCLUDED.file_size_limit;

-- ── 2. Storage RLS for pet-media bucket ──────────────────────────────────────
-- SELECT: authenticated users who are the pet owner OR a pet_family member
--         Path format in bucket: <petId>/mood/<ts>.jpg  or  <petId>/gallery/<ts>.jpg
DROP POLICY IF EXISTS "pet-media: family members can read"   ON storage.objects;
DROP POLICY IF EXISTS "pet-media: family members can insert" ON storage.objects;
DROP POLICY IF EXISTS "pet-media: owner can delete"          ON storage.objects;

CREATE POLICY "pet-media: family members can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pet-media' AND (
      -- owner of the pet
      EXISTS (
        SELECT 1 FROM pets p
        WHERE p.id::text = split_part(name, '/', 1)
          AND p.owner_id = auth.uid()
      )
      OR
      -- any pet_family member (caretaker / caregiver / viewer)
      EXISTS (
        SELECT 1 FROM pet_family pf
        WHERE pf.pet_id::text = split_part(name, '/', 1)
          AND pf.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "pet-media: family members can insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pet-media' AND (
      EXISTS (
        SELECT 1 FROM pets p
        WHERE p.id::text = split_part(name, '/', 1)
          AND p.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM pet_family pf
        WHERE pf.pet_id::text = split_part(name, '/', 1)
          AND pf.user_id = auth.uid()
      )
    )
  );

-- DELETE: owner only (same logic as pet_photos table RLS)
CREATE POLICY "pet-media: owner can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pet-media' AND EXISTS (
      SELECT 1 FROM pets p
      WHERE p.id::text = split_part(name, '/', 1)
        AND p.owner_id = auth.uid()
    )
  );
