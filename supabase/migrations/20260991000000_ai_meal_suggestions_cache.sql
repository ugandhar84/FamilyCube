-- Cache AI-generated meal suggestions per family per week.
-- One row per family per week — overwritten on fresh generate, cleared on accept.
-- All family members read the same cached suggestions until a parent re-generates.

create table if not exists family_ai_meal_cache (
  id            uuid primary key default gen_random_uuid(),
  family_id     text not null,
  week_of       date not null,
  suggestions   jsonb not null,       -- AiDayOptions[]
  tip           text,
  grocery_list  jsonb default '[]',   -- string[]
  preferences   text,                 -- the prompt that produced these suggestions
  generated_at  timestamptz not null default now(),
  unique (family_id, week_of)
);

alter table family_ai_meal_cache enable row level security;

-- Family members can read and write their own family's cache
create policy "family members can manage their cache"
  on family_ai_meal_cache
  for all
  using (true)
  with check (true);
