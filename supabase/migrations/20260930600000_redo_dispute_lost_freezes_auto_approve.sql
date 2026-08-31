-- Real bug found by a deep exploratory QA trace of Chores: submit_chore
-- auto-approves and pays out once redo_count >= 2, regardless of HOW
-- those redo rounds came about. resolve_redo_dispute's "second parent
-- sides with the original redo request" branch (p_pay=false) sends the
-- chore back to redo_requested without touching redo_count at all — but
-- redo_count was already incremented by request_redo before the dispute
-- ever happened. A kid who disputes a redo and loses (twice) still gets
-- auto-approved and paid on their next resubmit, because the redo-cap
-- counter kept climbing regardless of the dispute's outcome — completely
-- undoing the second parent's verdict that the work genuinely needed
-- redoing.
--
-- Fix: track disputed-and-lost redo rounds separately
-- (redo_disputes_lost) and require submit_chore's redo-cap check to only
-- count rounds that were NOT the subject of a lost dispute — a kid
-- shouldn't be able to force auto-approval by repeatedly disputing and
-- losing.
alter table public.chore_tasks
  add column if not exists redo_disputes_lost integer not null default 0;

create or replace function public.resolve_redo_dispute(p_chore_id text, p_reviewer_id text, p_pay boolean)
returns table(chore chore_tasks, coins_paid integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_reviewer_family text;
  v_pts integer := 0;
  v_wallet text;
  v_transition_id uuid := gen_random_uuid();
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_reviewer_id then
    raise exception 'caller is not member %', p_reviewer_id;
  end if;

  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status != 'kid_disputed_redo' then
    raise exception 'chore % has no pending redo dispute (status=%)', p_chore_id, v_chore.status;
  end if;

  select role, family_id into v_reviewer_role, v_reviewer_family from public.members where id = p_reviewer_id;
  if v_reviewer_family is distinct from v_chore.family_id then
    raise exception 'member % is not in the same family as chore %', p_reviewer_id, p_chore_id;
  end if;
  if v_reviewer_role != 'parent' and not exists (
    select 1 from public.temporary_approvers
    where granted_to_member_id = p_reviewer_id and family_id = v_chore.family_id
      and expires_at > now() and revoked_at is null
  ) then
    raise exception 'member % is not authorized to resolve a redo dispute', p_reviewer_id;
  end if;
  if v_chore.reviewed_by_id is not null and v_chore.reviewed_by_id = p_reviewer_id then
    raise exception 'member % requested this redo — a different parent must resolve the dispute', p_reviewer_id;
  end if;

  if p_pay then
    v_pts := coalesce(nullif(v_chore.base_points, 0), v_chore.coins_reward, 0) + coalesce(v_chore.bonus_coins, 0);
    v_wallet := case when v_chore.category_type = 'grandparent_quest' or v_chore.sponsor_user_id is not null then 'gp' else 'main' end;

    update public.chore_tasks
      set status = 'approved', approved_at = now()::text, reviewed_at = now(), reviewed_by_id = p_reviewer_id
      where id = p_chore_id
      returning * into v_chore;

    if v_pts > 0 and v_chore.assigned_to_id is not null and not coalesce(v_chore.reward_pending_review, false) then
      perform public.award_coins(v_chore.assigned_to_id, v_pts, coalesce(v_chore.xp_reward, 0), v_wallet);
    else
      v_pts := 0;
    end if;

    insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
      values ('chore', p_chore_id, v_chore.family_id::uuid, p_reviewer_id, 'redo_dispute_resolved', 'kid_disputed_redo', 'approved', v_transition_id,
        format('second parent sided with the kid — approved the original submission, %s coins paid', v_pts));
  else
    -- Kid disputed and lost — this redo round genuinely needs to happen
    -- for real. Mark it as a lost-dispute round so submit_chore's redo-cap
    -- check doesn't count it toward auto-approval; a kid shouldn't be able
    -- to force a payout by repeatedly disputing and losing.
    update public.chore_tasks
      set status = 'redo_requested', redo_disputes_lost = coalesce(redo_disputes_lost, 0) + 1
      where id = p_chore_id
      returning * into v_chore;

    insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
      values ('chore', p_chore_id, v_chore.family_id::uuid, p_reviewer_id, 'redo_dispute_resolved', 'kid_disputed_redo', 'redo_requested', v_transition_id,
        'second parent sided with the original redo request');
  end if;

  return query select v_chore, v_pts;
end;
$function$;

create or replace function public.submit_chore(p_chore_id text, p_member_id text, p_note text default null, p_photo_url text default null)
returns table(chore chore_tasks, coins_paid integer, auto_approved boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_chore public.chore_tasks;
  v_member_role text;
  v_creator_role text;
  v_is_self_assigned_parent boolean := false;
  v_is_redo_cap boolean := false;
  v_pts integer := 0;
  v_wallet text;
  v_transition_id uuid := gen_random_uuid();
  v_expiry timestamptz;
  v_from_status text;
  v_active_member_id text;
  v_effective_redo_count integer;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  v_from_status := v_chore.status;
  if v_chore.assigned_to_id is distinct from p_member_id then
    raise exception 'member % is not the assignee of chore %', p_member_id, p_chore_id;
  end if;
  if v_chore.status not in ('todo', 'in_progress', 'redo_requested') then
    raise exception 'chore % is not submittable (status=%)', p_chore_id, v_chore.status;
  end if;

  if coalesce(v_chore.requires_photo, false) and p_photo_url is null and v_chore.submission_photo_url is null then
    raise exception 'chore % requires a photo to submit', p_chore_id;
  end if;

  if v_chore.created_by_id is not null and v_chore.created_by_id = v_chore.assigned_to_id then
    select role into v_creator_role from public.members where id = v_chore.created_by_id;
    v_is_self_assigned_parent := v_creator_role = 'parent';
  end if;

  -- Real bug fixed: a redo round the kid disputed and LOST still needs to
  -- happen for real — it shouldn't count toward the auto-approve cap, or
  -- a kid could force a payout by repeatedly disputing and losing instead
  -- of actually redoing the work.
  v_effective_redo_count := coalesce(v_chore.redo_count, 0) - coalesce(v_chore.redo_disputes_lost, 0);
  if not v_is_self_assigned_parent and v_effective_redo_count >= 2 then
    v_is_redo_cap := true;
  end if;

  if v_is_self_assigned_parent or v_is_redo_cap then
    v_pts := coalesce(nullif(v_chore.base_points, 0), v_chore.coins_reward, 0) + coalesce(v_chore.bonus_coins, 0);
    v_wallet := case when v_chore.category_type = 'grandparent_quest' or v_chore.sponsor_user_id is not null then 'gp' else 'main' end;

    update public.chore_tasks
      set status = case when v_is_self_assigned_parent then 'approved' else 'auto_approved' end,
          approved_at = now()::text, reviewed_at = now(),
          submission_note = coalesce(p_note, submission_note),
          submission_photo_url = coalesce(p_photo_url, submission_photo_url),
          submitted_at = now()
      where id = p_chore_id
      returning * into v_chore;

    if v_pts > 0 and not coalesce(v_chore.reward_pending_review, false) then
      perform public.award_coins(v_chore.assigned_to_id, v_pts, coalesce(v_chore.xp_reward, 0), v_wallet);
    else
      v_pts := 0;
    end if;

    insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
      values ('chore', p_chore_id, v_chore.family_id::uuid, p_member_id,
        case when v_is_self_assigned_parent then 'approved' else 'auto_approved' end,
        v_from_status, v_chore.status, v_transition_id,
        case when v_is_redo_cap then format('redo cap reached (%s rounds) — auto-approved, %s coins paid', v_effective_redo_count, v_pts)
             else format('self-assigned by a parent, %s coins paid', v_pts) end);

    return query select v_chore, v_pts, v_is_redo_cap;
    return;
  end if;

  v_expiry := now() + interval '24 hours';
  update public.chore_tasks
    set status = 'pending_approval',
        submission_note = coalesce(p_note, submission_note),
        submission_photo_url = coalesce(p_photo_url, submission_photo_url),
        submitted_at = now(),
        approval_window_expires_at = v_expiry
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_member_id, 'submitted', v_from_status, 'pending_approval', v_transition_id, 'submitted for review');

  return query select v_chore, 0, false;
end;
$function$;
