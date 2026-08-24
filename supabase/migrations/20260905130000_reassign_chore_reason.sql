-- reassign_chore needed an optional reason (why the outgoing assignee is
-- off it) so callers like cantMakeIt.ts don't have to layer a second,
-- separate updateChore write on top just to record rejection_reason/
-- declined_at — which would reintroduce a split-write for the exact class
-- of bug this whole redesign exists to eliminate, and would double-log to
-- activity_log since updateChore logs on its own too.
--
-- A different parameter LIST (not just a default added to the same list)
-- creates a new overload rather than replacing the original 3-arg
-- function — drop the old one explicitly so there's only ever one
-- reassign_chore signature callers can resolve against.
drop function if exists public.reassign_chore(text, text, text);

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
      set assigned_to_id = null, is_pool = true, status = 'todo',
          rejection_reason = coalesce(p_reason, rejection_reason),
          declined_at = case when p_reason is not null then now() else declined_at end
      where id = p_chore_id
      returning * into v_result;
  else
    insert into public.chore_participants (chore_id, member_id, role, status)
      values (p_chore_id, p_new_member_id, 'assignee', 'pending');

    update public.chore_tasks
      set assigned_to_id = p_new_member_id, is_pool = false, status = 'todo',
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

comment on function public.reassign_chore(text, text, text, text) is 'Single entry point for chore reassignment — always sets assigned_to_id/is_pool/status together, with an optional reason recorded on the same write.';
