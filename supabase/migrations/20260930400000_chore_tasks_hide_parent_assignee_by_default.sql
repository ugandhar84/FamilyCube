-- Real, live gap found by direct user report and confirmed against the
-- actual RLS policy: a chore assigned directly to a parent (or one parent
-- delegating to another) is ONLY hidden from kids/teens if the creating
-- parent remembered to explicitly flip the "Parent Only" toggle
-- (category_type = 'parent_only_quest'). If they didn't — which is the
-- default, unprompted state for any ordinary chore that just happens to
-- be assigned to a parent — the row is fully readable by every kid/teen's
-- authenticated session, confirmed directly against the live RLS policy
-- itself (not just a client-side UI coincidence, which was the prior,
-- incomplete understanding). Parents should never have to remember to
-- mark something private just because it happens to be for another adult
-- — a chore assigned to a parent is private by default, full stop, the
-- same way parent_only_quest already is.
drop policy if exists "chore_tasks family read" on public.chore_tasks;

create policy "chore_tasks family read" on public.chore_tasks
for select
using (
  family_id = (current_user_family_id())::text
  and (
    -- Neither explicitly parent-only NOR assigned to a parent-role member
    -- — an ordinary, non-adult-targeted row, visible to everyone in the
    -- family as before.
    (
      category_type is distinct from 'parent_only_quest'
      and not exists (
        select 1 from public.members m
        where m.id = chore_tasks.assigned_to_id and m.role = 'parent'
      )
    )
    -- The caller IS a parent — parents always see everything in their
    -- own family, same as before this fix.
    or exists (
      select 1 from public.members
      where members.id = resolve_active_member_id() and members.role = 'parent'
    )
    -- A senior/grandparent who is SPECIFICALLY the assignee of this row
    -- still needs to see their own delegated task — same carve-out the
    -- pre-existing client-side query already had for parent_only_quest,
    -- now also applied to a plain parent-assigned row for consistency.
    or (
      chore_tasks.assigned_to_id = resolve_active_member_id()
      and exists (
        select 1 from public.members
        where members.id = resolve_active_member_id() and members.role = 'grandparent'
      )
    )
  )
);
