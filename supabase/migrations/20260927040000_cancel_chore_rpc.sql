-- CantMakeItSheet's "It's not needed anymore" outcome called deleteChore
-- directly — any CURRENT ASSIGNEE could hard-delete a chore, not just its
-- creator or a parent (master-flow spec: "Only the person who asked, or a
-- parent, can cancel"). A kid/teen/GP declining their own assignment could
-- unilaterally destroy a chore someone else created, with no restriction
-- at all. This RPC enforces that check server-side rather than trusting
-- client role state, matching every other authorization check in this file
-- (approve_chore, approve_later_date, etc).
create or replace function public.cancel_chore(p_chore_id text, p_by_member_id text)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_role text;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;
  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;

  select role into v_role from public.members where id = p_by_member_id;
  if v_role != 'parent' and v_chore.created_by_id != p_by_member_id then
    raise exception 'member % is not authorized to cancel chore % (not the creator or a parent)', p_by_member_id, p_chore_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_by_member_id, 'cancelled', v_chore.status, 'cancelled', v_transition_id, 'no longer needed');

  delete from public.chore_tasks where id = p_chore_id;

  return v_chore;
end;
$$;

comment on function public.cancel_chore(text, text) is 'Master-flow cancel — only the chore''s creator or a parent may cancel outright; anyone else declining should use declineChoreAssignment/offerChoreHandoff/proposeLaterDate instead.';
