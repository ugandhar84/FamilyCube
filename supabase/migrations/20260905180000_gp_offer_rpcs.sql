-- Three atomic RPCs for the GP-offer negotiation (acceptGPOffer/
-- declineGPOffer/withdrawGPOffer in store/choreStore.ts) — these already
-- had correct two-field CAS guards (status='gp_offer_pending' AND
-- gp_offer_by_id=<the specific offering GP>) client-side, so this isn't a
-- correctness fix the way approve_chore/request_redo were; it's completing
-- the RPC layer so every assignment-adjacent write in this negotiation
-- lands with a real activity_log audit row, matching every other migrated
-- action.

create or replace function public.accept_gp_offer(p_chore_id text, p_parent_id text)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
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
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
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

  select role into v_reviewer_role from public.members where id = p_parent_id;
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
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
begin
  update public.chore_tasks
    set status = 'todo', gp_offer_by_id = null
    where id = p_chore_id and status = 'gp_offer_pending' and gp_offer_by_id = p_gp_member_id
    returning * into v_chore;

  if v_chore.id is null then
    -- Unlike accept/decline, a lost race here isn't necessarily an error —
    -- it means the offer was already resolved by someone else. Callers
    -- should treat a null id return as "already resolved, re-sync" rather
    -- than a hard failure.
    return null;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_gp_member_id, 'other', 'gp_offer_pending', 'todo', v_transition_id, 'GP withdrew their own offer');

  return v_chore;
end;
$$;

comment on function public.accept_gp_offer(text, text) is 'Parent accepts a pending GP offer — authorization-checked, two-field CAS (status + the specific offering GP), atomic assign + audit row.';
comment on function public.decline_gp_offer(text, text, text) is 'Parent declines a pending GP offer — authorization-checked, two-field CAS, reverts to todo.';
comment on function public.withdraw_gp_offer(text, text) is 'The offering GP retracts their own offer before a parent acts on it. Returns null (not an error) if the offer was already resolved by someone else.';
