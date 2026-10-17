-- QA finding: the medical file buckets were readable by anyone in the family (a kid could list and download a parent's
-- files). Files live under "<familyId>/<memberId>/…". Parents keep access to the whole family; everyone else only to
-- their own folder. Same rule as the medical_records table.
do $$
declare b text;
begin
  foreach b in array array['medical-records', 'medical-audio'] loop
    execute format('drop policy if exists %I on storage.objects', 'medrec_storage_select');
    execute format('drop policy if exists %I on storage.objects', 'medrec_storage_insert');
    execute format('drop policy if exists %I on storage.objects', 'medrec_storage_delete');
    execute format('drop policy if exists %I on storage.objects', 'medaudio_storage_select');
    execute format('drop policy if exists %I on storage.objects', 'medaudio_storage_insert');
    execute format('drop policy if exists %I on storage.objects', 'medaudio_storage_delete');
  end loop;
end $$;

create policy "medfiles_storage_select" on storage.objects for select
  using (bucket_id in ('medical-records', 'medical-audio')
         and (storage.foldername(name))[1] = (current_user_family_id())::text
         and (public.active_member_sees_whole_family() or (storage.foldername(name))[2] = public.resolve_active_member_id()));
create policy "medfiles_storage_insert" on storage.objects for insert
  with check (bucket_id in ('medical-records', 'medical-audio')
         and (storage.foldername(name))[1] = (current_user_family_id())::text
         and (public.active_member_sees_whole_family() or (storage.foldername(name))[2] = public.resolve_active_member_id()));
create policy "medfiles_storage_delete" on storage.objects for delete
  using (bucket_id in ('medical-records', 'medical-audio')
         and (storage.foldername(name))[1] = (current_user_family_id())::text
         and (public.active_member_sees_whole_family() or (storage.foldername(name))[2] = public.resolve_active_member_id()));
