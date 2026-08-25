-- store_locations — one pinned lat/lng per (family, store name), used by the
-- store_proximity_reminders feature-flagged geofence reminder: "you're near
-- Walmart and have 3 pending items there." Keyed by store NAME rather than
-- a grocery_items row since many items share one store and the pin is a
-- property of the store itself, not any single item.
--
-- family_id is a real uuid FK to families.id (confirmed via the PostgREST
-- schema — members.family_id is uuid -> families.id; grocery_runs/
-- grocery_items store family_id as bare text without an FK, but this is a
-- new table with no legacy shape to match, so it gets the real FK).
-- RLS follows public.current_user_family_id() per 20260818192700/
-- 20260818194500 — the app's real, working scoping pattern (members.id =
-- auth.uid() never held for anyone; auth_user_id does).
create table if not exists public.store_locations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  store text not null,
  latitude double precision not null,
  longitude double precision not null,
  pinned_by text references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (family_id, store)
);

create index if not exists idx_store_locations_family on public.store_locations (family_id);

alter table public.store_locations enable row level security;

create policy "store_locations_select" on public.store_locations for select
  using (family_id = public.current_user_family_id());

create policy "store_locations_insert" on public.store_locations for insert
  with check (family_id = public.current_user_family_id());

create policy "store_locations_update" on public.store_locations for update
  using (family_id = public.current_user_family_id())
  with check (family_id = public.current_user_family_id());

create policy "store_locations_delete" on public.store_locations for delete
  using (family_id = public.current_user_family_id());
