-- ─────────────────────────────────────────────────────────────────────────────
-- pet_notes — manual journal notes, with privacy + audit trail
-- Run this once in your Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists pet_notes (
  id          uuid primary key default gen_random_uuid(),
  pet_id      uuid not null references pets(id) on delete cascade,
  author_id   uuid not null references auth.users(id) on delete cascade,
  content     text not null,
  is_private  boolean not null default false,   -- true = only author can see
  noted_at    timestamptz not null default now(),
  updated_at  timestamptz,
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists pet_notes_pet_noted_idx on pet_notes (pet_id, noted_at desc);

alter table pet_notes enable row level security;

-- ── SELECT ────────────────────────────────────────────────────────────────────
-- Pet family members see all shared notes.
-- Private notes (is_private = true) are visible ONLY to the author.
drop policy if exists "Pet members can view notes" on pet_notes;
create policy "Pet members can view notes" on pet_notes
  for select using (
    -- must be a pet member (owner or family)
    (
      pet_id in (select id from pets where owner_id = auth.uid())
      or
      pet_id in (select pet_id from pet_family where user_id = auth.uid())
    )
    and
    -- and either the note is shared, or you are the author
    (is_private = false or author_id = auth.uid())
  );

-- ── INSERT ────────────────────────────────────────────────────────────────────
-- Any pet member can write a note; they must be the stated author.
drop policy if exists "Pet members can insert notes" on pet_notes;
create policy "Pet members can insert notes" on pet_notes
  for insert with check (
    auth.uid() = author_id
    and (
      pet_id in (select id from pets where owner_id = auth.uid())
      or
      pet_id in (select pet_id from pet_family where user_id = auth.uid())
    )
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────────
-- Only the original author can edit their own note.
drop policy if exists "Only author can update notes" on pet_notes;
create policy "Only author can update notes" on pet_notes
  for update using (auth.uid() = author_id);

-- ── DELETE ────────────────────────────────────────────────────────────────────
-- Author can delete their own note.
-- Pet owner can delete any note (moderation — e.g. inappropriate content).
drop policy if exists "Author or owner can delete notes" on pet_notes;
create policy "Author or owner can delete notes" on pet_notes
  for delete using (
    auth.uid() = author_id
    or pet_id in (select id from pets where owner_id = auth.uid())
  );
