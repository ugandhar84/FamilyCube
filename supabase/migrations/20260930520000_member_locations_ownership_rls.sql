-- Real, serious gap found by a direct QA trace of the GPS/FindFam tab
-- (untraced until now this session): member_locations and
-- member_location_history had INSERT/UPDATE policies scoped only to
-- family_id, with no per-member ownership check at all — the same class
-- of gap already found and fixed this session on members/calendar_events/
-- chore_tasks. Any family member's own authenticated session, kid
-- included, could write ANY other member's location row directly: fake
-- their coordinates, silently flip share_location_enabled to false
-- (defeating their own opt-out toggle from someone else's side), or blank
-- their address text. The app's own client code only ever calls these
-- writes for the currently-active member on that device (confirmed by
-- reading every call site in lib/locationTracking.ts and
-- features/vault/tabs/GpsTab.tsx), so this was invisible through normal
-- use, but nothing in the database enforced it.
--
-- SELECT stays family-wide, unchanged — that's the correct, intended
-- sharing model for a family-location feature (a kid seeing a parent's
-- live location, and vice versa, is the whole point of the feature, not
-- a leak).
drop policy if exists "member_locations_insert" on public.member_locations;
create policy "member_locations_insert" on public.member_locations
for insert
with check (
  family_id = (current_user_family_id())::text
  and member_id = resolve_active_member_id()
);

drop policy if exists "member_locations_update" on public.member_locations;
create policy "member_locations_update" on public.member_locations
for update
using (
  family_id = (current_user_family_id())::text
  and member_id = resolve_active_member_id()
)
with check (
  family_id = (current_user_family_id())::text
  and member_id = resolve_active_member_id()
);

drop policy if exists "member_location_history_insert" on public.member_location_history;
create policy "member_location_history_insert" on public.member_location_history
for insert
with check (
  family_id = (current_user_family_id())::text
  and member_id = resolve_active_member_id()
);
