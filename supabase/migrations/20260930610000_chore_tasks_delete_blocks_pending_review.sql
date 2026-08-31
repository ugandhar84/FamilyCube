-- Real bug found by a deep exploratory QA trace of Chores: chore_tasks'
-- DELETE policy lets the assignee (assigned_to_id = caller) delete their
-- own chore unconditionally, with no status restriction — unlike UPDATE,
-- which already has narrower, status-aware rules elsewhere in this
-- schema. A kid mid-redo-dispute (status='kid_disputed_redo') could
-- delete the whole chore outright, erasing the dispute before a second
-- parent ever reviews it — the assignee's own DELETE right, meant for
-- ordinary self-cleanup of an unclaimed/in-progress chore, was never
-- meant to also cover erasing a pending adjudication.
--
-- Fix: the assignee's own delete right no longer applies while the chore
-- is in a state actively awaiting someone else's review
-- (pending_approval, kid_disputed_redo) — a parent/approver can still
-- delete it via the existing is_approver() clause, and the assignee
-- regains their normal delete right once the review resolves one way or
-- another.
drop policy if exists "chore_tasks_delete" on public.chore_tasks;
create policy "chore_tasks_delete" on public.chore_tasks
for delete
using (
  family_id = (current_user_family_id())::text
  and (
    created_by_id = resolve_active_member_id()
    or sponsor_user_id = resolve_active_member_id()
    or (
      assigned_to_id = resolve_active_member_id()
      and status not in ('pending_approval', 'kid_disputed_redo')
    )
    or is_approver()
  )
);
