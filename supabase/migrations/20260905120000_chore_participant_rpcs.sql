-- Phase 1 (cont.) — RPC functions for chore_participants. Same pattern as
-- the event RPCs: row-lock, atomic check-and-write, mirror the legacy
-- chore_tasks columns (assigned_to_id/status/is_pool) so unmigrated client
-- code keeps working, one activity_log summary row per call. No client
-- code calls these yet.

-- ── reassign_chore ───────────────────────────────────────────────────────
-- Single entry point for "who does this chore" — today ~10 raw
-- updateChore/updateQuest call sites each independently decide which
-- subset of assigned_to_id/status/is_pool to write, with confirmed
-- asymmetries (some set status without is_pool, one sets assigned_to_id
-- alone). This always sets all three together.
create or replace function public.reassign_chore(
  p_chore_id text, p_new_member_id text, p_by_member_id text
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
    -- Release back to the pool.
    update public.chore_tasks
      set assigned_to_id = null, is_pool = true, status = 'todo'
      where id = p_chore_id
      returning * into v_result;
  else
    insert into public.chore_participants (chore_id, member_id, role, status)
      values (p_chore_id, p_new_member_id, 'assignee', 'pending');

    update public.chore_tasks
      set assigned_to_id = p_new_member_id, is_pool = false, status = 'todo'
      where id = p_chore_id
      returning * into v_result;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_by_member_id, 'reassigned', v_from_status, v_result.status, v_transition_id,
      case when p_new_member_id is null then 'released back to pool' else format('reassigned to member %s', p_new_member_id) end);

  return v_result;
end;
$$;

-- ── claim_pool_quest ─────────────────────────────────────────────────────
-- Race-safe self-claim of an open pool chore. Real unique-constraint-guarded
-- insert, same CAS shape as claim_event_slot.
create or replace function public.claim_pool_quest(p_chore_id text, p_member_id text)
returns table (claimed boolean, chore public.chore_tasks)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_result from public.chore_tasks where id = p_chore_id for update;

  if v_result.id is null or v_result.assigned_to_id is not null or not coalesce(v_result.is_pool, false) then
    return query select false, null::public.chore_tasks;
    return;
  end if;

  insert into public.chore_participants (chore_id, member_id, role, status)
    values (p_chore_id, p_member_id, 'assignee', 'claimed')
    on conflict (chore_id, member_id, role) do nothing;

  update public.chore_tasks
    set assigned_to_id = p_member_id, is_pool = false, status = 'in_progress'
    where id = p_chore_id
    returning * into v_result;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_member_id, 'claimed', 'todo', 'in_progress', v_transition_id, 'claimed from pool');

  return query select true, v_result;
end;
$$;

-- ── submit_chore ─────────────────────────────────────────────────────────
create or replace function public.submit_chore(
  p_chore_id text, p_member_id text, p_photo_url text default null, p_note text default null
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

  update public.chore_participants
    set status = 'submitted'
    where chore_id = p_chore_id and member_id = p_member_id and role = 'assignee';

  update public.chore_tasks
    set status = 'pending_approval',
        submission_photo_url = coalesce(p_photo_url, submission_photo_url),
        submission_note = coalesce(p_note, submission_note),
        submitted_at = now()
    where id = p_chore_id and assigned_to_id = p_member_id
    returning * into v_result;

  if v_result.id is null then
    raise exception 'chore % is not assigned to member %', p_chore_id, p_member_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_member_id, 'submitted', v_from_status, 'pending_approval', v_transition_id);

  return v_result;
end;
$$;

-- ── approve_chore ────────────────────────────────────────────────────────
-- The one QA specifically flagged: pays real coins, and today has ZERO
-- atomic audit trail (bypasses updateChore entirely). Row-lock, CAS on
-- pending_approval, stamp approval fields, pay out via the existing
-- award_coins() RPC, write the approver participant row, one activity_log
-- row — all in one transaction, so a failed/retried call can never double-pay
-- or leave a payout with no record of who approved it.
create or replace function public.approve_chore(p_chore_id text, p_reviewer_id text)
returns table (chore public.chore_tasks, coins_paid integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_pts integer;
  v_wallet text;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status != 'pending_approval' then
    raise exception 'chore % is not pending approval (status=%)', p_chore_id, v_chore.status;
  end if;

  select role into v_reviewer_role from public.members where id = p_reviewer_id;
  if v_reviewer_role != 'parent' and not exists (
    select 1 from public.temporary_approvers
    where granted_to_member_id = p_reviewer_id and family_id = v_chore.family_id
      and expires_at > now() and revoked_at is null
  ) then
    raise exception 'member % is not authorized to approve chores', p_reviewer_id;
  end if;

  v_pts := coalesce(nullif(v_chore.base_points, 0), v_chore.coins_reward, 0) + coalesce(v_chore.bonus_coins, 0);
  v_wallet := case when v_chore.category_type = 'grandparent_quest' or v_chore.sponsor_user_id is not null then 'gp' else 'main' end;

  update public.chore_tasks
    set status = 'approved', approved_at = now()::text, reviewed_at = now(), reviewed_by_id = p_reviewer_id
    where id = p_chore_id
    returning * into v_chore;

  update public.chore_participants
    set status = 'approved'
    where chore_id = p_chore_id and role = 'assignee';

  insert into public.chore_participants (chore_id, member_id, role, status)
    values (p_chore_id, p_reviewer_id, 'approver', 'approved')
    on conflict (chore_id, member_id, role) do update set status = 'approved';

  if v_pts > 0 and v_chore.assigned_to_id is not null and not coalesce(v_chore.reward_pending_review, false) then
    perform public.award_coins(v_chore.assigned_to_id, v_pts, coalesce(v_chore.xp_reward, 0), v_wallet);
  else
    v_pts := 0;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_reviewer_id, 'approved', 'pending_approval', 'approved', v_transition_id,
      case when v_pts > 0 then format('approved, %s coins paid', v_pts) else 'approved' end);

  return query select v_chore, v_pts;
end;
$$;

-- ── request_redo ─────────────────────────────────────────────────────────
create or replace function public.request_redo(p_chore_id text, p_reviewer_id text, p_reason text)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
begin
  update public.chore_participants
    set status = 'declined'
    where chore_id = p_chore_id and role = 'assignee';

  update public.chore_tasks
    set status = 'declined', rejection_reason = p_reason, declined_at = now(), reviewed_by_id = p_reviewer_id
    where id = p_chore_id
    returning * into v_result;

  if v_result.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_reviewer_id, 'declined', 'declined', v_transition_id, p_reason);

  return v_result;
end;
$$;

comment on function public.reassign_chore(text, text, text) is 'Single entry point for chore reassignment — always sets assigned_to_id/is_pool/status together.';
comment on function public.claim_pool_quest(text, text) is 'Race-safe self-claim of an open pool chore.';
comment on function public.submit_chore(text, text, text, text) is 'Kid/teen submits their assigned chore for review.';
comment on function public.approve_chore(text, text) is 'Row-locked, authorization-checked, atomic approve + coin payout + audit row — the action that previously had zero atomic audit trail.';
comment on function public.request_redo(text, text, text) is 'Parent/reviewer declines a submission and asks for a redo.';
