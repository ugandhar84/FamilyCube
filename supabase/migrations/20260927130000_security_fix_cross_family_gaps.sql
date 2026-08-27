-- Security fix: cross-family authorization gaps across SECURITY DEFINER RPCs.
-- Found by a dedicated audit (triggered by confirming the same gap in
-- cancel_chore/reassign_chore, fixed in 20260927110000_qa_fixes_batch1.sql,
-- generalized to every other function taking a target-row id). RLS never
-- runs inside a SECURITY DEFINER function body, so each of these needed its
-- own explicit family_id comparison between the actor and the target row —
-- without it, any authenticated member of ANY family could act on ANY other
-- family's chore/event/assignment by id (approve, decline, claim, reassign,
-- read unread counts, etc). Pattern mirrors the existing reference fix:
--   select family_id into v_actor_family from members where id = p_actor_id;
--   if v_actor_family is distinct from v_target.family_id then raise exception ...
--
-- Functions fixed here, grouped by target table:
--   chore_tasks:        decline_kid_chore, approve_chore, approve_kid_chore
--                        (both overloads), propose_terms_change,
--                        request_redo, resolve_redo_dispute, decline_gp_offer,
--                        claim_pool_quest, claim_gp_errand,
--                        claim_gp_welcome_chore, set_gp_withdrawn
--   calendar_events:     assign_event_role, claim_event_slot, reassign_event,
--                        confirm_event_assignment, decline_event_assignment,
--                        add_event_passenger, remove_event_passenger,
--                        calendar_event_history
--   chat_channels:       get_unread_counts (channel ids scoped to caller's
--                        own family channels only)
--
-- propose_kid_chore already validates p_for_member_id's role but never
-- checked it's in the same family as p_family_id/p_proposer_id — fixed too.

-- ── chore_tasks: decline_kid_chore ───────────────────────────────────────
create or replace function public.decline_kid_chore(p_chore_id text, p_reviewer_id text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_reviewer_family text;
  v_transition_id uuid := gen_random_uuid();
begin
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

-- ── chore_tasks: approve_chore ───────────────────────────────────────────
create or replace function public.approve_chore(p_chore_id text, p_reviewer_id text)
returns table(chore chore_tasks, coins_paid integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_reviewer_family text;
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

  select role, family_id into v_reviewer_role, v_reviewer_family from public.members where id = p_reviewer_id;
  if v_reviewer_family is distinct from v_chore.family_id then
    raise exception 'member % is not in the same family as chore %', p_reviewer_id, p_chore_id;
  end if;
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

-- ── chore_tasks: approve_kid_chore (both overloads) ──────────────────────
create or replace function public.approve_kid_chore(p_chore_id text, p_reviewer_id text, p_coins_reward integer default 0, p_xp_reward integer default 0)
returns chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_reviewer_family text;
  v_transition_id uuid := gen_random_uuid();
begin
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
    raise exception 'member % is not authorized to approve a kid-proposed chore', p_reviewer_id;
  end if;

  update public.chore_tasks
    set status = 'todo', coins_reward = coalesce(p_coins_reward, 0), base_points = coalesce(p_coins_reward, 0),
        xp_reward = coalesce(p_xp_reward, 0), reviewed_at = now(), reviewed_by_id = p_reviewer_id
    where id = p_chore_id
    returning * into v_chore;

  update public.chore_participants
    set status = 'approved'
    where chore_id = p_chore_id and role = 'assignee';
  insert into public.chore_participants (chore_id, member_id, role, status)
    values (p_chore_id, p_reviewer_id, 'approver', 'approved')
    on conflict (chore_id, member_id, role) do update set status = 'approved';

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_reviewer_id, 'approved', 'pending_kid_proposal', 'todo', v_transition_id,
      format('kid proposal approved, %s coins set', coalesce(p_coins_reward, 0)));

  return v_chore;
end;
$$;

create or replace function public.approve_kid_chore(p_chore_id text, p_reviewer_id text, p_coins_reward integer default 0, p_xp_reward integer default 0, p_due_date text default null)
returns chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_reviewer_family text;
  v_transition_id uuid := gen_random_uuid();
begin
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
    raise exception 'member % is not authorized to approve a kid-proposed chore', p_reviewer_id;
  end if;

  update public.chore_tasks
    set status = 'todo', coins_reward = coalesce(p_coins_reward, 0), base_points = coalesce(p_coins_reward, 0),
        xp_reward = coalesce(p_xp_reward, 0), due_date = p_due_date,
        reviewed_at = now(), reviewed_by_id = p_reviewer_id
    where id = p_chore_id
    returning * into v_chore;

  update public.chore_participants
    set status = 'approved'
    where chore_id = p_chore_id and role = 'assignee';
  insert into public.chore_participants (chore_id, member_id, role, status)
    values (p_chore_id, p_reviewer_id, 'approver', 'approved')
    on conflict (chore_id, member_id, role) do update set status = 'approved';

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_reviewer_id, 'approved', 'pending_kid_proposal', 'todo', v_transition_id,
      format('kid proposal approved, %s coins set%s', coalesce(p_coins_reward, 0), case when p_due_date is not null then format(', due %s', p_due_date) else '' end));

  return v_chore;
end;
$$;

-- ── chore_tasks: propose_terms_change ─────────────────────────────────────
create or replace function public.propose_terms_change(p_chore_id text, p_by_member_id text, p_new_coins_reward integer default null, p_new_base_points integer default null, p_new_due_date text default null)
returns chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_by_role text;
  v_by_family text;
  v_transition_id uuid := gen_random_uuid();
  v_old jsonb;
  v_new jsonb;
begin
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status != 'in_progress' or v_chore.assigned_to_id is null then
    raise exception 'chore % is not a claimed chore (status=%)', p_chore_id, v_chore.status;
  end if;

  select role, family_id into v_by_role, v_by_family from public.members where id = p_by_member_id;
  if v_by_family is distinct from v_chore.family_id then
    raise exception 'member % is not in the same family as chore %', p_by_member_id, p_chore_id;
  end if;
  if v_by_role != 'parent' and not exists (
    select 1 from public.temporary_approvers
    where granted_to_member_id = p_by_member_id and family_id = v_chore.family_id
      and expires_at > now() and revoked_at is null
  ) then
    raise exception 'member % is not authorized to change terms on a claimed chore', p_by_member_id;
  end if;

  v_old := jsonb_build_object('coinsReward', v_chore.coins_reward, 'basePoints', v_chore.base_points, 'dueDate', v_chore.due_date);
  v_new := jsonb_build_object(
    'coinsReward', coalesce(p_new_coins_reward, v_chore.coins_reward),
    'basePoints',  coalesce(p_new_base_points,  v_chore.base_points),
    'dueDate',     coalesce(p_new_due_date,     v_chore.due_date)
  );

  update public.chore_tasks
    set status = 'terms_changed',
        coins_reward = coalesce(p_new_coins_reward, coins_reward),
        base_points  = coalesce(p_new_base_points,  base_points),
        due_date     = coalesce(p_new_due_date,     due_date),
        pending_terms = jsonb_build_object('old', v_old, 'new', v_new, 'changedBy', p_by_member_id, 'changedAt', now())
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_by_member_id, 'terms_changed', 'in_progress', 'terms_changed', v_transition_id,
      format('coins %s→%s, due %s→%s', v_old->>'coinsReward', v_new->>'coinsReward', v_old->>'dueDate', v_new->>'dueDate'));

  return v_chore;
end;
$$;

-- ── chore_tasks: request_redo ─────────────────────────────────────────────
create or replace function public.request_redo(p_chore_id text, p_reviewer_id text, p_reason text)
returns chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_reviewer_family text;
  v_new_redo_count integer;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status != 'pending_approval' then
    raise exception 'chore % is not pending approval (status=%)', p_chore_id, v_chore.status;
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
    raise exception 'member % is not authorized to request a redo', p_reviewer_id;
  end if;

  v_new_redo_count := coalesce(v_chore.redo_count, 0) + 1;

  update public.chore_participants
    set status = 'declined'
    where chore_id = p_chore_id and role = 'assignee';

  update public.chore_tasks
    set status = 'redo_requested', rejection_reason = p_reason, reviewed_at = now(),
        reviewed_by_id = p_reviewer_id, redo_count = v_new_redo_count
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_reviewer_id, 'declined', 'pending_approval', 'redo_requested', v_transition_id, p_reason);

  return v_chore;
end;
$$;

-- ── chore_tasks: resolve_redo_dispute ──────────────────────────────────────
create or replace function public.resolve_redo_dispute(p_chore_id text, p_reviewer_id text, p_pay boolean)
returns table(chore chore_tasks, coins_paid integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_reviewer_family text;
  v_pts integer := 0;
  v_wallet text;
  v_transition_id uuid := gen_random_uuid();
begin
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
    update public.chore_tasks
      set status = 'redo_requested'
      where id = p_chore_id
      returning * into v_chore;

    insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
      values ('chore', p_chore_id, v_chore.family_id::uuid, p_reviewer_id, 'redo_dispute_resolved', 'kid_disputed_redo', 'redo_requested', v_transition_id,
        'second parent sided with the original redo request');
  end if;

  return query select v_chore, v_pts;
end;
$$;

-- ── chore_tasks: decline_gp_offer ─────────────────────────────────────────
create or replace function public.decline_gp_offer(p_chore_id text, p_parent_id text, p_reason text default null)
returns chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_reviewer_family text;
  v_offering_gp_id text;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status != 'gp_offer_pending' or v_chore.gp_offer_by_id is null then
    raise exception 'chore % has no pending GP offer', p_chore_id;
  end if;

  select role, family_id into v_reviewer_role, v_reviewer_family from public.members where id = p_parent_id;
  if v_reviewer_family is distinct from v_chore.family_id then
    raise exception 'member % is not in the same family as chore %', p_parent_id, p_chore_id;
  end if;
  if v_reviewer_role != 'parent' and not exists (
    select 1 from public.temporary_approvers
    where granted_to_member_id = p_parent_id and family_id = v_chore.family_id
      and expires_at > now() and revoked_at is null
  ) then
    raise exception 'member % is not authorized to decline a GP offer', p_parent_id;
  end if;

  v_offering_gp_id := v_chore.gp_offer_by_id;

  update public.chore_tasks
    set status = 'todo', gp_offer_by_id = null, rejection_reason = p_reason
    where id = p_chore_id and gp_offer_by_id = v_offering_gp_id
    returning * into v_chore;

  if v_chore.id is null then
    raise exception 'chore % offer changed underneath — another action already resolved it', p_chore_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_parent_id, 'declined', 'gp_offer_pending', 'todo', v_transition_id, p_reason);

  return v_chore;
end;
$$;

-- ── chore_tasks: claim_pool_quest ──────────────────────────────────────────
create or replace function public.claim_pool_quest(p_chore_id text, p_member_id text)
returns table(claimed boolean, chore chore_tasks)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.chore_tasks;
  v_member_family text;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_result from public.chore_tasks where id = p_chore_id for update;

  if v_result.id is null or v_result.assigned_to_id is not null or not coalesce(v_result.is_pool, false) then
    return query select false, null::public.chore_tasks;
    return;
  end if;

  select family_id into v_member_family from public.members where id = p_member_id;
  if v_member_family is distinct from v_result.family_id then
    raise exception 'member % is not in the same family as chore %', p_member_id, p_chore_id;
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

-- ── chore_tasks: claim_gp_errand ───────────────────────────────────────────
create or replace function public.claim_gp_errand(p_chore_id text, p_gp_member_id text)
returns table(claimed boolean, chore chore_tasks)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.chore_tasks;
  v_member_family text;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_result from public.chore_tasks where id = p_chore_id for update;

  if v_result.id is null or not coalesce(v_result.invite_grandparents, false) or v_result.status != 'todo' then
    return query select false, null::public.chore_tasks;
    return;
  end if;

  select family_id into v_member_family from public.members where id = p_gp_member_id;
  if v_member_family is distinct from v_result.family_id then
    raise exception 'member % is not in the same family as chore %', p_gp_member_id, p_chore_id;
  end if;

  update public.chore_tasks
    set status = 'gp_offer_pending', gp_offer_by_id = p_gp_member_id
    where id = p_chore_id
    returning * into v_result;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_gp_member_id, 'other', 'todo', 'gp_offer_pending', v_transition_id, 'grandparent offered to help');

  return query select true, v_result;
end;
$$;

-- ── chore_tasks: claim_gp_welcome_chore ───────────────────────────────────
-- NOTE: this function references chore_tasks.open_to_gp, a column dropped
-- this session (dedupe_open_to_gp_column / drop_open_to_gp_column). It is
-- already dead/broken (every call fails at runtime), but is fixed here too
-- rather than left as a live cross-family gap if the column is ever
-- reintroduced or the function is ever called against a stale schema.
create or replace function public.claim_gp_welcome_chore(p_chore_id text, p_gp_member_id text)
returns table(claimed boolean, chore chore_tasks)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.chore_tasks;
  v_member_family text;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_result from public.chore_tasks where id = p_chore_id for update;

  if v_result.id is null or not coalesce(v_result.invite_grandparents, false)
     or v_result.status != 'todo' or v_result.assigned_to_id is not null then
    return query select false, null::public.chore_tasks;
    return;
  end if;

  select family_id into v_member_family from public.members where id = p_gp_member_id;
  if v_member_family is distinct from v_result.family_id then
    raise exception 'member % is not in the same family as chore %', p_gp_member_id, p_chore_id;
  end if;

  insert into public.chore_participants (chore_id, member_id, role, status)
    values (p_chore_id, p_gp_member_id, 'assignee', 'claimed')
    on conflict (chore_id, member_id, role) do nothing;

  update public.chore_tasks
    set assigned_to_id = p_gp_member_id, status = 'in_progress', is_pool = false
    where id = p_chore_id
    returning * into v_result;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_gp_member_id, 'claimed', 'todo', 'in_progress', v_transition_id, 'grandparent handling GP-welcome chore');

  return query select true, v_result;
end;
$$;

-- ── chore_tasks: set_gp_withdrawn ─────────────────────────────────────────
create or replace function public.set_gp_withdrawn(p_chore_id text, p_gp_member_id text, p_withdrawn boolean)
returns chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.chore_tasks;
  v_chore_family text;
  v_member_family text;
begin
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

-- ── chore_tasks: propose_kid_chore — family check on target member ───────
create or replace function public.propose_kid_chore(p_family_id uuid, p_proposer_id text, p_for_member_id text, p_title text, p_description text default null, p_category text default 'other')
returns chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposer_role text;
  v_proposer_family text;
  v_for_role text;
  v_for_name text;
  v_for_family text;
  v_chore public.chore_tasks;
  v_id text := 'chore_' || replace(gen_random_uuid()::text, '-', '');
  v_transition_id uuid := gen_random_uuid();
begin
  select role, family_id into v_proposer_role, v_proposer_family from public.members where id = p_proposer_id;
  if v_proposer_role is distinct from 'child' then
    raise exception 'member % is not a kid — only a kid can propose a chore this way', p_proposer_id;
  end if;
  if v_proposer_family is distinct from p_family_id::text then
    raise exception 'member % is not in family %', p_proposer_id, p_family_id;
  end if;

  select role, name, family_id into v_for_role, v_for_name, v_for_family from public.members where id = p_for_member_id;
  if v_for_role is null then
    raise exception 'target member % not found', p_for_member_id;
  end if;
  if v_for_family is distinct from p_family_id::text then
    raise exception 'target member % is not in family %', p_for_member_id, p_family_id;
  end if;
  if v_for_role in ('parent', 'grandparent') then
    raise exception 'a kid cannot propose a chore for a parent/grandparent (member % is %)', p_for_member_id, v_for_role;
  end if;

  insert into public.chore_tasks (
    id, family_id, title, description, category_type, category,
    base_points, coins_reward, bonus_coins, xp_reward,
    status, is_pool, assigned_to_id, created_by_id, created_at
  ) values (
    v_id, p_family_id, p_title, p_description, 'general', p_category,
    0, 0, 0, 0,
    'pending_kid_proposal', false, p_for_member_id, p_proposer_id, now()
  )
  returning * into v_chore;

  insert into public.chore_participants (chore_id, member_id, role, status)
    values (v_id, p_proposer_id, 'requester', null);
  insert into public.chore_participants (chore_id, member_id, role, status)
    values (v_id, p_for_member_id, 'assignee', 'pending');

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', v_id, p_family_id, p_proposer_id, 'created', null, 'pending_kid_proposal', v_transition_id,
      format('proposed by a kid, for %s', coalesce(v_for_name, 'a family member')));

  return v_chore;
end;
$$;

-- ── calendar_events: assign_event_role ────────────────────────────────────
create or replace function public.assign_event_role(p_event_id text, p_member_id text, p_role text, p_actor_id text)
returns event_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_name text;
  v_row public.event_participants;
  v_transition_id uuid := gen_random_uuid();
  v_event_family text;
  v_actor_family text;
  v_member_family text;
begin
  if p_role not in ('driver','helper') then
    raise exception 'assign_event_role only supports driver/helper roles, got %', p_role;
  end if;

  select family_id into v_event_family from public.calendar_events where id = p_event_id for update;
  if v_event_family is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id into v_actor_family from public.members where id = p_actor_id;
  if v_actor_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_actor_id, p_event_id;
  end if;
  select family_id into v_member_family from public.members where id = p_member_id;
  if v_member_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_member_id, p_event_id;
  end if;

  select name into v_member_name from public.members where id = p_member_id;

  delete from public.event_participants where event_id = p_event_id and role = p_role;

  insert into public.event_participants (event_id, member_id, member_name, role, status)
    values (p_event_id, p_member_id, v_member_name, p_role, 'pending')
    returning * into v_row;

  if p_role = 'driver' then
    update public.calendar_events set driver_name = v_member_name, driver_status = 'pending', ride_required = true,
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
  else
    update public.calendar_events set helper_name = v_member_name, helper_status = 'pending',
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    select 'event', p_event_id, ce.family_id::uuid, p_actor_id, 'driver_assigned', 'pending', v_transition_id,
      format('%s assigned as %s', v_member_name, p_role)
    from public.calendar_events ce where ce.id = p_event_id;

  return v_row;
end;
$$;

-- ── calendar_events: claim_event_slot ──────────────────────────────────────
create or replace function public.claim_event_slot(p_event_id text, p_member_id text, p_role text, p_actor_id text)
returns table(claimed boolean, participant event_participants)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_name text;
  v_existing_count integer;
  v_row public.event_participants;
  v_transition_id uuid := gen_random_uuid();
  v_event_family text;
  v_actor_family text;
begin
  if p_role not in ('driver','helper') then
    raise exception 'claim_event_slot only supports driver/helper roles, got %', p_role;
  end if;

  select family_id into v_event_family from public.calendar_events where id = p_event_id for update;
  if v_event_family is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id into v_actor_family from public.members where id = p_actor_id;
  if v_actor_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_actor_id, p_event_id;
  end if;

  select count(*) into v_existing_count from public.event_participants
    where event_id = p_event_id and role = p_role and status in ('pending','confirmed');
  if v_existing_count > 0 then
    return query select false, null::public.event_participants;
    return;
  end if;

  select name into v_member_name from public.members where id = p_member_id;

  insert into public.event_participants (event_id, member_id, member_name, role, status)
    values (p_event_id, p_member_id, v_member_name, p_role, 'confirmed')
    on conflict (event_id, member_id, role) do nothing
    returning * into v_row;

  if v_row.id is null then
    return query select false, null::public.event_participants;
    return;
  end if;

  if p_role = 'driver' then
    update public.calendar_events set driver_name = v_member_name, driver_status = 'confirmed', ride_required = true,
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
  else
    update public.calendar_events set helper_name = v_member_name, helper_status = 'confirmed',
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    select 'event', p_event_id, ce.family_id::uuid, p_actor_id, 'driver_assigned', 'confirmed', v_transition_id,
      format('%s claimed the open %s slot', v_member_name, p_role)
    from public.calendar_events ce where ce.id = p_event_id;

  return query select true, v_row;
end;
$$;

-- ── calendar_events: reassign_event ───────────────────────────────────────
create or replace function public.reassign_event(p_event_id text, p_new_member_id text, p_role text, p_actor_id text)
returns event_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_name text;
  v_status text;
  v_row public.event_participants;
  v_transition_id uuid := gen_random_uuid();
  v_prior_driver_id text;
  v_event_family text;
  v_actor_family text;
  v_new_member_family text;
begin
  select family_id into v_event_family from public.calendar_events where id = p_event_id for update;
  if v_event_family is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id into v_actor_family from public.members where id = p_actor_id;
  if v_actor_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_actor_id, p_event_id;
  end if;
  select family_id into v_new_member_family from public.members where id = p_new_member_id;
  if v_new_member_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_new_member_id, p_event_id;
  end if;

  select name into v_member_name from public.members where id = p_new_member_id;
  v_status := case when p_new_member_id = p_actor_id then 'confirmed' else 'pending' end;

  if p_role = 'driver' then
    select member_id into v_prior_driver_id
    from public.event_participants
    where event_id = p_event_id and role = 'driver'
    limit 1;
  end if;

  delete from public.event_participants where event_id = p_event_id and role = p_role;

  insert into public.event_participants (event_id, member_id, member_name, role, status, responded_at)
    values (p_event_id, p_new_member_id, v_member_name, p_role, v_status, case when v_status = 'confirmed' then now() else null end)
    returning * into v_row;

  if p_role = 'driver' then
    update public.calendar_events set driver_name = v_member_name, driver_status = v_status, ride_required = true,
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;

    if v_prior_driver_id is not null and v_prior_driver_id <> p_new_member_id then
      update public.trips
        set completed_at = now()
        where driver_member_id = v_prior_driver_id and completed_at is null;
    end if;
  else
    update public.calendar_events set helper_name = v_member_name, helper_status = v_status,
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    select 'event', p_event_id, ce.family_id::uuid, p_actor_id, 'driver_reassigned', v_status, v_transition_id,
      format('%s reassigned to %s (%s)', p_role, v_member_name, v_status)
    from public.calendar_events ce where ce.id = p_event_id;

  return v_row;
end;
$$;

-- ── calendar_events: confirm_event_assignment ─────────────────────────────
create or replace function public.confirm_event_assignment(p_event_id text, p_member_id text, p_role text)
returns event_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.event_participants;
  v_transition_id uuid := gen_random_uuid();
  v_event public.calendar_events;
  v_member_name text;
  v_event_family text;
  v_member_family text;
begin
  select family_id into v_event_family from public.calendar_events where id = p_event_id for update;
  if v_event_family is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id into v_member_family from public.members where id = p_member_id;
  if v_member_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_member_id, p_event_id;
  end if;

  update public.event_participants
    set status = 'confirmed', responded_at = now()
    where event_id = p_event_id and role = p_role and member_id = p_member_id and status = 'pending'
    returning * into v_row;

  if v_row.id is not null then
    if p_role = 'driver' then
      update public.calendar_events set driver_status = 'confirmed', updated_by = p_member_id, updated_at = now()
        where id = p_event_id;
    else
      update public.calendar_events set helper_status = 'confirmed', updated_by = p_member_id, updated_at = now()
        where id = p_event_id;
    end if;

    insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
      select 'event', p_event_id, ce.family_id::uuid, p_member_id, 'driver_reassigned', 'pending', 'confirmed', v_transition_id,
        format('%s confirmed as %s', v_row.member_name, p_role)
      from public.calendar_events ce where ce.id = p_event_id;

    return v_row;
  end if;

  select name into v_member_name from public.members where id = p_member_id;

  if p_role = 'driver' then
    update public.calendar_events
      set driver_status = 'confirmed', updated_by = p_member_id, updated_at = now()
      where id = p_event_id and driver_name = v_member_name and driver_status = 'pending'
      returning * into v_event;
  else
    update public.calendar_events
      set helper_status = 'confirmed', updated_by = p_member_id, updated_at = now()
      where id = p_event_id and helper_name = v_member_name and helper_status = 'pending'
      returning * into v_event;
  end if;

  if v_event.id is null then
    raise exception 'no pending % assignment for member % on event %', p_role, p_member_id, p_event_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('event', p_event_id, v_event.family_id::uuid, p_member_id, 'driver_reassigned', 'pending', 'confirmed', v_transition_id,
      format('%s confirmed as %s (legacy)', v_member_name, p_role));

  insert into public.event_participants (event_id, member_id, member_name, role, status, responded_at)
    values (p_event_id, p_member_id, v_member_name, p_role, 'confirmed', now())
    on conflict (event_id, member_id, role) do update set status = 'confirmed', responded_at = now()
    returning * into v_row;

  return v_row;
end;
$$;

-- ── calendar_events: decline_event_assignment ─────────────────────────────
create or replace function public.decline_event_assignment(p_event_id text, p_member_id text, p_role text, p_reason text default null)
returns calendar_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.calendar_events;
  v_category text;
  v_ride_required boolean;
  v_result public.calendar_events;
  v_transition_id uuid := gen_random_uuid();
  v_member_family text;
begin
  select * into v_event from public.calendar_events where id = p_event_id for update;
  if v_event.id is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id into v_member_family from public.members where id = p_member_id;
  if v_member_family is distinct from v_event.family_id::text then
    raise exception 'member % is not in the same family as event %', p_member_id, p_event_id;
  end if;

  v_category := v_event.category;
  v_ride_required := v_event.ride_required;

  update public.event_participants
    set status = 'rejected', decline_reason = p_reason, responded_at = now()
    where event_id = p_event_id and role = p_role and member_id = p_member_id;

  delete from public.event_participants
    where event_id = p_event_id and role = p_role and member_id = p_member_id;

  if p_role = 'driver' then
    update public.calendar_events set
      driver_name = null, driver_status = null,
      is_open_to_grandparents = case when v_category = 'Ride' or v_ride_required then true else is_open_to_grandparents end,
      is_open_to_teens        = case when v_category = 'Ride' or v_ride_required then true else is_open_to_teens end,
      updated_by = p_member_id, updated_at = now()
      where id = p_event_id
      returning * into v_result;
  else
    update public.calendar_events set
      helper_name = null, helper_status = null, helper_declined_by = p_member_id, helper_decline_reason = p_reason,
      is_open_to_grandparents = case when v_category = 'Ride' or v_ride_required then true else is_open_to_grandparents end,
      is_open_to_teens        = case when v_category = 'Ride' or v_ride_required then true else is_open_to_teens end,
      updated_by = p_member_id, updated_at = now()
      where id = p_event_id
      returning * into v_result;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    values ('event', p_event_id, v_result.family_id::uuid, p_member_id, 'driver_removed', 'rejected', v_transition_id,
      coalesce(p_reason, format('declined as %s', p_role)));

  return v_result;
end;
$$;

-- ── calendar_events: add_event_passenger ──────────────────────────────────
create or replace function public.add_event_passenger(p_event_id text, p_member_id text)
returns event_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_name text;
  v_row public.event_participants;
  v_primary_member_id text;
  v_event_family text;
  v_member_family text;
begin
  select family_id into v_event_family from public.calendar_events where id = p_event_id for update;
  if v_event_family is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id into v_member_family from public.members where id = p_member_id;
  if v_member_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_member_id, p_event_id;
  end if;

  select name into v_member_name from public.members where id = p_member_id;

  insert into public.event_participants (event_id, member_id, member_name, role)
    values (p_event_id, p_member_id, v_member_name, 'passenger')
    on conflict (event_id, member_id, role) do nothing
    returning * into v_row;

  select member_id into v_primary_member_id from public.calendar_events where id = p_event_id;
  if v_primary_member_id is null then
    update public.calendar_events set member_id = p_member_id, updated_at = now() where id = p_event_id;
  else
    update public.calendar_events
      set member_ids = (select jsonb_agg(distinct x) from (
            select jsonb_array_elements_text(coalesce(member_ids, '[]'::jsonb)) as x
            union select p_member_id
          ) s),
          updated_at = now()
      where id = p_event_id;
  end if;

  return v_row;
end;
$$;

-- ── calendar_events: remove_event_passenger ───────────────────────────────
create or replace function public.remove_event_passenger(p_event_id text, p_member_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_family text;
  v_member_family text;
begin
  select family_id into v_event_family from public.calendar_events where id = p_event_id for update;
  if v_event_family is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id into v_member_family from public.members where id = p_member_id;
  if v_member_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_member_id, p_event_id;
  end if;

  delete from public.event_participants where event_id = p_event_id and member_id = p_member_id and role = 'passenger';

  update public.calendar_events
    set member_id = case when member_id = p_member_id then null else member_id end,
        member_ids = (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
              select jsonb_array_elements_text(coalesce(member_ids, '[]'::jsonb)) as x
            ) s where x != p_member_id),
        updated_at = now()
    where id = p_event_id;
end;
$$;

-- ── calendar_events: calendar_event_history — add p_by family check ──────
-- p_by is nullable (system-generated history entries have no actor), so the
-- guard only applies when an actor id is actually supplied.
create or replace function public.calendar_event_history(p_event_id text, p_action text, p_by text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_family text;
  v_by_family text;
begin
  select family_id into v_event_family from public.calendar_events where id = p_event_id;
  if v_event_family is null then
    raise exception 'event % not found', p_event_id;
  end if;
  if p_by is not null then
    select family_id into v_by_family from public.members where id = p_by;
    if v_by_family is distinct from v_event_family::text then
      raise exception 'member % is not in the same family as event %', p_by, p_event_id;
    end if;
  end if;

  update public.calendar_events
     set history = history || jsonb_build_object(
           'at',     now(),
           'action', p_action,
           'by',     p_by,
           'note',   p_note
         )
   where id = p_event_id;
end;
$$;

-- ── chat_channels: get_unread_counts — scope to caller's own channels ────
-- p_channel_ids previously trusted the caller's list wholesale; a caller
-- could pass ANY channel id (including another family's) and read its
-- unread count. Now intersected with chat_channels.member_ids (this schema
-- has no separate membership table — membership is a jsonb array column).
create or replace function public.get_unread_counts(p_member_id text, p_channel_ids text[])
returns table(channel_id text, unread_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    cm.channel_id,
    count(*) as unread_count
  from public.chat_messages cm
  left join public.chat_channel_reads cr
    on cr.channel_id = cm.channel_id and cr.member_id = p_member_id
  where cm.channel_id = any(p_channel_ids)
    and cm.channel_id in (
      select cc.id from public.chat_channels cc
      where cc.member_ids @> to_jsonb(p_member_id::text)
    )
    and cm.sender_id != p_member_id
    and (cr.last_read_at is null or cm.created_at > cr.last_read_at)
  group by cm.channel_id
$$;
