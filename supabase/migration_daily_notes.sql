-- Daily notes per pet per day
create table if not exists daily_notes (
  id       uuid default uuid_generate_v4() primary key,
  pet_id   uuid references pets(id) on delete cascade not null,
  date     date not null default current_date,
  note     text not null default '',
  updated_at timestamptz default now(),
  unique(pet_id, date)
);

alter table daily_notes enable row level security;

drop policy if exists "Pet members can manage daily_notes" on daily_notes;
create policy "Pet members can manage daily_notes"
  on daily_notes for all using (is_pet_member(pet_id));
