-- "Ask for a later time" (CantMakeItSheet's 'later' outcome) previously
-- called a plain updateChore patch that unconditionally released the
-- assignee AND rewrote due_date immediately — despite the UI's own copy
-- ("Goes back to a parent to re-time") implying an approval step that
-- never actually existed. This adds the real pending state: the proposed
-- date sits awaiting a parent's Approve/Decline, the chore's actual
-- due_date is untouched until then.
alter table public.chore_tasks
  add column if not exists pending_later_date text,
  add column if not exists pending_later_reason text,
  add column if not exists pending_later_requested_by text references public.members(id) on delete set null,
  add column if not exists pending_later_requested_at timestamptz;

comment on column public.chore_tasks.pending_later_date is
  'Set by propose_later_date — a requested new due_date awaiting parent Approve/Decline via approve_later_date/decline_later_date. due_date itself is untouched until approved.';

-- ── propose_later_date ───────────────────────────────────────────────────
-- Releases the chore back to unassigned/todo (same as any other decline —
-- it's genuinely not happening at the original time on the original
-- assignee's plate) but does NOT touch due_date; that only changes on
-- approval.
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

  if v_result.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_by_member_id, 'later_proposed', v_from_status, v_result.status, v_transition_id,
      format('proposed new date %s: %s', p_new_date, coalesce(p_reason, '')));

  return v_result;
end;
$$;

-- ── approve_later_date ───────────────────────────────────────────────────
create or replace function public.approve_later_date(p_chore_id text, p_parent_id text)
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

-- ── decline_later_date ───────────────────────────────────────────────────
-- Clears the proposal only — the chore stays exactly where it landed after
-- propose_later_date (unassigned, original due_date), a parent can then
-- reassign/edit it normally like any other unclaimed todo chore.
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

  update public.chore_tasks
    set pending_later_date = null, pending_later_reason = null,
        pending_later_requested_by = null, pending_later_requested_at = null
    where id = p_chore_id
    returning * into v_result;

  if v_result.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_parent_id, 'later_declined', v_result.status, v_result.status, v_transition_id, 'kept original date');

  return v_result;
end;
$$;

comment on function public.propose_later_date(text, text, text, text) is 'Master-flow "ask for a later time" — releases the chore and records a proposed new date awaiting parent approval; due_date itself is untouched until approve_later_date runs.';
comment on function public.approve_later_date(text, text) is 'Parent (or active temporary approver) approves a pending later-date proposal — only now does due_date actually change.';
comment on function public.decline_later_date(text, text) is 'Parent (or active temporary approver) declines a pending later-date proposal — clears it, original due_date stands.';
