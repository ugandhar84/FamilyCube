-- Real gap found by direct QA trace of the parent-to-parent (P2P) private
-- lane: complete_parent_quest and recall_parent_quest were the only two
-- RPCs in this family of functions NOT gated by resolve_active_member_id(),
-- unlike their sibling respond_to_parent_quest (Accept/Decline/Snooze/
-- Blocker/Trade/Discuss), which already verifies the caller. Anyone able to
-- call either RPC with a p_completed_by/p_recaller_id string matching
-- assigned_to/assigned_by could complete or recall a delegation as that
-- person, with no check that the caller's own real session actually is
-- them — the exact identity-spoofing shape already closed everywhere else
-- this session (migrations 20260930260000-390000).
create or replace function public.complete_parent_quest(p_assignment_id text, p_completed_by text)
returns parent_quest_assignments
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_assignment public.parent_quest_assignments;
  v_transition_id uuid := gen_random_uuid();
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_completed_by then
    raise exception 'caller is not member %', p_completed_by;
  end if;

  select * into v_assignment from public.parent_quest_assignments where id = p_assignment_id for update;
  if v_assignment.id is null then
    raise exception 'assignment % not found', p_assignment_id;
  end if;
  if v_assignment.assigned_to != p_completed_by and v_assignment.assigned_by != p_completed_by then
    raise exception 'member % is not a party to assignment %', p_completed_by, p_assignment_id;
  end if;
  if v_assignment.status = 'COMPLETED' then
    raise exception 'assignment % is already completed', p_assignment_id;
  end if;

  update public.parent_quest_assignments
    set status = 'COMPLETED', completed_at = now(), updated_at = now()
    where id = p_assignment_id
    returning * into v_assignment;

  update public.chore_tasks set status = 'completed' where id = v_assignment.chore_id;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id)
    select 'parent_quest_assignment', p_assignment_id, ct.family_id::uuid, p_completed_by, 'completed', 'COMPLETED', v_transition_id
    from public.chore_tasks ct where ct.id = v_assignment.chore_id;

  return v_assignment;
end;
$function$;

create or replace function public.recall_parent_quest(p_assignment_id text, p_recaller_id text)
returns parent_quest_assignments
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_assignment public.parent_quest_assignments;
  v_transition_id uuid := gen_random_uuid();
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_recaller_id then
    raise exception 'caller is not member %', p_recaller_id;
  end if;

  select * into v_assignment from public.parent_quest_assignments where id = p_assignment_id for update;
  if v_assignment.id is null then
    raise exception 'assignment % not found', p_assignment_id;
  end if;
  if v_assignment.assigned_by != p_recaller_id then
    raise exception 'member % is not the delegator of assignment %', p_recaller_id, p_assignment_id;
  end if;
  if v_assignment.status != 'PENDING' then
    raise exception 'assignment % is not PENDING (status=%)', p_assignment_id, v_assignment.status;
  end if;

  update public.parent_quest_assignments
    set status = 'DECLINED', updated_at = now()
    where id = p_assignment_id
    returning * into v_assignment;

  -- Reassign the underlying chore straight back to the recaller — they
  -- said "I'll just do it myself," not "reopen this to the family pool."
  update public.chore_tasks set assigned_to_id = p_recaller_id, status = 'todo' where id = v_assignment.chore_id;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    select 'parent_quest_assignment', p_assignment_id, ct.family_id::uuid, p_recaller_id, 'recalled', 'DECLINED', v_transition_id, 'recalled by delegator'
    from public.chore_tasks ct where ct.id = v_assignment.chore_id;

  return v_assignment;
end;
$function$;
