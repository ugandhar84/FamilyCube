-- family-photos had a SELECT policy but NO write policy at all — confirmed
-- via lib/supabase.ts's uploadFamilyMemoryPhoto(), which calls
-- supabase.storage.from('family-photos').upload(...) directly through the
-- regular authenticated client (not a service-role edge function), path
-- shape `${session.user.id}/${familyId}/memories/...`. With RLS enabled
-- and zero INSERT policy, every Memories photo upload has been failing
-- silently (deny-all) since this bucket was created.
--
-- Uses current_user_family_id() (not the read policy's older
-- auth_user_id = auth.uid() pattern) so a PIN-only member uploading a
-- memory photo is correctly scoped too, same fix already applied to every
-- other table using the legacy pattern this session.
DROP POLICY IF EXISTS "Family members upload own family's photos" ON storage.objects;
CREATE POLICY "Family members upload own family's photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'family-photos'
    AND public.current_user_family_id()::text = (storage.foldername(name))[2]
  );
