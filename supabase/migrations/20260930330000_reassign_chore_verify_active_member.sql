-- reassign_chore was missed by the identity-verification sweep
-- (migrations 20260930260000 through 20260930300000) — confirmed via a
-- fresh QA trace this session that it had ZERO resolve_active_member_id()
-- check and no role check at all. Any family member's session could call
-- reassign_chore(chore_id, new_member_id, by_member_id=<anyone else's id>,
-- reason) and it would both perform the reassignment with no
-- authorization check whatsoever, AND write activity_log.actor_id =
-- p_by_member_id, permanently misattributing the action to whoever the
-- caller named — the exact same identity-spoofing class already fixed
-- everywhere else this session, missed here.
create or replace function public.reassign_chore(p_chore_id text, p_new_member_id text, p_by_member_id text, p_reason text default null)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
  v_from_status text;
  v_new_member_name text;
  v_new_member_family text;
  v_chore_family text;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_by_member_id then
    raise exception 'caller is not member %', p_by_member_id;
  end if;

  select status, family_id into v_from_status, v_chore_family from public.chore_tasks where id = p_chore_id for update;
  if v_from_status is null then
    raise exception 'chore % not found', p_chore_id;
  end if;

  delete from public.chore_participants where chore_id = p_chore_id and role = 'assignee';

  if p_new_member_id is null then
    update public.chore_tasks
      set assigned_to_id = null, is_pool = true, status = 'todo', claimed_at = null,
          rejection_reason = coalesce(p_reason, rejection_reason),
          declined_at = case when p_reason is not null then now() else declined_at end
      where id = p_chore_id
      returning * into v_result;
  else
    select name, family_id into v_new_member_name, v_new_member_family from public.members where id = p_new_member_id;
    if v_new_member_family is distinct from v_chore_family then
      raise exception 'member % is not in the same family as chore %', p_new_member_id, p_chore_id;
    end if;

    insert into public.chore_participants (chore_id, member_id, role, status)
      values (p_chore_id, p_new_member_id, 'assignee', 'pending');

    update public.chore_tasks
      set assigned_to_id = p_new_member_id, is_pool = false, status = 'todo', claimed_at = null,
          rejection_reason = coalesce(p_reason, rejection_reason),
          declined_at = case when p_reason is not null then now() else declined_at end
      where id = p_chore_id
      returning * into v_result;
  end if;

  update public.parent_quest_assignments
    set status = 'COMPLETED', updated_at = now()
    where chore_id = p_chore_id and status in ('PENDING', 'ACCEPTED', 'SNOOZED', 'PARKED');

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_by_member_id, 'reassigned', v_from_status, v_result.status, v_transition_id,
      coalesce(p_reason, case when p_new_member_id is null then 'released back to pool' else format('reassigned to %s', coalesce(v_new_member_name, 'a family member')) end));

  return v_result;
end;
$$;
