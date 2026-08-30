-- MemoriesTab's "New Memory" composer is being redesigned around a
-- physical-keepsake metaphor (photo + handwritten note + who-was-there +
-- occasion) instead of a social-post pattern — see the approved mock.
-- `tag` already exists and unused, mapping directly onto "occasion"
-- (Milestone/Everyday/Celebration/Just because). Member tagging ("who was
-- there") has no existing column; adding one rather than overloading `tag`
-- (a single free-text/enum-ish column) with a second, unrelated concept.
alter table public.family_memories
  add column if not exists tagged_member_ids text[] not null default '{}';

comment on column public.family_memories.tagged_member_ids is 'Member IDs tagged as present in this memory ("who was there") — set at compose time via the keepsake composer''s wax-seal picker, optional.';
comment on column public.family_memories.tag is 'Occasion label for the keepsake composer''s "what kind of moment" chips (e.g. milestone/everyday/celebration/just_because) — column pre-existed unused before this feature.';
