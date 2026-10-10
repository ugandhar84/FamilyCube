-- Fix storage RLS for medical-records bucket.
-- The original migration_medical_records.sql policies used
--   WHERE user_id = auth.uid()
-- but members has no user_id column — it has auth_user_id (added by
-- 20260818192700_fix_member_auth_identity.sql). The policies always returned
-- no rows, causing every file upload to fail with 403.
-- Fix: use the already-existing current_user_family_id() SECURITY DEFINER
-- helper, which correctly maps auth.uid() → members.auth_user_id → family_id.

DROP POLICY IF EXISTS medrec_storage_select ON storage.objects;
CREATE POLICY medrec_storage_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] = public.current_user_family_id()::text
  );

DROP POLICY IF EXISTS medrec_storage_insert ON storage.objects;
CREATE POLICY medrec_storage_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] = public.current_user_family_id()::text
  );

DROP POLICY IF EXISTS medrec_storage_delete ON storage.objects;
CREATE POLICY medrec_storage_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] = public.current_user_family_id()::text
  );

-- Also fix the table-level RLS policies for the same reason.
DROP POLICY IF EXISTS medrec_family_select ON public.medical_records;
CREATE POLICY medrec_family_select ON public.medical_records
  FOR SELECT USING (
    family_id = public.current_user_family_id()::text
  );

DROP POLICY IF EXISTS medrec_family_insert ON public.medical_records;
CREATE POLICY medrec_family_insert ON public.medical_records
  FOR INSERT WITH CHECK (
    family_id = public.current_user_family_id()::text
  );

DROP POLICY IF EXISTS medrec_family_update ON public.medical_records;
CREATE POLICY medrec_family_update ON public.medical_records
  FOR UPDATE USING (
    family_id = public.current_user_family_id()::text
  );

DROP POLICY IF EXISTS medrec_family_delete ON public.medical_records;
CREATE POLICY medrec_family_delete ON public.medical_records
  FOR DELETE USING (
    family_id = public.current_user_family_id()::text
  );
