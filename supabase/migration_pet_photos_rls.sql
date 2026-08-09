-- Fix pet_photos: ensure table exists and RLS policies cover INSERT explicitly.
-- Safe to re-run (idempotent).

create table if not exists pet_photos (
  id           uuid default uuid_generate_v4() primary key,
  pet_id       uuid references pets(id) on delete cascade not null,
  url          text not null,
  thumbnail_url text,
  caption      text,
  is_avatar    boolean default false,
  taken_at     date default current_date,
  created_at   timestamptz default now()
);

alter table pet_photos enable row level security;

-- Drop all existing policies so we start clean
drop policy if exists "Pet members can manage photos" on pet_photos;
drop policy if exists "Pet members can read photos"   on pet_photos;
drop policy if exists "Pet members can insert photos" on pet_photos;
drop policy if exists "Pet members can update photos" on pet_photos;
drop policy if exists "Pet members can delete photos" on pet_photos;

-- SELECT / UPDATE / DELETE — only pet members
create policy "Pet members can read photos"
  on pet_photos for select
  using (is_pet_member(pet_id));

-- INSERT — explicit with check so Postgres never falls through to a "no policy" block
create policy "Pet members can insert photos"
  on pet_photos for insert
  with check (is_pet_member(pet_id));

create policy "Pet members can update photos"
  on pet_photos for update
  using  (is_pet_member(pet_id))
  with check (is_pet_member(pet_id));

create policy "Pet members can delete photos"
  on pet_photos for delete
  using (is_pet_member(pet_id));
