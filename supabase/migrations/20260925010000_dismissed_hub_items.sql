-- DB-backed dismiss state for the Kid Hub's "Needs You" list — replaces
-- three separate useState<Set<string>> + AsyncStorage pairs in KidView.tsx
-- (dismissedReplies/dismissedActions/dismissedRideIds), which were
-- device-local only: reinstalling the app or switching devices lost every
-- dismissal, and (per the Kid Hub redesign) confirmations/pickup/driver
-- banners are now temporary, dismissible rows that must survive and sync
-- across devices, not just this session's AsyncStorage.
--
-- member_id is text, not uuid — matches public.members.id, which is a
-- text primary key (see fix_member_auth_identity.sql's
-- `id = auth.uid()::text` comparisons and familyStore.ts's fromRow/toRow),
-- not a uuid column.
create table if not exists public.dismissed_hub_items (
  id uuid primary key default gen_random_uuid(),
  member_id text not null references public.members(id) on delete cascade,
  -- Matches the existing dismissible item's own id today (confirmedRide.id,
  -- `awaiting-${id}`, `ride-${id}`, `pending-${id}`, `quest-${id}`,
  -- `quest-approved-${id}`, `cheer-${questId}-${memberId}`, or a
  -- kid_requests reply id) — same string keys KidView already dismisses
  -- into its three local Sets, just persisted now.
  item_id text not null,
  dismissed_at timestamptz not null default now(),
  unique (member_id, item_id)
);

create index if not exists idx_dismissed_hub_items_member
  on public.dismissed_hub_items (member_id);

alter table public.dismissed_hub_items enable row level security;

-- Same resolve-the-verified-active-member pattern every other member-scoped
-- table in this app already relies on (see
-- 20260903170000_add_active_member_header_support.sql) — never
-- `member_id = auth.uid()`, which fix_member_auth_identity.sql already
-- documented as broken for PIN-only/shared-session members (multiple kids
-- on one family tablet share one auth.uid(); only the verified
-- x-active-member-id header actually identifies which kid is dismissing).
drop policy if exists "dismissed_hub_items_select" on public.dismissed_hub_items;
drop policy if exists "dismissed_hub_items_insert" on public.dismissed_hub_items;
drop policy if exists "dismissed_hub_items_delete" on public.dismissed_hub_items;

create policy "dismissed_hub_items_select"
  on public.dismissed_hub_items for select
  using (member_id = public.resolve_active_member_id());

create policy "dismissed_hub_items_insert"
  on public.dismissed_hub_items for insert
  with check (member_id = public.resolve_active_member_id());

-- No update policy — a dismissal is write-once (insert or no-op via
-- ON CONFLICT DO NOTHING), never edited in place.
create policy "dismissed_hub_items_delete"
  on public.dismissed_hub_items for delete
  using (member_id = public.resolve_active_member_id());

comment on table public.dismissed_hub_items is
  'Per-member dismiss state for temporary Kid Hub "Needs You" rows (ride/driver/quest/reply banners), replacing the old AsyncStorage-only dismissedReplies/dismissedActions/dismissedRideIds in KidView.tsx. Known follow-up, not implemented here: these rows have no automatic pruning — a dismissed ride banner from months ago stays forever. Low volume per member (a handful of dismissals a day, capped by how many banner-worthy events/quests exist) makes this low priority; a simple `delete where dismissed_at < now() - interval ''90 days''` cron/edge-function sweep is the natural follow-up if row count ever becomes a real concern.';
