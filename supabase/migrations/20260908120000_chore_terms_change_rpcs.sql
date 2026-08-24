-- QA punch list #2 — "Terms changed after someone took it" was entirely
-- missing: updateChore silently patched coins_reward/base_points/due_date
-- on an already-claimed (status='in_progress') chore with no notice to the
-- claimant at all — a parent could drop a claimed 25-coin bounty to 10 and
-- the claimant would only find out at approval time. Fixed with the same
-- DB-first pattern (real status value, not a client-derived flag) already
-- established this session for pending_kid_proposal/gp_offer_pending.
--
-- Lifecycle: 'in_progress' (claimed, working on it) -> a parent edits
-- coins/due_date -> 'terms_changed' (paused — the claimant can't submit
-- from here, chore_tasks_status_check still allows it to exist, but the
-- client's own submit gating treats anything other than todo/in_progress
-- as non-submittable, same guard submitChore already has) -> claimant
-- Accepts ('in_progress' again, same assignee) or Hands It Back ('todo',
-- is_pool=true, assigned_to_id=null, claimed_at=null — a normal release,
-- no reason required, mirroring every other release-back-to-pool path).
--
-- pending_terms tracks exactly what's proposed so the claimant's card can
-- show old vs new (struck-through old, new beside it) without a second
-- round-trip — cleared once accepted or handed back.

ALTER TABLE public.chore_tasks
  DROP CONSTRAINT IF EXISTS chore_tasks_status_check;

ALTER TABLE public.chore_tasks
  ADD CONSTRAINT chore_tasks_status_check
  CHECK (status = ANY (ARRAY[
    'todo',
    'claimed',
    'in_progress',
    'pending_approval',
    'pending_grandparent_approval',
    'pending_parent_approval',
    'gp_offer_pending',
    'pending_kid_proposal',
    'terms_changed',
    'approved',
    'auto_approved',
    'done',
    'completed',
    'declined',
    'redo_requested',
    'archived',
    'cancelled',
    'expired'
  ]));

ALTER TABLE public.chore_tasks
  ADD COLUMN IF NOT EXISTS pending_terms jsonb;

COMMENT ON COLUMN public.chore_tasks.pending_terms IS
  'Set when a claimed chore''s coins/due_date changes underneath the claimant — {old: {...}, new: {...}, changedBy: memberId, changedAt: iso} — cleared on accept/hand-back. See propose_terms_change/accept_terms_change/reject_terms_change RPCs.';

-- ── propose_terms_change ────────────────────────────────────────────────
-- Called by updateChore instead of a plain patch whenever a claimed chore's
-- coins_reward/base_points/due_date changes. Authorization: same
-- parent-or-temporary-approver shape every other reviewer-gated RPC this
-- session uses.
create or replace function public.propose_terms_change(
  p_chore_id text, p_by_member_id text,
  p_new_coins_reward integer default null, p_new_base_points integer default null,
  p_new_due_date text default null
)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_by_role text;
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

  select role into v_by_role from public.members where id = p_by_member_id;
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

-- ── accept_terms_change ─────────────────────────────────────────────────
-- The claimant keeping the chore on the new terms — only the current
-- assignee may accept (a stale client can't accept on someone else's
-- behalf).
create or replace function public.accept_terms_change(p_chore_id text, p_member_id text)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
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

  update public.chore_tasks
    set status = 'in_progress', pending_terms = null
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_member_id, 'terms_accepted', 'terms_changed', 'in_progress', v_transition_id, 'claimant accepted the new terms');

  return v_chore;
end;
$$;

-- ── reject_terms_change ─────────────────────────────────────────────────
-- "That doesn't work — hand it back" — no reason required, mirrors every
-- other release-back-to-pool path (this wasn't the claimant's choice to
-- back out, the deal changed under them).
create or replace function public.reject_terms_change(p_chore_id text, p_member_id text)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
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

  update public.chore_tasks
    set status = 'todo', is_pool = true, assigned_to_id = null, claimed_at = null, pending_terms = null
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_member_id, 'terms_rejected', 'terms_changed', 'todo', v_transition_id, 'claimant handed it back — terms changed, not them');

  return v_chore;
end;
$$;
