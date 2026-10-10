-- Fix medical_records TABLE-level RLS policies.
-- The storage bucket policies were already fixed in
-- supabase/migrations/20261002000000_fix_medical_records_storage_rls.sql.
-- The table policies in migration_medical_records.sql used the same broken
-- pattern (WHERE user_id = auth.uid() on members, a column that doesn't
-- exist) — every SELECT/INSERT/UPDATE/DELETE on the table was blocked for
-- the same reason. Fix mirrors the storage fix: use current_user_family_id().

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
