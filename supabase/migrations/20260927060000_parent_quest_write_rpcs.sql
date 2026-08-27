-- complete_parent_quest / cancel_locked_assignment / recall_parent_quest —
-- the three remaining parent_quest_assignments write paths that were still
-- raw client dbUpdate() calls with authorization checks (if any) enforced
-- ONLY against a client-side in-memory snapshot. recall_parent_quest in
-- particular had a client-only `assignment.assignedBy !== recallerId` gate
-- — the exact same staleness class of bug respond_to_parent_quest was
-- rewritten to close: a stale client could show the Recall button to
-- someone unauthorized, and the write would have gone through unchecked.
-- Moving all three into RPCs closes that for good and matches
-- respond_to_parent_quest's established pattern (row-lock, re-validate
-- against the live row, write, audit log).

create or replace function public.complete_parent_quest(p_assignment_id text, p_completed_by text)
returns public.parent_quest_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.parent_quest_assignments;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_assignment from public.parent_quest_assignments where id = p_assignment_id for update;
  if v_assignment.id is null then
    raise exception 'assignment % not found', p_assignment_id;
  end if;
  if v_assignment.assigned_to != p_completed_by and v_assignment.assigned_by != p_completed_by then
    raise exception 'member % is not a party to assignment %', p_completed_by, p_assignment_id;
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
$$;

create or replace function public.cancel_locked_assignment(p_assignment_id text, p_by_member_id text)
returns public.parent_quest_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.parent_quest_assignments;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_assignment from public.parent_quest_assignments where id = p_assignment_id for update;
  if v_assignment.id is null then
    raise exception 'assignment % not found', p_assignment_id;
  end if;
  if v_assignment.assigned_to != p_by_member_id and v_assignment.assigned_by != p_by_member_id then
    raise exception 'member % is not a party to assignment %', p_by_member_id, p_assignment_id;
  end if;
  if not v_assignment.is_locked then
    raise exception 'assignment % is not locked', p_assignment_id;
  end if;

  update public.parent_quest_assignments
    set status = 'DECLINED', is_locked = false, updated_at = now()
    where id = p_assignment_id
    returning * into v_assignment;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    select 'parent_quest_assignment', p_assignment_id, ct.family_id::uuid, p_by_member_id, 'reopened', 'DECLINED', v_transition_id, 'reopened from locked'
    from public.chore_tasks ct where ct.id = v_assignment.chore_id;

  return v_assignment;
end;
$$;

-- Only PENDING is recallable — once accepted the delegate has committed
-- (recall at that point is a "reassign" decision via DelegateSheet
-- instead). Only the original delegator may recall their own offer.
create or replace function public.recall_parent_quest(p_assignment_id text, p_recaller_id text)
returns public.parent_quest_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.parent_quest_assignments;
  v_transition_id uuid := gen_random_uuid();
begin
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
$$;

comment on function public.complete_parent_quest(text, text) is 'Mark a parent-to-parent/GP delegation done — server-validates the caller is a party to the assignment.';
comment on function public.cancel_locked_assignment(text, text) is 'Reopen a two-bounce-locked assignment back to the pool — server-validates the caller is a party and the assignment is actually locked.';
comment on function public.recall_parent_quest(text, text) is 'Delegator takes back a still-PENDING delegation — server-validates the caller is the original delegator, closing the same client-side-only-check bug class respond_to_parent_quest already fixed.';
