-- Real gap found by a direct QA trace of the Store tab's settings flow:
-- the families table has NO UPDATE policy at all. With RLS enabled and
-- zero matching UPDATE policies, Postgres defaults to deny — meaning even
-- a family's own legitimate parent could never actually persist a
-- household-settings change (currency ratio, spend/save/give allocation
-- percentages, teen reward co-sign threshold, etc). Proved live: even the
-- family's own parent session's UPDATE affected 0 rows.
--
-- choreStore.updateHouseholdSettings applies the change to local state
-- optimistically and only console.warns on the resulting silent DB
-- failure — the settings screen looks like it saved, then reverts on the
-- next sync or app restart, with no error ever surfacing to the parent.
--
-- Fix: add a real UPDATE policy, parent-role-gated (household settings
-- are exactly the kind of thing this session has consistently treated as
-- parent-only elsewhere — chores, reward creation, member role/PIN).
create policy "families parent update" on public.families
for update
using (
  id in (select members.family_id from public.members where members.id = resolve_active_member_id())
  and exists (
    select 1 from public.members
    where members.id = resolve_active_member_id() and members.role = 'parent'
  )
)
with check (
  id in (select members.family_id from public.members where members.id = resolve_active_member_id())
  and exists (
    select 1 from public.members
    where members.id = resolve_active_member_id() and members.role = 'parent'
  )
);
