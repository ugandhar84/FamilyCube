-- Fix: medical-records storage bucket RLS was still written against the
-- OLD auth model (`members.user_id = auth.uid()`, from the original
-- supabase/migration_medical_records.sql) and was never updated when
-- 20260818194500_repoint_all_rls_to_auth_user_id.sql moved every other
-- table's RLS to the real current model (current_user_family_id(), which
-- resolves via resolve_active_member_id()/active_member_id header, not a
-- raw auth.uid() comparison this app doesn't actually populate that column
-- with in the same way). Every storage upload to 'medical-records' was
-- failing RLS ("new row violates row-level security policy", 403) and
-- being silently swallowed by the client (features/vault/tabs/RecordsTab.
-- tsx's addRecord ignored the upload error and inserted the DB row anyway
-- with file_path: null) — live-reported: a real camera-captured, redacted
-- photo produced a saved record with "No file is attached to this record."
-- Confirmed via added debug logging: the storage upload itself threw
-- StorageApiError / row-level security policy / 403 every time.
--
-- (storage.foldername(name))[1] is still the family_id path segment
-- (features/vault/tabs/RecordsTab.tsx writes `${familyId}/${memberId}/...`)
-- — only the WHERE clause resolving "which family can I act as" needed to
-- change, matching current_user_family_id()'s own definition exactly.

drop policy if exists medrec_storage_select on storage.objects;
create policy medrec_storage_select on storage.objects
  for select using (
    bucket_id = 'medical-records'
    and (storage.foldername(name))[1] = public.current_user_family_id()::text
  );

drop policy if exists medrec_storage_insert on storage.objects;
create policy medrec_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'medical-records'
    and (storage.foldername(name))[1] = public.current_user_family_id()::text
  );

drop policy if exists medrec_storage_delete on storage.objects;
create policy medrec_storage_delete on storage.objects
  for delete using (
    bucket_id = 'medical-records'
    and (storage.foldername(name))[1] = public.current_user_family_id()::text
  );
