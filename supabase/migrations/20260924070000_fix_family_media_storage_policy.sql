-- Fixes the family-media storage policies from
-- 20260924060000_create_family_media_bucket.sql — those checked
-- `members.auth_user_id = auth.uid()` inline, which fails for PIN-only /
-- shared-device-session members (no auth_user_id of their own), and even
-- for members that do have one, a subquery against `members` from inside a
-- storage.objects policy runs into `members`' own RLS (the same class of
-- bug 20260709000006_pet_media_storage_rls_v2.sql already fixed once for
-- pet-media by switching to a SECURITY DEFINER helper). Confirmed live via
-- device testing: "new row violates row-level security policy" on avatar
-- upload immediately after the bucket-creation migration.
--
-- Use the app's existing public.current_user_family_id() SECURITY DEFINER
-- helper instead — it already correctly resolves the active member for a
-- shared auth session via resolve_active_member_id(), matching every other
-- RLS check in this app.
drop policy if exists "Family members read own family's media" on storage.objects;
create policy "Family members read own family's media"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'family-media'
    and public.current_user_family_id()::text = (storage.foldername(name))[2]
  );

drop policy if exists "Family members upload own family's media" on storage.objects;
create policy "Family members upload own family's media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'family-media'
    and public.current_user_family_id()::text = (storage.foldername(name))[2]
  );
