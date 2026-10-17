-- Recording a medical visit failed with "new row violates row-level security policy": the medical-audio bucket had no
-- storage policies at all (only medical-records did). Same family-folder rule as medical-records: files live under
-- "<familyId>/<memberId>/…" and only members of that family may add, read or remove them.
insert into storage.buckets (id, name, public) values ('medical-audio', 'medical-audio', false) on conflict (id) do nothing;

drop policy if exists "medaudio_storage_select" on storage.objects;
drop policy if exists "medaudio_storage_insert" on storage.objects;
drop policy if exists "medaudio_storage_delete" on storage.objects;

create policy "medaudio_storage_select" on storage.objects for select
  using (bucket_id = 'medical-audio' and (storage.foldername(name))[1] = (current_user_family_id())::text);
create policy "medaudio_storage_insert" on storage.objects for insert
  with check (bucket_id = 'medical-audio' and (storage.foldername(name))[1] = (current_user_family_id())::text);
create policy "medaudio_storage_delete" on storage.objects for delete
  using (bucket_id = 'medical-audio' and (storage.foldername(name))[1] = (current_user_family_id())::text);
