-- Fix: propose_terms_change wrote the new coins/date live immediately,
-- before the claiming helper ever accepted — reject_terms_change's
-- restore-on-reject was the only safety net, and any observer reading the
-- chore mid-negotiation saw the NEW value as if it were already final
-- (docs/master_flow_qa_report_pass3.md Section C item 1, TC-34/TC-35).
-- Also missing a due-TIME parameter entirely, so editing a claimed chore's
-- due time bypassed the terms-change gate — the only way to change it was a
-- plain, ungated updateChore patch (TC-36).
--
-- Fix: propose_terms_change now stages new values ONLY in pending_terms —
-- coins_reward/base_points/due_date/due_time stay at their current (old)
-- values until accept_terms_change actually applies pending_terms.new.
-- reject_terms_change no longer needs to "restore" anything (nothing was
-- ever changed), so it's simplified to just clearing the pending state and
-- releasing the chore, same net behavior as before. Added p_new_due_time.

create or replace function public.propose_terms_change(
  p_chore_id text, p_by_member_id text,
  p_new_coins_reward integer default null, p_new_base_points integer default null,
  p_new_due_date text default null, p_new_due_time text default null
)
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

  v_old := jsonb_build_object('coinsReward', v_chore.coins_reward, 'basePoints', v_chore.base_points, 'dueDate', v_chore.due_date, 'dueTime', v_chore.due_time);
  v_new := jsonb_build_object(
    'coinsReward', coalesce(p_new_coins_reward, v_chore.coins_reward),
    'basePoints',  coalesce(p_new_base_points,  v_chore.base_points),
    'dueDate',     coalesce(p_new_due_date,     v_chore.due_date),
    'dueTime',     coalesce(p_new_due_time,     v_chore.due_time)
  );

  -- Only status + pending_terms change now — coins/date/time stay at their
  -- CURRENT values until accept_terms_change actually applies v_new.
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

-- ── accept_terms_change — now actually applies the staged new values ──────
create or replace function public.accept_terms_change(p_chore_id text, p_member_id text)
returns chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_new_coins integer;
  v_new_base_points integer;
  v_new_due_date text;
  v_new_due_time text;
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

-- ── reject_terms_change — simplified: nothing to restore anymore ──────────
create or replace function public.reject_terms_change(p_chore_id text, p_member_id text)
returns chore_tasks
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

  -- coins_reward/base_points/due_date/due_time were never touched by
  -- propose_terms_change (staged in pending_terms only), so there is
  -- nothing left to restore — just clear the pending state and release the
  -- chore back to the pool, same net effect as before this fix.
  update public.chore_tasks
    set status = 'todo', assigned_to_id = null, is_pool = true, pending_terms = null
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_member_id, 'terms_rejected', 'todo', v_transition_id, 'terms changed, handed back — kept original terms');

  return v_chore;
end;
$$;
