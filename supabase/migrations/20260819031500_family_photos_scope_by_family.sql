-- Tighten family-photos read access from "any authenticated user" to "any
-- authenticated user who belongs to the SAME family as the object's path"
-- (path shape: <uploader_auth_uid>/<family_id>/memories/<file>.jpg — the
-- family_id is the second path segment). Previously any logged-in user
-- across the whole app could read a family-photos object if they somehow
-- obtained its signed URL; this scopes it to actual family membership.
drop policy if exists "Auth read family photos" on storage.objects;

create policy "Family members read own family's photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'family-photos'
    and exists (
      select 1 from members
      where members.auth_user_id = auth.uid()
        and members.family_id::text = (storage.foldername(name))[2]
    )
  );
