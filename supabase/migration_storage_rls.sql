-- Fix storage.objects policies for the 'pets' bucket.
-- Old policy only allowed paths where folder[1] = auth.uid() (user avatar uploads).
-- New structure: <petId>/profile|mood|gallery|year-in-review/<file>
--               users/<userId>/avatar|pet-drafts/<file>
-- So we must also allow paths where folder[1] is a petId the user owns or is a member of.
-- Safe to re-run (idempotent via drop-if-exists).

drop policy if exists "Users can upload pet photos"      on storage.objects;
drop policy if exists "Users can update their pet photos" on storage.objects;
drop policy if exists "Users can delete their pet photos" on storage.objects;
drop policy if exists "Pet photos are publicly readable"  on storage.objects;

-- Helper: returns true when the path root is a pet the caller is a member of.
-- Uses a try/catch cast so non-UUID folder names (e.g. "users") don't throw.
create or replace function storage_path_is_pet_member(object_name text)
returns boolean language plpgsql security definer stable as $$
declare
  folder text := split_part(object_name, '/', 1);
  pet_uuid uuid;
begin
  begin
    pet_uuid := folder::uuid;
  exception when others then
    return false;   -- folder is not a UUID (e.g. "users/") — skip
  end;
  return is_pet_member(pet_uuid);
end;
$$;

-- INSERT — allow:
--   • users/<userId>/...  (user avatar, pet-drafts, social post photos)
--   • <petId>/...         (pet profile, mood, gallery, year-in-review)
drop policy if exists "Authenticated users can upload to owned paths" on storage.objects;
create policy "Authenticated users can upload to owned paths"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'pets' and (
    -- user's own prefix: users/<userId>/avatar/ or users/<userId>/pet-drafts/
    split_part(name, '/', 1) = 'users' and split_part(name, '/', 2) = auth.uid()::text
    or
    -- pet-owned prefix: <petId>/profile|mood|gallery|year-in-review/
    storage_path_is_pet_member(name)
  )
);

-- UPDATE
drop policy if exists "Authenticated users can update owned paths" on storage.objects;
create policy "Authenticated users can update owned paths"
on storage.objects for update
to authenticated
using (
  bucket_id = 'pets' and (
    split_part(name, '/', 1) = 'users' and split_part(name, '/', 2) = auth.uid()::text
    or
    storage_path_is_pet_member(name)
  )
);

-- DELETE
drop policy if exists "Authenticated users can delete owned paths" on storage.objects;
create policy "Authenticated users can delete owned paths"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'pets' and (
    split_part(name, '/', 1) = 'users' and split_part(name, '/', 2) = auth.uid()::text
    or
    storage_path_is_pet_member(name)
  )
);

-- Public read (bucket is public so URLs work without auth)
drop policy if exists "Pet photos are publicly readable" on storage.objects;
create policy "Pet photos are publicly readable"
on storage.objects for select
to public
using (bucket_id = 'pets');
