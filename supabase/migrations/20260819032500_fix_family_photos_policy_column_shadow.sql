-- Fixes a column-shadowing bug in the previous "Family members read own
-- family's photos" policy: the EXISTS subquery referenced bare `name`,
-- which Postgres resolved to `members.name` (a person's first name, e.g.
-- "Alex") instead of the intended `storage.objects.name` (the storage
-- path) — since both tables have a `name` column and the inner one wins
-- when unqualified. storage.foldername() on a first name never produces a
-- real path segment, so the family-id match always failed and every read
-- 404'd as "Object not found" regardless of actual family membership.
drop policy if exists "Family members read own family's photos" on storage.objects;

create policy "Family members read own family's photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'family-photos'
    and exists (
      select 1 from members
      where members.auth_user_id = auth.uid()
        and members.family_id::text = (storage.foldername(storage.objects.name))[2]
    )
  );
