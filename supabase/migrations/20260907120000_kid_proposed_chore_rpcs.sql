-- A kid (not teen/parent/senior) can propose a simple chore for themselves
-- or a sibling via KidSmartAskComposer. Modeled on the existing
-- 'gp_offer_pending' pattern (20260823000000_gp_offer_pending_status.sql):
-- a real status value, not a client-derived boolean flag, so "who created
-- it / who it's for / what state it's in" is fully queryable in the DB and
-- every consumer (parent's Chore Review, the kid's own quest list, the
-- sibling's own quest list) reads the same authoritative state instead of
-- re-deriving visibility client-side.
--
-- Lifecycle: 'todo' (never — a proposal never starts as a live, claimable
-- chore) -> 'pending_kid_proposal' (created, invisible to
-- pool/claim/assignee-visible queries — chore_tasks.status itself is the
-- gate, no separate boolean needed) -> parent Accepts ('todo', assigned to
-- whoever the kid picked, is_pool=false, real coins set by the parent at
-- accept time — a kid-authored proposal never carries its own coin amount)
-- or Declines (row deleted — a declined proposal isn't a real chore that
-- ever existed, unlike a declined chore_participants row on an already-
-- live chore).
--
-- chore_participants rows: 'requester' = the kid who proposed it (always),
-- 'assignee' = who it's for once accepted (added at propose time as
-- status='pending', flipped to null/removed as a distinct claim step isn't
-- needed here — accept IS the assignment, mirroring reassign_chore's own
-- "assigning it to someone else via authority" shape rather than
-- claim_pool_quest's CAS shape, since a parent accepting isn't a race).

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

-- ── propose_kid_chore ────────────────────────────────────────────────────
-- Creates the chore row directly (not via the client's addChore insert
-- path) so the authorization check (proposer must actually be a kid) and
-- the parent-target rejection both happen server-side, not just in client
-- UI that a modified client could bypass. p_for_member_id may equal
-- p_proposer_id (self) or a sibling's id — never a parent/senior's id.
create or replace function public.propose_kid_chore(
  p_family_id uuid, p_proposer_id text, p_for_member_id text,
  p_title text, p_description text default null, p_category text default 'other'
)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposer_role text;
  v_for_role text;
  v_chore public.chore_tasks;
  v_id text := 'chore_' || replace(gen_random_uuid()::text, '-', '');
  v_transition_id uuid := gen_random_uuid();
begin
  select role into v_proposer_role from public.members where id = p_proposer_id;
  if v_proposer_role is distinct from 'kid' then
    raise exception 'member % is not a kid — only a kid can propose a chore this way', p_proposer_id;
  end if;

  select role into v_for_role from public.members where id = p_for_member_id;
  if v_for_role is null then
    raise exception 'target member % not found', p_for_member_id;
  end if;
  if v_for_role in ('parent', 'senior') then
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
      format('proposed by a kid, for member %s', p_for_member_id));

  return v_chore;
end;
$$;

-- ── approve_kid_chore ────────────────────────────────────────────────────
-- Parent (or an active temporary approver, same authorization shape as
-- approve_chore) accepts the proposal — becomes a real, live 'todo' chore
-- assigned to whoever the kid picked, with the coin reward the PARENT sets
-- now (a kid-authored proposal never carries its own coin amount).
create or replace function public.approve_kid_chore(
  p_chore_id text, p_reviewer_id text, p_coins_reward integer default 0, p_xp_reward integer default 0
)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status != 'pending_kid_proposal' then
    raise exception 'chore % is not a pending kid proposal (status=%)', p_chore_id, v_chore.status;
  end if;

  select role into v_reviewer_role from public.members where id = p_reviewer_id;
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

-- ── decline_kid_chore ────────────────────────────────────────────────────
-- A declined proposal was never a real, live chore — deleted outright
-- (cascades to its chore_participants rows via the existing FK), not
-- soft-declined the way a submitted-and-rejected chore is. Logged before
-- deletion so the audit trail survives the row going away.
create or replace function public.decline_kid_chore(p_chore_id text, p_reviewer_id text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status != 'pending_kid_proposal' then
    raise exception 'chore % is not a pending kid proposal (status=%)', p_chore_id, v_chore.status;
  end if;

  select role into v_reviewer_role from public.members where id = p_reviewer_id;
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
