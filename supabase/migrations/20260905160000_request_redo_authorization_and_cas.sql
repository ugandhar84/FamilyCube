-- request_redo was missing the authorization check (parent or active
-- temporary-approver grant) approve_chore already has, and had no CAS guard
-- against a concurrent approval already having landed — the exact same
-- "two parents act on the same submission" race approveChore/requestRedo
-- both defend against client-side today. Adding both here so the RPC is a
-- genuine drop-in replacement for the raw updateChore + separate CAS
-- pattern requestRedo currently uses, not just a status-value fix.
create or replace function public.request_redo(p_chore_id text, p_reviewer_id text, p_reason text)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_new_redo_count integer;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status != 'pending_approval' then
    raise exception 'chore % is not pending approval (status=%)', p_chore_id, v_chore.status;
  end if;

  select role into v_reviewer_role from public.members where id = p_reviewer_id;
  if v_reviewer_role != 'parent' and not exists (
    select 1 from public.temporary_approvers
    where granted_to_member_id = p_reviewer_id and family_id = v_chore.family_id
      and expires_at > now() and revoked_at is null
  ) then
    raise exception 'member % is not authorized to request a redo', p_reviewer_id;
  end if;

  v_new_redo_count := coalesce(v_chore.redo_count, 0) + 1;

  update public.chore_participants
    set status = 'declined'
    where chore_id = p_chore_id and role = 'assignee';

  update public.chore_tasks
    set status = 'redo_requested', rejection_reason = p_reason, reviewed_at = now(),
        reviewed_by_id = p_reviewer_id, redo_count = v_new_redo_count
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_reviewer_id, 'declined', 'pending_approval', 'redo_requested', v_transition_id, p_reason);

  return v_chore;
end;
$$;

comment on function public.request_redo(text, text, text) is 'Parent/reviewer declines a submission and asks for a redo — row-locked, authorization-checked (parent or active temporary-approver grant), sets status=redo_requested and increments redo_count.';
