-- reassign_chore's activity_log note baked the raw member UUID directly
-- into the note text ("reassigned to member 62ac7da2-3f21-...") instead of
-- resolving it to a name — every other well-formed activity_log note in
-- this app reads as plain English; this was the one place a parent-facing
-- History sheet showed a raw, meaningless UUID. ChoreHistorySheet.tsx's
-- resolveFieldValue() only resolves member ids that live in the structured
-- field/oldValue/newValue columns (which this row DOES also carry
-- correctly, via reassign_chore's own activity_log insert's from_status/
-- to_status columns — but not for the assignee itself, which only ever
-- went into the free-text note) — resolving it here, at the one place that
-- actually knows the member's name via a real join, fixes it at the
-- source instead of asking every future reader of activity_log to somehow
-- guess which notes contain a UUID that needs resolving.
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
  v_new_member_name text;
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
    select name into v_new_member_name from public.members where id = p_new_member_id;

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
      coalesce(p_reason, case when p_new_member_id is null then 'released back to pool' else format('reassigned to %s', coalesce(v_new_member_name, 'a family member')) end));

  return v_result;
end;
$$;
