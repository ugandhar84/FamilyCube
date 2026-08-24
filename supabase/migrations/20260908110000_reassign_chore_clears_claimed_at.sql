-- reassign_chore's own writes never touched claimed_at (added in
-- 20260908100000_chore_tasks_claimed_at.sql, after this function was
-- written) — a chore released back to the pool needs it cleared (it's not
-- claimed by anyone), and a chore reassigned to a new member also needs it
-- cleared (status goes back to 'todo', not 'in_progress' — the new person
-- still has to actually start it, which is a separate action; a fresh
-- assignment is not the same as a fresh claim). Without this, a chore that
-- gets reassigned after sitting claimed-and-abandoned for a while would
-- carry the OLD claim timestamp forward, making chore-noshow-sweep see it
-- as still-stale against the new assignee who hasn't even started yet.

create or replace function public.reassign_chore(
  p_chore_id text, p_new_member_id text, p_by_member_id text, p_reason text default null
)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
  v_from_status text;
begin
  select status into v_from_status from public.chore_tasks where id = p_chore_id for update;

  delete from public.chore_participants where chore_id = p_chore_id and role = 'assignee';

  if p_new_member_id is null then
    update public.chore_tasks
      set assigned_to_id = null, is_pool = true, status = 'todo', claimed_at = null,
          rejection_reason = coalesce(p_reason, rejection_reason),
          declined_at = case when p_reason is not null then now() else declined_at end
      where id = p_chore_id
      returning * into v_result;
  else
    insert into public.chore_participants (chore_id, member_id, role, status)
      values (p_chore_id, p_new_member_id, 'assignee', 'pending');

    update public.chore_tasks
      set assigned_to_id = p_new_member_id, is_pool = false, status = 'todo', claimed_at = null,
          rejection_reason = coalesce(p_reason, rejection_reason),
          declined_at = case when p_reason is not null then now() else declined_at end
      where id = p_chore_id
      returning * into v_result;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_by_member_id, 'reassigned', v_from_status, v_result.status, v_transition_id,
      coalesce(p_reason, case when p_new_member_id is null then 'released back to pool' else format('reassigned to member %s', p_new_member_id) end));

  return v_result;
end;
$$;
