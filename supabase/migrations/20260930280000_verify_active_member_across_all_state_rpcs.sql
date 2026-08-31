-- Extends the resolve_active_member_id() identity check (already applied
-- to confirm_event_assignment/decline_event_assignment/reassign_event in
-- 20260930260000, and made actually meaningful for two-parent families in
-- 20260930270000) to every other state-transition RPC that takes a
-- client-supplied "who is acting" id and only ever checked it belonged to
-- the right FAMILY, never that it was really the caller. Full audit list
-- and reasoning: see the master-flow-v2 gap-register review this session.
--
-- Each function below is otherwise byte-for-byte identical to its current
-- live definition — the only addition is the resolve_active_member_id()
-- guard, placed as the first check in the function body, before any row
-- locking or side effects.
--
-- Parameter that gets checked, per function (the "who is really doing
-- this" field — NOT necessarily every id param; e.g. claim_event_slot's
-- p_member_id is who a slot is being claimed FOR and can legitimately
-- differ from the actor when a parent claims on behalf of a kid, so only
-- p_actor_id is checked there, matching reassign_event's existing pattern):
--   accept_chore_handoff/decline_chore_handoff  -> p_member_id
--   offer_chore_handoff                          -> p_by_member_id
--   accept_gp_offer/decline_gp_offer             -> p_parent_id
--   withdraw_gp_offer                            -> p_gp_member_id
--   request_redo/resolve_redo_dispute            -> p_reviewer_id
--   approve_chore/approve_kid_chore (both overloads) -> p_reviewer_id
--   approve_later_date/decline_later_date        -> p_parent_id
--   accept_terms_change/reject_terms_change      -> p_member_id
--   propose_terms_change (both overloads)        -> p_by_member_id
--   cancel_chore                                 -> p_by_member_id
--   claim_event_slot/assign_event_role/
--     add_event_passenger/remove_event_passenger -> p_actor_id
--   claim_bounty_slot/claim_pool_quest           -> p_member_id
--   claim_gp_errand/claim_gp_welcome_chore       -> p_gp_member_id

create or replace function public.accept_chore_handoff(p_chore_id text, p_member_id text)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
  v_from_status text;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  select * into v_result from public.chore_tasks where id = p_chore_id for update;
  if v_result.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_result.pending_handoff_to is distinct from p_member_id then
    raise exception 'chore % has no pending handoff to member %', p_chore_id, p_member_id;
  end if;
  v_from_status := v_result.status;

  update public.chore_participants
    set status = 'claimed'
    where chore_id = p_chore_id and member_id = p_member_id and role = 'assignee';

  update public.chore_tasks
    set assigned_to_id = p_member_id, is_pool = false, status = 'todo',
        claimed_at = now(),
        pending_handoff_to = null, pending_handoff_reason = null,
        pending_handoff_offered_by = null, pending_handoff_offered_at = null
    where id = p_chore_id
    returning * into v_result;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_member_id, 'handoff_accepted', v_from_status, v_result.status, v_transition_id, 'accepted handoff');

  return v_result;
end;
$$;

create or replace function public.decline_chore_handoff(p_chore_id text, p_member_id text)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
  v_from_status text;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  select * into v_result from public.chore_tasks where id = p_chore_id for update;
  if v_result.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_result.pending_handoff_to is distinct from p_member_id then
    raise exception 'chore % has no pending handoff to member %', p_chore_id, p_member_id;
  end if;
  v_from_status := v_result.status;

  delete from public.chore_participants where chore_id = p_chore_id and role = 'assignee' and member_id = p_member_id;

  update public.chore_tasks
    set assigned_to_id = null, is_pool = true, status = 'todo',
        pending_handoff_to = null, pending_handoff_reason = null,
        pending_handoff_offered_by = null, pending_handoff_offered_at = null
    where id = p_chore_id
    returning * into v_result;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_member_id, 'handoff_declined', v_from_status, v_result.status, v_transition_id, 'declined handoff, back to pool');

  return v_result;
end;
$$;

create or replace function public.offer_chore_handoff(p_chore_id text, p_to_member_id text, p_by_member_id text, p_reason text default null)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
  v_to_name text;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_by_member_id then
    raise exception 'caller is not member %', p_by_member_id;
  end if;

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

create or replace function public.accept_gp_offer(p_chore_id text, p_parent_id text)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_offering_gp_id text;
  v_transition_id uuid := gen_random_uuid();
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_parent_id then
    raise exception 'caller is not member %', p_parent_id;
  end if;

  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status != 'gp_offer_pending' or v_chore.gp_offer_by_id is null then
    raise exception 'chore % has no pending GP offer', p_chore_id;
  end if;

  select role into v_reviewer_role from public.members where id = p_parent_id;
  if v_reviewer_role != 'parent' and not exists (
    select 1 from public.temporary_approvers
    where granted_to_member_id = p_parent_id and family_id = v_chore.family_id
      and expires_at > now() and revoked_at is null
  ) then
    raise exception 'member % is not authorized to accept a GP offer', p_parent_id;
  end if;

  v_offering_gp_id := v_chore.gp_offer_by_id;

  update public.chore_participants set status = 'declined' where chore_id = p_chore_id and role = 'assignee';
  insert into public.chore_participants (chore_id, member_id, role, status)
    values (p_chore_id, v_offering_gp_id, 'assignee', 'claimed')
    on conflict (chore_id, member_id, role) do update set status = 'claimed';

  update public.chore_tasks
    set status = 'in_progress', assigned_to_id = v_offering_gp_id, gp_offer_by_id = null, is_pool = false
    where id = p_chore_id and gp_offer_by_id = v_offering_gp_id
    returning * into v_chore;

  if v_chore.id is null then
    raise exception 'chore % offer changed underneath — another action already resolved it', p_chore_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_parent_id, 'reassigned', 'gp_offer_pending', 'in_progress', v_transition_id, 'GP offer accepted');

  return v_chore;
end;
$$;

create or replace function public.decline_gp_offer(p_chore_id text, p_parent_id text, p_reason text default null)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_reviewer_family text;
  v_offering_gp_id text;
  v_transition_id uuid := gen_random_uuid();
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_parent_id then
    raise exception 'caller is not member %', p_parent_id;
  end if;

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

create or replace function public.withdraw_gp_offer(p_chore_id text, p_gp_member_id text)
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
  if v_active_member_id is null or v_active_member_id is distinct from p_gp_member_id then
    raise exception 'caller is not member %', p_gp_member_id;
  end if;

  update public.chore_tasks
    set status = 'todo', gp_offer_by_id = null
    where id = p_chore_id and status = 'gp_offer_pending' and gp_offer_by_id = p_gp_member_id
    returning * into v_chore;

  if v_chore.id is null then
    return null;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_gp_member_id, 'other', 'gp_offer_pending', 'todo', v_transition_id, 'GP withdrew their own offer');

  return v_chore;
end;
$$;

create or replace function public.request_redo(p_chore_id text, p_reviewer_id text, p_reason text)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_reviewer_family text;
  v_new_redo_count integer;
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

  -- Was uncapped — a parent could call this a 3rd+ time on the same chore,
  -- which the spec says should instead route to a second-parent dispute,
  -- not another plain redo request. submit_chore's own redo_count>=2 check
  -- already force-approves on the kid's 3rd submission either way, so this
  -- never looped forever in practice, but the explicit cap here matches
  -- the design intent exactly rather than relying on that side effect.
  if coalesce(v_chore.redo_count, 0) >= 2 then
    raise exception 'chore % has already had 2 redo rounds — resolve via resolve_redo_dispute instead', p_chore_id;
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

create or replace function public.resolve_redo_dispute(p_chore_id text, p_reviewer_id text, p_pay boolean)
returns table(chore chore_tasks, coins_paid integer)
language plpgsql
security definer
set search_path to 'public'
as $$
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

create or replace function public.approve_chore(p_chore_id text, p_reviewer_id text)
returns table(chore chore_tasks, coins_paid integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_reviewer_family text;
  v_pts integer;
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

create or replace function public.approve_kid_chore(p_chore_id text, p_reviewer_id text, p_coins_reward integer default 0, p_xp_reward integer default 0)
returns chore_tasks
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

create or replace function public.approve_later_date(p_chore_id text, p_parent_id text)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result public.chore_tasks;
  v_role text;
  v_transition_id uuid := gen_random_uuid();
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_parent_id then
    raise exception 'caller is not member %', p_parent_id;
  end if;

  select role into v_role from public.members where id = p_parent_id;
  if v_role != 'parent' and not exists (
    select 1 from public.temporary_approvers
    where granted_to_member_id = p_parent_id
      and expires_at > now() and revoked_at is null
  ) then
    raise exception 'member % is not authorized to approve a reschedule', p_parent_id;
  end if;

  select * into v_result from public.chore_tasks where id = p_chore_id for update;
  if v_result.id is null or v_result.pending_later_date is null then
    raise exception 'chore % has no pending later-date proposal', p_chore_id;
  end if;

  update public.chore_tasks
    set due_date = v_result.pending_later_date,
        pending_later_date = null, pending_later_reason = null,
        pending_later_requested_by = null, pending_later_requested_at = null
    where id = p_chore_id
    returning * into v_result;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_parent_id, 'later_approved', v_result.status, v_result.status, v_transition_id,
      format('approved new date %s', v_result.due_date));

  return v_result;
end;
$$;

create or replace function public.decline_later_date(p_chore_id text, p_parent_id text)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result public.chore_tasks;
  v_role text;
  v_transition_id uuid := gen_random_uuid();
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_parent_id then
    raise exception 'caller is not member %', p_parent_id;
  end if;

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

create or replace function public.accept_terms_change(p_chore_id text, p_member_id text)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chore public.chore_tasks;
  v_new_coins integer;
  v_new_base_points integer;
  v_new_due_date text;
  v_new_due_time text;
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
  if v_chore.status != 'terms_changed' then
    raise exception 'chore % has no pending terms change (status=%)', p_chore_id, v_chore.status;
  end if;
  if v_chore.assigned_to_id is distinct from p_member_id then
    raise exception 'member % is not the current claimant of chore %', p_member_id, p_chore_id;
  end if;

  v_new_coins := (v_chore.pending_terms->'new'->>'coinsReward')::integer;
  v_new_base_points := (v_chore.pending_terms->'new'->>'basePoints')::integer;
  v_new_due_date := v_chore.pending_terms->'new'->>'dueDate';
  v_new_due_time := v_chore.pending_terms->'new'->>'dueTime';

  update public.chore_tasks
    set status = 'in_progress', pending_terms = null,
        coins_reward = coalesce(v_new_coins, coins_reward),
        base_points = coalesce(v_new_base_points, base_points),
        due_date = coalesce(v_new_due_date, due_date),
        due_time = v_new_due_time
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_member_id, 'terms_accepted', 'terms_changed', 'in_progress', v_transition_id, 'claimant accepted the new terms');

  return v_chore;
end;
$$;

create or replace function public.reject_terms_change(p_chore_id text, p_member_id text)
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
  if v_chore.status != 'terms_changed' then
    raise exception 'chore % has no pending terms change (status=%)', p_chore_id, v_chore.status;
  end if;
  if v_chore.assigned_to_id is distinct from p_member_id then
    raise exception 'member % is not the current claimant of chore %', p_member_id, p_chore_id;
  end if;

  update public.chore_tasks
    set status = 'todo', assigned_to_id = null,
        is_pool = (v_chore.category_type is distinct from 'parent_only_quest'),
        pending_terms = null
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_member_id, 'terms_rejected', 'todo', v_transition_id, 'terms changed, handed back — kept original terms');

  return v_chore;
end;
$$;

create or replace function public.propose_terms_change(p_chore_id text, p_by_member_id text, p_new_coins_reward integer default null, p_new_base_points integer default null, p_new_due_date text default null)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chore public.chore_tasks;
  v_by_role text;
  v_by_family text;
  v_transition_id uuid := gen_random_uuid();
  v_old jsonb;
  v_new jsonb;
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

create or replace function public.propose_terms_change(p_chore_id text, p_by_member_id text, p_new_coins_reward integer default null, p_new_base_points integer default null, p_new_due_date text default null, p_new_due_time text default null)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chore public.chore_tasks;
  v_by_role text;
  v_by_family text;
  v_transition_id uuid := gen_random_uuid();
  v_old jsonb;
  v_new jsonb;
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

  v_old := jsonb_build_object('coinsReward', v_chore.coins_reward, 'basePoints', v_chore.base_points, 'dueDate', v_chore.due_date, 'dueTime', v_chore.due_time);
  v_new := jsonb_build_object(
    'coinsReward', coalesce(p_new_coins_reward, v_chore.coins_reward),
    'basePoints',  coalesce(p_new_base_points,  v_chore.base_points),
    'dueDate',     coalesce(p_new_due_date,     v_chore.due_date),
    'dueTime',     coalesce(p_new_due_time,     v_chore.due_time)
  );

  update public.chore_tasks
    set status = 'terms_changed',
        pending_terms = jsonb_build_object('old', v_old, 'new', v_new, 'changedBy', p_by_member_id, 'changedAt', now())
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_by_member_id, 'terms_changed', 'in_progress', 'terms_changed', v_transition_id,
      format('proposed coins %s→%s, due %s→%s', v_old->>'coinsReward', v_new->>'coinsReward', v_old->>'dueDate', v_new->>'dueDate'));

  return v_chore;
end;
$$;

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

-- decline_event_assignment previously reopened BOTH is_open_to_grandparents
-- and is_open_to_teens on any Ride decline, regardless of who declined —
-- master-flow-v2 gap #22 says dropping a claimed ride should return it
-- ONLY to the pool the decliner came from (a GP dropping it goes back to
-- the GP pool, not also thrown open to teens who never had it). Now scoped
-- by the declining member's own role.
create or replace function public.decline_event_assignment(p_event_id text, p_member_id text, p_role text, p_reason text default null)
returns calendar_events
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_event public.calendar_events;
  v_category text;
  v_ride_required boolean;
  v_result public.calendar_events;
  v_transition_id uuid := gen_random_uuid();
  v_member_family text;
  v_member_role text;
  v_active_member_id text;
  v_reopen_gp boolean;
  v_reopen_teens boolean;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  select * into v_event from public.calendar_events where id = p_event_id for update;
  if v_event.id is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id, role into v_member_family, v_member_role from public.members where id = p_member_id;
  if v_member_family is distinct from v_event.family_id::text then
    raise exception 'member % is not in the same family as event %', p_member_id, p_event_id;
  end if;

  v_category := v_event.category;
  v_ride_required := v_event.ride_required;
  -- Only reopen the pool the decliner actually came from. A parent (or any
  -- non-GP/non-teen role) declining a directly-assigned ride still reopens
  -- both, matching prior behavior for that case — there's no "pool of
  -- origin" to narrow to when the assignment didn't come from either pool.
  v_reopen_gp := (v_category = 'Ride' or v_ride_required) and (v_member_role != 'teenager');
  v_reopen_teens := (v_category = 'Ride' or v_ride_required) and (v_member_role != 'grandparent');

  update public.event_participants
    set status = 'rejected', decline_reason = p_reason, responded_at = now()
    where event_id = p_event_id and role = p_role and member_id = p_member_id;

  delete from public.event_participants
    where event_id = p_event_id and role = p_role and member_id = p_member_id;

  if p_role = 'driver' then
    update public.calendar_events set
      driver_name = null, driver_status = null,
      is_open_to_grandparents = case when v_reopen_gp then true else is_open_to_grandparents end,
      is_open_to_teens        = case when v_reopen_teens then true else is_open_to_teens end,
      updated_by = p_member_id, updated_at = now()
      where id = p_event_id
      returning * into v_result;
  else
    update public.calendar_events set
      helper_name = null, helper_status = null, helper_declined_by = p_member_id, helper_decline_reason = p_reason,
      is_open_to_grandparents = case when v_reopen_gp then true else is_open_to_grandparents end,
      is_open_to_teens        = case when v_reopen_teens then true else is_open_to_teens end,
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

create or replace function public.claim_event_slot(p_event_id text, p_member_id text, p_role text, p_actor_id text)
returns table(claimed boolean, participant event_participants)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member_name text;
  v_existing_count integer;
  v_row public.event_participants;
  v_transition_id uuid := gen_random_uuid();
  v_event_family text;
  v_actor_family text;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_actor_id then
    raise exception 'caller is not member %', p_actor_id;
  end if;

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

create or replace function public.assign_event_role(p_event_id text, p_member_id text, p_role text, p_actor_id text)
returns event_participants
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member_name text;
  v_member_role text;
  v_row public.event_participants;
  v_transition_id uuid := gen_random_uuid();
  v_event_family text;
  v_actor_family text;
  v_member_family text;
  v_open_to_gp boolean;
  v_open_to_teens boolean;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_actor_id then
    raise exception 'caller is not member %', p_actor_id;
  end if;

  if p_role not in ('driver','helper') then
    raise exception 'assign_event_role only supports driver/helper roles, got %', p_role;
  end if;

  select family_id, is_open_to_grandparents, is_open_to_teens
    into v_event_family, v_open_to_gp, v_open_to_teens
    from public.calendar_events where id = p_event_id for update;
  if v_event_family is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id into v_actor_family from public.members where id = p_actor_id;
  if v_actor_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_actor_id, p_event_id;
  end if;
  select family_id, role into v_member_family, v_member_role from public.members where id = p_member_id;
  if v_member_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_member_id, p_event_id;
  end if;

  if v_member_role = 'grandparent' and coalesce(v_open_to_gp, false) is not true then
    raise exception 'not_open_to_grandparents: member % is not a valid driver/helper for this event', p_member_id
      using errcode = 'P0001';
  end if;
  if v_member_role = 'teenager' and coalesce(v_open_to_teens, false) is not true then
    raise exception 'not_open_to_teens: member % is not a valid driver/helper for this event', p_member_id
      using errcode = 'P0001';
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

create or replace function public.add_event_passenger(p_event_id text, p_member_id text, p_actor_id text)
returns event_participants
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member_name text;
  v_row public.event_participants;
  v_primary_member_id text;
  v_event_family text;
  v_actor_family text;
  v_member_family text;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_actor_id then
    raise exception 'caller is not member %', p_actor_id;
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

create or replace function public.remove_event_passenger(p_event_id text, p_member_id text, p_actor_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_event_family text;
  v_actor_family text;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_actor_id then
    raise exception 'caller is not member %', p_actor_id;
  end if;

  select family_id into v_event_family from public.calendar_events where id = p_event_id for update;
  if v_event_family is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id into v_actor_family from public.members where id = p_actor_id;
  if v_actor_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_actor_id, p_event_id;
  end if;

  delete from public.event_participants where event_id = p_event_id and member_id = p_member_id and role = 'passenger';

  update public.calendar_events
    set member_ids = (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
          select jsonb_array_elements_text(coalesce(member_ids, '[]'::jsonb)) as x
        ) s where x != p_member_id),
        updated_at = now()
    where id = p_event_id;
end;
$$;

create or replace function public.claim_bounty_slot(p_chore_id text, p_member_id text)
returns table(claimed boolean, claim_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_max integer;
  v_current integer;
  v_new_id uuid;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  select max_claimants into v_max from chore_tasks where id = p_chore_id for update;
  if v_max is null then
    return query select false, null::uuid;
    return;
  end if;

  select count(*) into v_current from bounty_claims
    where chore_id = p_chore_id and status != 'declined';

  if v_current >= v_max then
    return query select false, null::uuid;
    return;
  end if;

  insert into bounty_claims (chore_id, member_id, status)
    values (p_chore_id, p_member_id, 'in_progress')
    on conflict (chore_id, member_id) do nothing
    returning id into v_new_id;

  if v_new_id is null then
    return query select false, null::uuid;
    return;
  end if;

  return query select true, v_new_id;
end;
$$;

create or replace function public.claim_pool_quest(p_chore_id text, p_member_id text)
returns table(claimed boolean, chore chore_tasks)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result public.chore_tasks;
  v_member_family text;
  v_transition_id uuid := gen_random_uuid();
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

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

create or replace function public.claim_gp_errand(p_chore_id text, p_gp_member_id text)
returns table(claimed boolean, chore chore_tasks)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result public.chore_tasks;
  v_member_family text;
  v_transition_id uuid := gen_random_uuid();
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_gp_member_id then
    raise exception 'caller is not member %', p_gp_member_id;
  end if;

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

create or replace function public.claim_gp_welcome_chore(p_chore_id text, p_gp_member_id text)
returns table(claimed boolean, chore chore_tasks)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result public.chore_tasks;
  v_member_family text;
  v_transition_id uuid := gen_random_uuid();
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_gp_member_id then
    raise exception 'caller is not member %', p_gp_member_id;
  end if;

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
    set status = 'in_progress', assigned_to_id = p_gp_member_id, is_pool = false
    where id = p_chore_id
    returning * into v_result;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_gp_member_id, 'claimed', 'todo', 'in_progress', v_transition_id, 'grandparent handling GP-welcome chore');

  return query select true, v_result;
end;
$$;
