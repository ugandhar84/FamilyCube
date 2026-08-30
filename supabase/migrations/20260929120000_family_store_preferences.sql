-- Grocery/supplies items can be tagged with a "move to store" preference
-- (GroceryItem.storePreference), but the picker only ever offered
-- DEFAULT_GROCERY_STORES (a static hardcoded list) plus whatever stores
-- happened to already appear on the current list or past runs — no way to
-- add a genuinely NEW store name that then sticks around for next time.
-- Live-requested: a real bottom-sheet picker with search + "add new store,"
-- saved for future suggestion. This table is that persisted family-level
-- store list — distinct from pastStores (client-derived from run history)
-- and DEFAULT_GROCERY_STORES (static app-wide defaults), neither of which
-- is a real per-family saved preference a user actively curates.
create table if not exists public.family_store_preferences (
  id          uuid        primary key default gen_random_uuid(),
  family_id   text        not null,
  name        text        not null,
  created_by  text        references public.members(id),
  created_at  timestamptz not null default now(),
  unique (family_id, name)
);

create index if not exists idx_family_store_prefs_family on public.family_store_preferences(family_id);

alter table public.family_store_preferences enable row level security;

create policy "family_store_preferences_select" on public.family_store_preferences for select
  using (family_id = public.current_user_family_id()::text);
create policy "family_store_preferences_insert" on public.family_store_preferences for insert
  with check (family_id = public.current_user_family_id()::text);
create policy "family_store_preferences_delete" on public.family_store_preferences for delete
  using (family_id = public.current_user_family_id()::text);

comment on table public.family_store_preferences is 'Family-curated list of store names for the grocery "move to store" picker — grows as members add custom stores, suggested first in future pickers.';
