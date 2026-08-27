-- respondToParentQuest (Accept/Decline/Snooze/Blocker/Trade/Discuss on a
-- parent-to-parent or parent-to-GP delegation) was the last major System-A
-- write still done as a raw client updateChore + a CAS UPDATE guarded by
-- `.eq('status', previousStatus)`, where previousStatus came from a
-- CLIENT-SIDE in-memory snapshot (get().parentAssignments.find(...)) that
-- can go stale after a profile switch, backgrounding, or any timing gap —
-- when the CAS lost, the client just reverted local state and logged a
-- warning, with the tapped action silently evaporating and zero feedback
-- to the person who tapped it (the sheet had already closed as if it
-- succeeded). Moving the whole transition into one RPC means: (a) the CAS
-- check runs against the DB's actual current row inside the same
-- transaction that writes it — no client snapshot involved at all, (b) a
-- real failure (already locked, already resolved by someone else) comes
-- back as a real exception the client can show, instead of a silent
-- optimistic-then-reverted no-op.
create or replace function public.respond_to_parent_quest(
  p_assignment_id text, p_action text, p_details text default null
)
returns public.parent_quest_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.parent_quest_assignments;
  v_new_status text;
  v_snooze_until timestamptz;
  v_bounce_count integer;
  v_is_locked boolean;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_assignment from public.parent_quest_assignments where id = p_assignment_id for update;
  if v_assignment.id is null then
    raise exception 'assignment % not found', p_assignment_id;
  end if;
  if v_assignment.is_locked then
    raise exception 'assignment % is locked (two-bounce rule) — needs to be discussed outside the app', p_assignment_id;
  end if;
  if v_assignment.status not in ('PENDING', 'SNOOZED', 'PARKED') then
    raise exception 'assignment % is already resolved (status=%)', p_assignment_id, v_assignment.status;
  end if;

  v_bounce_count := v_assignment.bounce_count;
  v_is_locked := false;
  v_snooze_until := null;

  if p_action = 'ACCEPT' then
    v_new_status := 'ACCEPTED';
  elsif p_action = 'DECLINE' then
    v_new_status := 'DECLINED';
  elsif p_action = 'SNOOZE' then
    v_new_status := 'SNOOZED';
    v_snooze_until := now() + interval '48 hours';
  elsif p_action in ('BLOCKER', 'TRADE', 'DISCUSS') then
    v_new_status := 'PARKED';
    v_bounce_count := v_bounce_count + 1;
    if v_bounce_count >= 2 then
      v_is_locked := true;
    end if;
  else
    raise exception 'unknown action %', p_action;
  end if;

  update public.parent_quest_assignments
    set status = v_new_status,
        snooze_until = v_snooze_until,
        bounce_count = v_bounce_count,
        is_locked = v_is_locked,
        actionable_pushback = case when p_action = 'ACCEPT' then null else p_action end,
        pushback_details = p_details,
        updated_at = now()
    where id = p_assignment_id and status = v_assignment.status
    returning * into v_assignment;

  if v_assignment.id is null then
    raise exception 'assignment % changed status mid-write, please retry', p_assignment_id;
  end if;

  if v_new_status = 'ACCEPTED' then
    update public.chore_tasks set assigned_to_id = v_assignment.assigned_to, status = 'in_progress' where id = v_assignment.chore_id;
  elsif v_new_status in ('PARKED', 'DECLINED') then
    update public.chore_tasks set assigned_to_id = null, status = 'todo' where id = v_assignment.chore_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    select 'parent_quest_assignment', p_assignment_id, ct.family_id::uuid, v_assignment.assigned_to, lower(p_action), v_assignment.status, v_new_status, v_transition_id, p_details
    from public.chore_tasks ct where ct.id = v_assignment.chore_id;

  return v_assignment;
end;
$$;

comment on function public.respond_to_parent_quest(text, text, text) is 'Single entry point for Accept/Decline/Snooze/Blocker/Trade/Discuss on a System-A delegation — CAS runs against the DB''s live row inside the same transaction, not a client-side status snapshot.';
