-- Named handoff ("hand it to a specific person") from CantMakeItSheet's
-- reassign outcome was a forced, immediate reassignment — reassign_chore
-- sets assigned_to_id straight away, so the receiver's chore just appeared
-- live/workable with zero say in it. The master-flow spec explicitly wants
-- a real offer: stays with the OUTGOING assignee (or, if the outgoing
-- assignee already released it, stays flagged pending) until the receiver
-- either Accepts ("I've got it") or Passes again ("can't either — put it
-- back", which reopens to the pool, same as any other decline).
--
-- chore_participants already had the right shape for this (a 'pending'
-- assignee row inserted by reassign_chore) but nothing ever read it — this
-- adds the columns actually needed to gate visibility/action cleanly on
-- chore_tasks itself (matching how every other pending-state concept in
-- this table already works, e.g. gp_offer_by_id/gp_withdrawn_ids) rather
-- than requiring every read site to join chore_participants.
alter table public.chore_tasks
  add column if not exists pending_handoff_to text references public.members(id) on delete set null,
  add column if not exists pending_handoff_reason text,
  add column if not exists pending_handoff_offered_by text references public.members(id) on delete set null,
  add column if not exists pending_handoff_offered_at timestamptz;

comment on column public.chore_tasks.pending_handoff_to is
  'Set by offer_chore_handoff — a named handoff awaiting this member''s Accept/Pass-again response. The chore stays assigned to whoever it was before (or unassigned/pool, if offered from an already-released state) until resolved.';

-- ── offer_chore_handoff ──────────────────────────────────────────────────
-- Replaces reassign_chore for the specific "hand it to a specific person"
-- CantMakeItSheet outcome — does NOT touch assigned_to_id/status at all,
-- only records the offer. reassign_chore itself is untouched and still
-- correct for its other, already-immediate callers (parent directly
-- reassigning an unclaimed/no-response-needed chore).
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
begin
  select * into v_result from public.chore_tasks where id = p_chore_id for update;
  if v_result.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;

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
      format('offered to member %s', p_to_member_id));

  return v_result;
end;
$$;

-- ── accept_chore_handoff ─────────────────────────────────────────────────
-- The receiver saying "I've got it" — only now does the chore actually
-- become theirs (assigned_to_id/is_pool/status), same fields reassign_chore
-- itself sets, plus clearing the pending_handoff_* columns.
create or replace function public.accept_chore_handoff(p_chore_id text, p_member_id text)
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

-- ── decline_chore_handoff ────────────────────────────────────────────────
-- The receiver saying "can't either — put it back": the master-flow spec's
-- own framing for this specific decline ("no reason needed — the terms
-- changed, not them" pattern applies equally here) — reopens straight to
-- the pool rather than bouncing back to the original outgoing assignee, who
-- already said they couldn't do it.
create or replace function public.decline_chore_handoff(p_chore_id text, p_member_id text)
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

comment on function public.offer_chore_handoff(text, text, text, text) is 'Master-flow "hand it to a specific person" — records a pending offer without reassigning the chore yet; see accept_chore_handoff/decline_chore_handoff.';
comment on function public.accept_chore_handoff(text, text) is 'Receiver accepts a pending named handoff — only now does the chore actually become theirs.';
comment on function public.decline_chore_handoff(text, text) is 'Receiver passes on a pending named handoff — reopens straight to the pool, no reason required.';
