-- Sticky notes anyone can write and share with chosen family members; they appear on the recipients' kiosk Home.
-- recipient_ids empty = shared with everyone. The author always sees their own note.
create table if not exists family_sticky_notes (
  id          uuid primary key default gen_random_uuid(),
  family_id   text not null,
  author_id   text not null,
  body        text not null check (char_length(body) between 1 and 100),
  color       text not null default 'amber',
  recipient_ids text[] not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists family_sticky_notes_family_idx on family_sticky_notes (family_id, created_at desc);

alter table family_sticky_notes enable row level security;

create policy "family members can read sticky notes" on family_sticky_notes for select using (true);
create policy "family members can write sticky notes" on family_sticky_notes for insert with check (true);
create policy "family members can delete sticky notes" on family_sticky_notes for delete using (true);

alter publication supabase_realtime add table family_sticky_notes;
