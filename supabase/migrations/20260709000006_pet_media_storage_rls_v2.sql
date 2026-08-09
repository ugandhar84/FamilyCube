-- Replace the fragile split_part-based storage policies with a SECURITY DEFINER
-- helper that bypasses pets/pet_family RLS — same pattern as is_pet_member.

-- 1. Helper: can this user access a pet-media path?
--    Path format: <petId>/gallery/<ts>.jpg  or  <petId>/mood/<ts>.jpg
CREATE OR REPLACE FUNCTION pet_media_is_member(object_name text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM pets
    WHERE id::text = split_part(object_name, '/', 1)
      AND owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM pet_family
    WHERE pet_id::text = split_part(object_name, '/', 1)
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION pet_media_is_owner(object_name text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM pets
    WHERE id::text = split_part(object_name, '/', 1)
      AND owner_id = auth.uid()
  );
$$;

-- 2. Drop old policies (all names used historically)
DROP POLICY IF EXISTS "pet-media: family members can read"   ON storage.objects;
DROP POLICY IF EXISTS "pet-media: family members can insert" ON storage.objects;
DROP POLICY IF EXISTS "pet-media: family members can update" ON storage.objects;
DROP POLICY IF EXISTS "pet-media: owner can delete"          ON storage.objects;

-- 3. Recreate with SECURITY DEFINER helpers — no RLS issues inside the check
CREATE POLICY "pet-media: family members can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pet-media' AND pet_media_is_member(name));

CREATE POLICY "pet-media: family members can insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pet-media' AND pet_media_is_member(name));

CREATE POLICY "pet-media: family members can update"
  ON storage.objects FOR UPDATE TO authenticated
  USING  (bucket_id = 'pet-media' AND pet_media_is_member(name))
  WITH CHECK (bucket_id = 'pet-media' AND pet_media_is_member(name));

CREATE POLICY "pet-media: owner can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pet-media' AND pet_media_is_owner(name));
