-- A fresh manual sweep of every security-definer RPC taking an actor/
-- member-id parameter (querying pg_proc's actual live signatures, not
-- trusting any prior audit's completeness) found 7 more RPCs the earlier
-- identity-verification migrations (20260930260000 through 20260930330000)
-- missed. Each either had NO identity check at all (propose_later_date),
-- or only checked the named actor matches a role/party-to-the-row field
-- (assigned_to/assigned_by, assignee) WITHOUT ever confirming the actual
-- caller IS that person — the same "checks who it's for, not who it's
-- from" gap already fixed everywhere else. submit_chore is the highest-
-- stakes of these: its self-assigned-parent and redo-cap-auto-approve
-- branches pay real coins immediately, with no verification the submitter
-- is genuinely who they claim to be.

create or replace function public.cancel_locked_assignment(p_assignment_id text, p_by_member_id text)
returns parent_quest_assignments
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_assignment public.parent_quest_assignments;
  v_chore_is_adult_task boolean;
  v_transition_id uuid := gen_random_uuid();
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_by_member_id then
    raise exception 'caller is not member %', p_by_member_id;
  end if;

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

  update public.chore_tasks
    set is_pool = true
    where id = v_assignment.chore_id and category_type != 'parent_only_quest';

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    select 'parent_quest_assignment', p_assignment_id, ct.family_id::uuid, p_by_member_id, 'reopened', 'DECLINED', v_transition_id, 'reopened from locked'
    from public.chore_tasks ct where ct.id = v_assignment.chore_id;

  return v_assignment;
end;
$$;

create or replace function public.decline_kid_chore(p_chore_id text, p_reviewer_id text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_reviewer_family text;
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
  if v_chore.status != 'pending_kid_proposal' then
    raise exception 'chore % is not a pending kid proposal (status=%)', p_chore_id, v_chore.status;
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
    raise exception 'member % is not authorized to decline a kid-proposed chore', p_reviewer_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_reviewer_id, 'declined', 'pending_kid_proposal', 'declined', v_transition_id,
      coalesce(p_reason, 'kid proposal declined'));

  delete from public.chore_tasks where id = p_chore_id;
end;
$$;

create or replace function public.dispute_redo(p_chore_id text, p_member_id text)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chore public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status != 'redo_requested' then
    raise exception 'chore % has no active redo request (status=%)', p_chore_id, v_chore.status;
  end if;
  if v_chore.assigned_to_id is distinct from p_member_id then
    raise exception 'member % is not the assignee of chore %', p_member_id, p_chore_id;
  end if;

  update public.chore_tasks
    set status = 'kid_disputed_redo'
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_member_id, 'redo_disputed', 'redo_requested', 'kid_disputed_redo', v_transition_id,
      'assignee disputed the redo request — asking a second parent to review the original submission');

  return v_chore;
end;
$$;

create or replace function public.propose_later_date(p_chore_id text, p_by_member_id text, p_new_date text, p_reason text default null)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
  v_from_status text;
  v_category_type text;
  v_chore_family text;
  v_member_family text;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_by_member_id then
    raise exception 'caller is not member %', p_by_member_id;
  end if;

  select status, category_type, family_id into v_from_status, v_category_type, v_chore_family from public.chore_tasks where id = p_chore_id for update;
  if v_from_status is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  select family_id into v_member_family from public.members where id = p_by_member_id;
  if v_member_family is distinct from v_chore_family then
    raise exception 'member % is not in the same family as chore %', p_by_member_id, p_chore_id;
  end if;

  if exists (select 1 from public.chore_tasks where id = p_chore_id and pending_later_date is not null) then
    raise exception 'chore % already has a pending later-date proposal — resolve it first', p_chore_id;
  end if;

  update public.chore_tasks
    set assigned_to_id = null,
        is_pool = (v_category_type is distinct from 'parent_only_quest'),
        status = 'todo', claimed_at = null,
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

create or replace function public.respond_to_parent_quest(p_assignment_id text, p_actor_id text, p_action text, p_details text default null)
returns parent_quest_assignments
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_assignment public.parent_quest_assignments;
  v_new_status text;
  v_snooze_until timestamptz;
  v_bounce_count integer;
  v_is_locked boolean;
  v_transition_id uuid := gen_random_uuid();
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_actor_id then
    raise exception 'caller is not member %', p_actor_id;
  end if;

  select * into v_assignment from public.parent_quest_assignments where id = p_assignment_id for update;
  if v_assignment.id is null then
    raise exception 'assignment % not found', p_assignment_id;
  end if;
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

create or replace function public.set_gp_withdrawn(p_chore_id text, p_gp_member_id text, p_withdrawn boolean)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result public.chore_tasks;
  v_chore_family text;
  v_member_family text;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_gp_member_id then
    raise exception 'caller is not member %', p_gp_member_id;
  end if;

  select family_id into v_chore_family from public.chore_tasks where id = p_chore_id;
  if v_chore_family is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  select family_id into v_member_family from public.members where id = p_gp_member_id;
  if v_member_family is distinct from v_chore_family then
    raise exception 'member % is not in the same family as chore %', p_gp_member_id, p_chore_id;
  end if;

  if p_withdrawn then
    update public.chore_tasks
      set gp_withdrawn_ids = (
        select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (
          select jsonb_array_elements_text(coalesce(gp_withdrawn_ids, '[]'::jsonb)) as x
          union select p_gp_member_id
        ) s
      )
      where id = p_chore_id
      returning * into v_result;
  else
    update public.chore_tasks
      set gp_withdrawn_ids = (
        select coalesce(jsonb_agg(x), '[]'::jsonb) from (
          select jsonb_array_elements_text(coalesce(gp_withdrawn_ids, '[]'::jsonb)) as x
        ) s where x != p_gp_member_id
      )
      where id = p_chore_id
      returning * into v_result;
  end if;

  if v_result.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;

  return v_result;
end;
$$;

create or replace function public.submit_chore(p_chore_id text, p_member_id text, p_note text default null, p_photo_url text default null)
returns table(chore chore_tasks, coins_paid integer, auto_approved boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
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

  if not v_is_self_assigned_parent and coalesce(v_chore.redo_count, 0) >= 2 then
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
        case when v_is_redo_cap then format('redo cap reached (%s rounds) — auto-approved, %s coins paid', v_chore.redo_count, v_pts)
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
$$;
