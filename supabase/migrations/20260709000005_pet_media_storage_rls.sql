-- Ensure pet-media private bucket exists and has correct storage RLS policies.
-- These were defined in migration_photo_privacy.sql but never applied via db push.

-- 1. Create private bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pet-media',
  'pet-media',
  false,
  104857600,  -- 100 MB (covers videos)
  ARRAY['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime','video/mov']
)
ON CONFLICT (id) DO UPDATE SET
  public            = false,
  file_size_limit   = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Drop stale policies (safe — DO NOTHING if missing)
DROP POLICY IF EXISTS "pet-media: family members can read"   ON storage.objects;
DROP POLICY IF EXISTS "pet-media: family members can insert" ON storage.objects;
DROP POLICY IF EXISTS "pet-media: owner can delete"          ON storage.objects;
DROP POLICY IF EXISTS "pet-media: family members can update" ON storage.objects;

-- 3. SELECT — owner or any pet_family member
-- Path format: <petId>/gallery/<ts>.jpg  or  <petId>/mood/<ts>.jpg
CREATE POLICY "pet-media: family members can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
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

-- 4. INSERT — owner or any pet_family member (caretaker/caregiver)
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

-- 5. UPDATE — needed when overwriting existing object (same path)
CREATE POLICY "pet-media: family members can update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
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

-- 6. DELETE — owner only
CREATE POLICY "pet-media: owner can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pet-media' AND EXISTS (
      SELECT 1 FROM pets p
      WHERE p.id::text = split_part(name, '/', 1)
        AND p.owner_id = auth.uid()
    )
  );

-- 7. Ensure pet_photos table has the columns added by migration_photo_privacy.sql
--    and migration_pricing_storage.sql (idempotent)
ALTER TABLE pet_photos
  ADD COLUMN IF NOT EXISTS storage_path    text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint DEFAULT 0;

-- 8. Ensure pet_photos INSERT RLS allows owner + family members
DROP POLICY IF EXISTS "Pet members can insert photos" ON pet_photos;
CREATE POLICY "Pet members can insert photos"
  ON pet_photos FOR INSERT
  WITH CHECK (is_pet_member(pet_id));
