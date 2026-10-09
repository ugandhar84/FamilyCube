-- family_recipes — dedicated table for the Family Recipe Book
-- Separate from family_meals (which is the weekly planner).
-- A recipe is a reusable template: title, emoji, ingredients, steps, image, tags.
-- "Add to week" copies the recipe into family_meals for a specific day.

create table if not exists public.family_recipes (
  id            text        primary key,
  family_id     text        not null references public.families(id) on delete cascade,
  title         text        not null,
  emoji         text,
  image_url     text,                          -- AI-generated or uploaded photo
  ingredients   text[]      not null default '{}',
  prep_steps    text[]      not null default '{}',
  dietary_tags  text[]      not null default '{}',
  prep_minutes  integer,
  servings      integer,
  ai_refined    boolean     not null default false,
  created_by    text        references public.members(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Index for fast family lookup
create index if not exists family_recipes_family_id_idx on public.family_recipes (family_id, created_at desc);

-- RLS
alter table public.family_recipes enable row level security;

-- Members of the same family can read all recipes
create policy "family members can read recipes"
  on public.family_recipes for select
  using (
    exists (
      select 1 from public.members m
      where m.family_id = family_recipes.family_id
        and m.id = auth.uid()::text
    )
  );

-- Any member can insert a recipe for their family
create policy "family members can add recipes"
  on public.family_recipes for insert
  with check (
    exists (
      select 1 from public.members m
      where m.family_id = family_recipes.family_id
        and m.id = auth.uid()::text
    )
  );

-- Creator or parent can update / delete
create policy "creator or parent can update recipes"
  on public.family_recipes for update
  using (
    created_by = auth.uid()::text
    or exists (
      select 1 from public.members m
      where m.family_id = family_recipes.family_id
        and m.id = auth.uid()::text
        and m.role = 'parent'
    )
  );

create policy "creator or parent can delete recipes"
  on public.family_recipes for delete
  using (
    created_by = auth.uid()::text
    or exists (
      select 1 from public.members m
      where m.family_id = family_recipes.family_id
        and m.id = auth.uid()::text
        and m.role = 'parent'
    )
  );

-- Storage bucket for recipe images (public read, authenticated write)
-- Run once via Supabase dashboard or here as a no-op if already exists:
-- insert into storage.buckets (id, name, public) values ('recipe-images', 'recipe-images', true)
-- on conflict (id) do nothing;
