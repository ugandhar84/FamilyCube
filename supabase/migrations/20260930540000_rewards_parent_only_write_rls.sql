-- Real gap found by a direct QA trace of the Store tab's reward-creation/
-- management flows (not previously covered by the earlier "Coins &
-- Rewards" redemption-focused batch) — the seventh instance of the same
-- pattern already fixed six times this session (members, calendar_events,
-- chore_tasks, member_locations, member_location_history, chat_messages):
-- rewards' INSERT/UPDATE/DELETE policies checked only family_id, with no
-- role check at all. Proved live: a kid's own session could create a
-- brand-new reward outright (cost 1, auto-approve, immediately
-- available), and could edit an existing parent-only-eligible reward to
-- drop its cost and add themselves to eligible_member_ids — completely
-- bypassing the "Add Reward" button being parent-only in the app's own UI.
--
-- SELECT stays family-wide, unchanged — every family member needs to be
-- able to see the reward catalog to redeem from it.
drop policy if exists "rewards family insert" on public.rewards;
create policy "rewards family insert" on public.rewards
for insert
with check (
  family_id = current_user_family_id()
  and exists (
    select 1 from public.members
    where members.id = resolve_active_member_id() and members.role = 'parent'
  )
);

drop policy if exists "rewards family update" on public.rewards;
create policy "rewards family update" on public.rewards
for update
using (
  family_id = current_user_family_id()
  and exists (
    select 1 from public.members
    where members.id = resolve_active_member_id() and members.role = 'parent'
  )
)
with check (
  family_id = current_user_family_id()
  and exists (
    select 1 from public.members
    where members.id = resolve_active_member_id() and members.role = 'parent'
  )
);

drop policy if exists "rewards family delete" on public.rewards;
create policy "rewards family delete" on public.rewards
for delete
using (
  family_id = current_user_family_id()
  and exists (
    select 1 from public.members
    where members.id = resolve_active_member_id() and members.role = 'parent'
  )
);
