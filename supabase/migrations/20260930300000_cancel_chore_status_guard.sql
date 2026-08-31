-- cancel_chore deleted the chore_tasks row unconditionally regardless of
-- status — live QA trace (master-flow-v2 audit, case B3) confirmed it
-- would happily delete an ALREADY-APPROVED chore with zero coin clawback,
-- silently erasing a paid transaction's own record. No live UI path
-- reaches this today (canDelete/canKidDecline both already exclude
-- approved/done chores client-side), but the server-side gap is real
-- defense-in-depth regardless of what the current UI happens to expose.
create or replace function public.cancel_chore(p_chore_id text, p_by_member_id text)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chore public.chore_tasks;
  v_role text;
  v_actor_family text;
  v_transition_id uuid := gen_random_uuid();
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_by_member_id then
    raise exception 'caller is not member %', p_by_member_id;
  end if;

  select * into v_chore from public.chore_tasks where id = p_chore_id for update;
  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status = 'approved' then
    raise exception 'chore % is already approved and paid — cancelling would erase that record with no coin reversal', p_chore_id;
  end if;

  select role, family_id into v_role, v_actor_family from public.members where id = p_by_member_id;
  if v_actor_family is distinct from v_chore.family_id then
    raise exception 'member % is not in the same family as chore %', p_by_member_id, p_chore_id;
  end if;
  if v_role != 'parent' and v_chore.created_by_id != p_by_member_id then
    raise exception 'member % is not authorized to cancel chore % (not the creator or a parent)', p_by_member_id, p_chore_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_by_member_id, 'cancelled', v_chore.status, 'cancelled', v_transition_id, 'no longer needed');

  delete from public.chore_tasks where id = p_chore_id;

  return v_chore;
end;
$$;
