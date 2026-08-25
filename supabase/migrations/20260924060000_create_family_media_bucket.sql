-- Creates the 'family-media' storage bucket referenced by four upload call
-- sites (uploadMemberAvatar in lib/supabase.ts, chore/receipt proof uploads
-- in QuestsScreen.tsx/ReceiptScanSheet.tsx/SeniorView.tsx) that all assumed
-- it already existed — it never did, so every one of those uploads was
-- silently failing with "Bucket not found" until member-avatar upload
-- surfaced the error to a user for the first time.
--
-- Public (uploadMemberAvatar calls getPublicUrl, not createSignedUrl), path
-- shape everywhere is chore-proofs/<familyId>/... — RLS below scopes both
-- read and write to members of that same family, mirroring the pattern
-- family-photos already uses (20260819031500_family_photos_scope_by_family.sql).
insert into storage.buckets (id, name, public)
values ('family-media', 'family-media', true)
on conflict (id) do nothing;

drop policy if exists "Family members read own family's media" on storage.objects;
create policy "Family members read own family's media"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'family-media'
    and exists (
      select 1 from members
      where members.auth_user_id = auth.uid()
        and members.family_id::text = (storage.foldername(name))[2]
    )
  );

drop policy if exists "Family members upload own family's media" on storage.objects;
create policy "Family members upload own family's media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'family-media'
    and exists (
      select 1 from members
      where members.auth_user_id = auth.uid()
        and members.family_id::text = (storage.foldername(name))[2]
    )
  );
