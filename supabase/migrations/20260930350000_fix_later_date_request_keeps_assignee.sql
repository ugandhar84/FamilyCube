-- Live QA finding: propose_later_date released the chore to the open pool
-- IMMEDIATELY, before a parent had even responded — anyone else could grab
-- it out from under the requester while the request was still pending.
-- Worse, approve_later_date never gave it back on approval, and
-- decline_later_date never gave it back on decline either — "declined, kid
-- keeps their original date" was only half true, since the chore itself
-- may have already been claimed by someone else in the meantime.
--
-- Fix: a pending later-date request no longer touches assigned_to_id/
-- is_pool at all — the requester keeps the chore while the request is
-- outstanding (matching every other "asking for a change" flow in this
-- app, e.g. propose_terms_change, which also never releases the chore
-- just for being asked about). Approve and decline both simply resolve
-- the pending fields; the chore was never anyone else's to lose.
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
  v_chore_family text;
  v_member_family text;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_by_member_id then
    raise exception 'caller is not member %', p_by_member_id;
  end if;

  select status, family_id into v_from_status, v_chore_family from public.chore_tasks where id = p_chore_id for update;
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
    set pending_later_date = p_new_date,
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

  -- The chore was never released while pending (see propose_later_date's
  -- own comment) — nothing to restore, just resolve the pending fields
  -- and apply the new date. assigned_to_id is left exactly as it was.
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

  -- Genuinely a no-op on assignment now — the chore was never released,
  -- so "declined, kept the original date" is finally actually true.
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
