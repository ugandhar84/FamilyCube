-- complete_parent_quest set chore_tasks.status = 'completed' but never
-- stamped approved_at (chore_tasks has no completed_at column of its own —
-- the frontend's Completed-tab sort in QuestsScreen.tsx reads
-- completedAt ?? approvedAt ?? submittedAt to order "most recently closed
-- first"). With all three null/missing, that sort's closedMs() fell back
-- to 0, so a chore completed via this P2P direct-complete path (no
-- submit/approve cycle) sorted as the OLDEST possible closed item instead
-- of floating to the top [live-reported, screenshot: today's completed
-- task buried mid-list instead of at the top: "why this is gone to too
-- mid it should be bottom top right. as it is todays task"].
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

  update public.chore_tasks set status = 'completed', approved_at = now() where id = v_assignment.chore_id;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id)
    select 'parent_quest_assignment', p_assignment_id, ct.family_id::uuid, p_completed_by, 'completed', 'COMPLETED', v_transition_id
    from public.chore_tasks ct where ct.id = v_assignment.chore_id;

  return v_assignment;
end;
$function$;

-- Backfill existing rows stuck in this state so they sort correctly too,
-- not just future completions.
update public.chore_tasks set approved_at = claimed_at
where status = 'completed' and approved_at is null and claimed_at is not null;
