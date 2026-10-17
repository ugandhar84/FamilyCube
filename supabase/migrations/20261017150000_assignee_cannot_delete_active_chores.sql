-- QA finding: a kid could hard-delete a task a parent assigned to them (the assignee clause allowed any non-review
-- status), which also deleted it for everyone and dodged the work. Product rule: only the creator, the sponsor or a
-- parent may cancel an active task (the cancel_chore RPC). An assignee can still clear their own FINISHED tasks.
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
      and status in ('approved', 'auto_approved', 'completed', 'declined')
    )
    or is_approver()
  )
);
