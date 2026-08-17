-- RESPONSIBILITY ENGINE — errand_bundles (spec Phase 6: "multiple errands
-- should be bundled when practical"). This was in the original spec's table
-- list but skipped in Phase 1 as lower-priority than the assignment engine
-- itself — added now as its own small, self-contained migration.
--
-- Groups multiple errands rows into one trip (e.g. Kroger + pharmacy pickup
-- on the way home from soccer), with an optional reference_event_id linking
-- it to the calendar event that makes the bundle worth doing (the "already
-- driving that way" context from the spec's soccer+grocery example).
--
-- Same conventions as the rest of Phase 1: id text default gen_random_uuid,
-- family_id text (no FK, RLS-scoped only, matching chore_tasks/calendar_events/
-- errands), RLS enabled at creation via the standard members-based pattern.

create table if not exists public.errand_bundles (
  id                            text primary key default gen_random_uuid()::text,
  family_id                     text not null,
  title                         text not null,
  assigned_member_id            text references public.members(id) on delete set null,
  reference_event_id            text references public.calendar_events(id) on delete set null,
  status                        text not null default 'planned'
    check (status in ('planned','in_progress','completed','cancelled')),
  total_distance_meters         numeric,
  total_duration_seconds        integer,
  incremental_duration_seconds  integer,
  created_at                    timestamptz not null default now()
);

create table if not exists public.errand_bundle_items (
  bundle_id   text not null references public.errand_bundles(id) on delete cascade,
  errand_id   text not null references public.errands(id) on delete cascade,
  stop_order  integer not null,
  primary key (bundle_id, errand_id)
);

create index if not exists idx_errand_bundles_family on public.errand_bundles(family_id);
create index if not exists idx_errand_bundle_items_errand on public.errand_bundle_items(errand_id);

alter table public.errand_bundles enable row level security;
alter table public.errand_bundle_items enable row level security;

create policy "errand_bundles_select" on public.errand_bundles for select
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text));
create policy "errand_bundles_insert" on public.errand_bundles for insert
  with check (family_id in (select family_id::text from public.members where id = auth.uid()::text));
create policy "errand_bundles_update" on public.errand_bundles for update
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text))
  with check (family_id in (select family_id::text from public.members where id = auth.uid()::text));
create policy "errand_bundles_delete" on public.errand_bundles for delete
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text));

-- errand_bundle_items has no family_id of its own — scoped via bundle_id.
create policy "errand_bundle_items_select" on public.errand_bundle_items for select
  using (bundle_id in (
    select id from public.errand_bundles
    where family_id in (select family_id::text from public.members where id = auth.uid()::text)
  ));
create policy "errand_bundle_items_insert" on public.errand_bundle_items for insert
  with check (bundle_id in (
    select id from public.errand_bundles
    where family_id in (select family_id::text from public.members where id = auth.uid()::text)
  ));
create policy "errand_bundle_items_delete" on public.errand_bundle_items for delete
  using (bundle_id in (
    select id from public.errand_bundles
    where family_id in (select family_id::text from public.members where id = auth.uid()::text)
  ));
