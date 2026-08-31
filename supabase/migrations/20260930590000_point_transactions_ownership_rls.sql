-- Real gap found by a deep exploratory QA trace of Chores — the tenth
-- instance of the "write-side RLS checks only family_id, no per-actor
-- ownership check" pattern found this session (members, calendar_events,
-- chore_tasks, member_locations, member_location_history, chat_messages/
-- reactions, rewards, families, members INSERT). point_transactions'
-- single ALL-commands policy let any family member write a transaction
-- row for ANY member's user_id — and this table isn't just a passive
-- audit log: getMemberBalance derives a kid's spendable "main coins"
-- balance FROM these rows (a pending CASH_OUT is treated as an immediate
-- deduction before members.main_coins itself is touched). A kid could
-- fabricate a fake EARNED row to inflate their own balance, or a fake
-- CASH_OUT against a sibling to zero theirs out — a real, direct way to
-- move perceived money with no coin-column write and no RPC involved.
--
-- Legitimate writers, confirmed by reading every insert site in
-- choreStore.ts/familyStore.ts: a parent approving/reversing a chore
-- writes a transaction row for the KID's user_id (not their own), and a
-- kid requesting their own cash-out writes a row for themselves. Fix:
-- allow either — the caller writing their own row, or any parent writing
-- any row in the family.
drop policy if exists "point_transactions family access" on public.point_transactions;

create policy "point_transactions family access" on public.point_transactions
for all
using (
  user_id in (select members.id from public.members where members.family_id = current_user_family_id())
  and (
    user_id = resolve_active_member_id()
    or exists (
      select 1 from public.members
      where members.id = resolve_active_member_id() and members.role = 'parent'
    )
  )
)
with check (
  user_id in (select members.id from public.members where members.family_id = current_user_family_id())
  and (
    user_id = resolve_active_member_id()
    or exists (
      select 1 from public.members
      where members.id = resolve_active_member_id() and members.role = 'parent'
    )
  )
);
