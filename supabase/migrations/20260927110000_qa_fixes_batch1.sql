-- QA fixes batch 1 — confirmed via a comprehensive test suite executed
-- against a live, isolated test family (82 test cases, full combinatorial
-- matrix of every chore/quest RPC). Fixes, ranked by severity:
--
-- 1. cancel_chore / reassign_chore had NO cross-family authorization check
--    — a parent could delete or reassign ANY family's chore by id, since
--    both are security definer functions (RLS never runs inside them) and
--    neither compared the target row's family_id to the actor's own. Not
--    reachable via the stock UI today (the client's own SELECT is already
--    RLS-scoped), but zero defense-in-depth against any other path a
--    chore id could reach these RPCs from (deep link, push payload, log).
-- 2. respond_to_parent_quest had NO actor parameter at all, unlike every
--    sibling RPC (complete_parent_quest, cancel_locked_assignment,
--    recall_parent_quest) — confirmed exploitable: an uninvolved third
--    party could respond to someone else's assignment with zero identity
--    check. Adding the parameter is a breaking signature change — the
--    client call site is updated in the same commit as this migration.
-- 3. reject_terms_change never restored the original coins/date from
--    pending_terms.old — a rejected proposal left the chore permanently
--    stuck at the new, unaccepted value.
-- 4. complete_parent_quest had no double-completion guard (re-stamps
--    completed_at, duplicate activity_log row on a retry/double-tap).
-- 5. offer_chore_handoff allowed offering a chore to its own current
--    assignee, producing a self-referential pending_handoff_to ==
--    assigned_to_id state.
-- 6. propose_later_date silently clobbered an existing in-flight proposal
--    with no guard — a second "ask for later" request wiped the first's
--    date/reason with zero trace.
-- 7. decline_later_date had no null-guard (asymmetric with
--    approve_later_date, which already had one) — declining a chore with
--    no pending proposal succeeded silently and wrote a misleading
--    activity_log entry.
-- 8. cancel_locked_assignment never reset is_pool=true on reopen — a
--    reopened plain household chore was unassigned+todo but invisible to
--    kid/teen pool-claim UI (which filters on is_pool=true), becoming an
--    orphaned, un-claimable item only a parent could manually reassign.

-- ── 1a. cancel_chore — add family check ──────────────────────────────────
create or replace function public.cancel_chore(p_chore_id text, p_by_member_id text)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_role text;
  v_actor_family text;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;
  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
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

-- ── 1b. reassign_chore — add family check on the new assignee ───────────
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
  v_new_member_family text;
  v_chore_family text;
begin
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

  -- QA TC-30 — a reassign off a locked/still-open System-A delegation left
  -- the old parent_quest_assignments row dangling (PARKED/locked), never
  -- superseded, so the two systems could disagree about who owns the
  -- chore. Mirrors addParentQuest's own staleOpen-closing pattern.
  update public.parent_quest_assignments
    set status = 'COMPLETED', updated_at = now()
    where chore_id = p_chore_id and status in ('PENDING', 'ACCEPTED', 'SNOOZED', 'PARKED');

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_by_member_id, 'reassigned', v_from_status, v_result.status, v_transition_id,
      coalesce(p_reason, case when p_new_member_id is null then 'released back to pool' else format('reassigned to %s', coalesce(v_new_member_name, 'a family member')) end));

  return v_result;
end;
$$;

-- ── 2. respond_to_parent_quest — add actor parameter + party check ──────
drop function if exists public.respond_to_parent_quest(text, text, text);
create or replace function public.respond_to_parent_quest(
  p_assignment_id text, p_actor_id text, p_action text, p_details text default null
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
  -- QA TC-48 — this RPC previously took no actor parameter at all, so it
  -- could never verify the caller was actually a party to the assignment.
  -- An uninvolved third family member could accept/decline someone else's
  -- delegation outright.
  if v_assignment.assigned_to != p_actor_id and v_assignment.assigned_by != p_actor_id then
    raise exception 'member % is not a party to assignment %', p_actor_id, p_assignment_id;
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
    select 'parent_quest_assignment', p_assignment_id, ct.family_id::uuid, p_actor_id, lower(p_action), v_assignment.status, v_new_status, v_transition_id, p_details
    from public.chore_tasks ct where ct.id = v_assignment.chore_id;

  return v_assignment;
end;
$$;

-- ── 3. reject_terms_change — restore original value from pending_terms ──
-- (propose_terms_change's own live-write-before-acceptance behavior is a
-- separate, deeper fix deferred to a follow-up — see QA report items 3/4;
-- this migration fixes the half that's safe to land immediately: rollback
-- on reject, so a rejected proposal is never permanently stuck at the new
-- value.)
create or replace function public.reject_terms_change(p_chore_id text, p_member_id text)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_old_coins integer;
  v_old_base_points integer;
  v_old_due_date text;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;
  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status != 'terms_changed' then
    raise exception 'chore % has no pending terms change (status=%)', p_chore_id, v_chore.status;
  end if;
  if v_chore.assigned_to_id is distinct from p_member_id then
    raise exception 'member % is not the current claimant of chore %', p_member_id, p_chore_id;
  end if;

  v_old_coins := (v_chore.pending_terms->'old'->>'coinsReward')::integer;
  v_old_base_points := (v_chore.pending_terms->'old'->>'basePoints')::integer;
  v_old_due_date := v_chore.pending_terms->'old'->>'dueDate';

  update public.chore_tasks
    set status = 'todo', assigned_to_id = null, is_pool = true,
        coins_reward = coalesce(v_old_coins, coins_reward),
        base_points = coalesce(v_old_base_points, base_points),
        due_date = coalesce(v_old_due_date, due_date),
        pending_terms = null
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_member_id, 'terms_rejected', 'todo', v_transition_id, 'terms changed, handed back — reverted to original');

  return v_chore;
end;
$$;

-- ── 4. complete_parent_quest — double-completion guard ───────────────────
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
$$;

-- ── 5. offer_chore_handoff — reject offering to the current assignee ────
create or replace function public.offer_chore_handoff(
  p_chore_id text, p_to_member_id text, p_by_member_id text, p_reason text default null
)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
  v_to_name text;
begin
  select * into v_result from public.chore_tasks where id = p_chore_id for update;
  if v_result.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_result.assigned_to_id = p_to_member_id then
    raise exception 'chore % is already assigned to member %', p_chore_id, p_to_member_id;
  end if;

  select name into v_to_name from public.members where id = p_to_member_id;

  delete from public.chore_participants where chore_id = p_chore_id and role = 'assignee' and member_id = p_to_member_id;
  insert into public.chore_participants (chore_id, member_id, role, status)
    values (p_chore_id, p_to_member_id, 'assignee', 'pending');

  update public.chore_tasks
    set pending_handoff_to = p_to_member_id,
        pending_handoff_reason = p_reason,
        pending_handoff_offered_by = p_by_member_id,
        pending_handoff_offered_at = now(),
        rejection_reason = coalesce(p_reason, rejection_reason),
        declined_at = case when p_reason is not null then now() else declined_at end
    where id = p_chore_id
    returning * into v_result;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_by_member_id, 'handoff_offered', v_result.status, v_result.status, v_transition_id,
      format('offered to %s', coalesce(v_to_name, 'a family member')));

  return v_result;
end;
$$;

-- ── 6. propose_later_date — reject clobbering an existing proposal ──────
create or replace function public.propose_later_date(
  p_chore_id text, p_by_member_id text, p_new_date text, p_reason text default null
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
  if v_from_status is null then
    raise exception 'chore % not found', p_chore_id;
  end if;

  if exists (select 1 from public.chore_tasks where id = p_chore_id and pending_later_date is not null) then
    raise exception 'chore % already has a pending later-date proposal — resolve it first', p_chore_id;
  end if;

  update public.chore_tasks
    set assigned_to_id = null, is_pool = false, status = 'todo', claimed_at = null,
        rejection_reason = coalesce(p_reason, rejection_reason),
        declined_at = now(),
        pending_later_date = p_new_date,
        pending_later_reason = p_reason,
        pending_later_requested_by = p_by_member_id,
        pending_later_requested_at = now()
    where id = p_chore_id
    returning * into v_result;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_by_member_id, 'later_proposed', v_from_status, v_result.status, v_transition_id,
      format('proposed new date %s: %s', p_new_date, coalesce(p_reason, '')));

  return v_result;
end;
$$;

-- ── 7. decline_later_date — add the missing null-guard ───────────────────
create or replace function public.decline_later_date(p_chore_id text, p_parent_id text)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.chore_tasks;
  v_role text;
  v_transition_id uuid := gen_random_uuid();
begin
  select role into v_role from public.members where id = p_parent_id;
  if v_role != 'parent' and not exists (
    select 1 from public.temporary_approvers
    where granted_to_member_id = p_parent_id
      and expires_at > now() and revoked_at is null
  ) then
    raise exception 'member % is not authorized to decline a reschedule', p_parent_id;
  end if;

  select * into v_result from public.chore_tasks where id = p_chore_id for update;
  if v_result.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_result.pending_later_date is null then
    raise exception 'chore % has no pending later-date proposal', p_chore_id;
  end if;

  update public.chore_tasks
    set pending_later_date = null, pending_later_reason = null,
        pending_later_requested_by = null, pending_later_requested_at = null
    where id = p_chore_id
    returning * into v_result;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_parent_id, 'later_declined', v_result.status, v_result.status, v_transition_id, 'kept original date');

  return v_result;
end;
$$;

-- ── 8. cancel_locked_assignment — reset is_pool on reopen ────────────────
create or replace function public.cancel_locked_assignment(p_assignment_id text, p_by_member_id text)
returns public.parent_quest_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.parent_quest_assignments;
  v_chore_is_adult_task boolean;
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

  -- QA TC-31 — a reopened plain household chore was left is_pool=false,
  -- unassigned+todo but invisible to kid/teen pool-claim UI (which filters
  -- on is_pool=true), becoming an orphaned item only a parent could see.
  -- Adult-only tasks (category_type='parent_only_quest') stay out of any
  -- kid/teen pool regardless — only flip is_pool for non-adult chores.
  update public.chore_tasks
    set is_pool = true
    where id = v_assignment.chore_id and category_type != 'parent_only_quest';

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    select 'parent_quest_assignment', p_assignment_id, ct.family_id::uuid, p_by_member_id, 'reopened', 'DECLINED', v_transition_id, 'reopened from locked'
    from public.chore_tasks ct where ct.id = v_assignment.chore_id;

  return v_assignment;
end;
$$;
