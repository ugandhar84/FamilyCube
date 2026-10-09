-- Scenario 4.7 (two parents disagree on an approved chore) as server RPCs.
--
-- Until now flag / stand-by / request-reversal / co-sign were client-side
-- writes in choreStore: a direct chore_tasks update followed by a SEPARATE
-- negative award call. That was non-atomic (status could flip to 'declined'
-- while the coins stayed) and nothing server-side enforced the co-sign rule
-- or families.allow_unilateral_reversal. These RPCs make the server decide.
--
--   flag_approval        parent B flags parent A's approval (no money moves)
--   stand_by_approval    clears a flag / reversal request
--   request_reversal     co-sign path by default; executes immediately only if
--                        families.allow_unilateral_reversal is true
--   cosign_reversal      the ORIGINAL approver executes a requested reversal
--
-- Every reversal runs in one transaction: chore -> declined, coins removed
-- (floored at 0 if the kid already spent them), activity_log row written.

create or replace function public._reverse_chore_payout(
  p_chore_id text, p_by_id text, p_reason text
) returns table (chore chore_tasks, coins_removed integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chore public.chore_tasks;
  v_pts integer;
  v_wallet text;
  v_before integer;
  v_removed integer := 0;
  v_orig public.point_transactions;
  v_from text;
begin
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;
  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status not in ('approved', 'auto_approved') then
    raise exception 'chore % is not approved (status=%) — nothing to reverse', p_chore_id, v_chore.status;
  end if;
  v_from := v_chore.status;

  v_pts := coalesce(nullif(v_chore.base_points, 0), v_chore.coins_reward, 0) + coalesce(v_chore.bonus_coins, 0);
  v_wallet := case when v_chore.category_type = 'grandparent_quest' or v_chore.sponsor_user_id is not null
                   then 'gp' else 'main' end;

  if v_pts > 0 and v_chore.assigned_to_id is not null and not coalesce(v_chore.reward_pending_review, false) then
    -- Go through award_coins (not a raw UPDATE) so the main wallet keeps
    -- `coins` and `main_coins` in lockstep and the same family/authority
    -- guards run. GREATEST(0, ...) inside it floors a kid who already
    -- spent the coins; v_removed records what was actually taken back.
    if v_wallet = 'gp' then
      select gp_coins into v_before from public.members where id = v_chore.assigned_to_id;
    else
      select main_coins into v_before from public.members where id = v_chore.assigned_to_id;
    end if;
    v_before := coalesce(v_before, 0);
    perform public.award_coins(v_chore.assigned_to_id, -v_pts, 0, v_wallet);
    v_removed := least(v_pts, v_before);

    -- Negate the original EARNED row (same jar split) so wallet/jar views
    -- that sum point_transactions stay consistent with the balance.
    select * into v_orig from public.point_transactions
      where chore_instance_id = p_chore_id and user_id = v_chore.assigned_to_id
        and transaction_type = 'EARNED' and amount > 0
      order by created_at desc limit 1;
    if v_removed > 0 then
      insert into public.point_transactions
        (user_id, chore_instance_id, amount, transaction_type,
         spend_allocation, save_allocation, give_allocation, notes, wallet)
      values (
        v_chore.assigned_to_id, p_chore_id, -v_removed, 'EARNED',
        case when v_orig.id is null then -v_removed
             else -round(coalesce(v_orig.spend_allocation, 0)::numeric * v_removed / nullif(v_orig.amount, 0))::int end,
        case when v_orig.id is null then 0
             else -round(coalesce(v_orig.save_allocation, 0)::numeric * v_removed / nullif(v_orig.amount, 0))::int end,
        case when v_orig.id is null then 0
             else -round(coalesce(v_orig.give_allocation, 0)::numeric * v_removed / nullif(v_orig.amount, 0))::int end,
        'Approval reversed', case when v_wallet = 'gp' then 'gpCoins' else 'mainCoins' end
      );
    end if;
  end if;

  update public.chore_tasks
    set status = 'declined', declined_at = now(),
        dispute_status = null,
        dispute_reason = p_reason,
        disputed_by_id = coalesce(disputed_by_id, p_by_id),
        disputed_at    = coalesce(disputed_at, now()),
        reversed_at    = now(),
        reversed_by_id = p_by_id
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_by_id, 'approval_reversed', v_from, 'declined', gen_random_uuid(),
      format('%s of %s coins removed%s', v_removed, v_pts, coalesce(' — ' || nullif(p_reason, ''), '')));

  return query select v_chore, v_removed;
end;
$$;

revoke execute on function public._reverse_chore_payout(text, text, text) from public, anon, authenticated;

-- Shared caller / family / role checks. Returns the locked chore.
create or replace function public._dispute_guard(
  p_chore_id text, p_caller_id text, p_require_approved boolean
) returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_active text;
  v_role text;
  v_family text;
  v_chore public.chore_tasks;
begin
  v_active := public.resolve_active_member_id();
  if v_active is null or v_active is distinct from p_caller_id then
    raise exception 'caller is not member %', p_caller_id;
  end if;
  select role, family_id into v_role, v_family from public.members where id = p_caller_id;
  if v_role is distinct from 'parent' then
    raise exception 'only a parent can dispute or resolve an approval';
  end if;
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;
  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.family_id is distinct from v_family then
    raise exception 'member % is not in the same family as chore %', p_caller_id, p_chore_id;
  end if;
  if p_require_approved and v_chore.status not in ('approved', 'auto_approved') then
    raise exception 'chore % is not approved (status=%)', p_chore_id, v_chore.status;
  end if;
  return v_chore;
end;
$$;

revoke execute on function public._dispute_guard(text, text, boolean) from public, anon, authenticated;

create or replace function public.flag_approval(p_chore_id text, p_by_parent_id text, p_note text default null)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chore public.chore_tasks;
begin
  v_chore := public._dispute_guard(p_chore_id, p_by_parent_id, true);
  if v_chore.reviewed_by_id is not distinct from p_by_parent_id then
    raise exception 'you cannot dispute your own approval';
  end if;
  if v_chore.dispute_status is not null then
    raise exception 'chore % already has an open dispute (%)', p_chore_id, v_chore.dispute_status;
  end if;

  update public.chore_tasks
    set dispute_status = 'flagged', dispute_reason = p_note,
        disputed_by_id = p_by_parent_id, disputed_at = now()
    where id = p_chore_id returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_by_parent_id, 'approval_flagged', v_chore.status, v_chore.status, gen_random_uuid(), p_note);
  return v_chore;
end;
$$;

create or replace function public.stand_by_approval(p_chore_id text, p_by_parent_id text)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chore public.chore_tasks;
begin
  v_chore := public._dispute_guard(p_chore_id, p_by_parent_id, false);
  if v_chore.dispute_status is null then
    raise exception 'chore % has no open dispute', p_chore_id;
  end if;
  -- Only the original approver (stands by) or the parent who raised it
  -- (withdraws) may close it — not an uninvolved third party.
  if p_by_parent_id is distinct from v_chore.reviewed_by_id and p_by_parent_id is distinct from v_chore.disputed_by_id then
    raise exception 'only the original approver or the parent who raised the dispute can close it';
  end if;

  update public.chore_tasks
    set dispute_status = null, dispute_reason = null, disputed_by_id = null, disputed_at = null
    where id = p_chore_id returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_by_parent_id, 'approval_stands', v_chore.status, v_chore.status, gen_random_uuid(), null);
  return v_chore;
end;
$$;

create or replace function public.request_reversal(p_chore_id text, p_by_parent_id text, p_reason text)
returns table (chore chore_tasks, executed boolean, coins_removed integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chore public.chore_tasks;
  v_unilateral boolean;
  v_removed integer := 0;
  v_res record;
begin
  v_chore := public._dispute_guard(p_chore_id, p_by_parent_id, true);
  if v_chore.reviewed_by_id is not distinct from p_by_parent_id then
    raise exception 'you cannot dispute your own approval';
  end if;

  select coalesce(allow_unilateral_reversal, false) into v_unilateral
    from public.families where id::text = v_chore.family_id;

  if coalesce(v_unilateral, false) then
    select * into v_res from public._reverse_chore_payout(p_chore_id, p_by_parent_id, p_reason);
    return query select v_res.chore, true, v_res.coins_removed;
    return;
  end if;

  if v_chore.dispute_status = 'reversal_requested' then
    raise exception 'a reversal is already requested for chore %', p_chore_id;
  end if;

  update public.chore_tasks
    set dispute_status = 'reversal_requested', dispute_reason = p_reason,
        disputed_by_id = p_by_parent_id, disputed_at = now()
    where id = p_chore_id returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_by_parent_id, 'reversal_requested', v_chore.status, v_chore.status, gen_random_uuid(), p_reason);
  return query select v_chore, false, 0;
end;
$$;

create or replace function public.cosign_reversal(p_chore_id text, p_cosigner_id text)
returns table (chore chore_tasks, coins_removed integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chore public.chore_tasks;
  v_res record;
begin
  v_chore := public._dispute_guard(p_chore_id, p_cosigner_id, true);
  if v_chore.dispute_status is distinct from 'reversal_requested' then
    raise exception 'chore % has no pending reversal request', p_chore_id;
  end if;
  -- Must be a second, independent parent: the original approver when one is
  -- recorded (auto-approved chores have none, so any parent other than the
  -- requester may co-sign).
  if v_chore.disputed_by_id is not distinct from p_cosigner_id then
    raise exception 'the parent who requested the reversal cannot also co-sign it';
  end if;
  if v_chore.reviewed_by_id is not null and v_chore.reviewed_by_id is distinct from p_cosigner_id then
    raise exception 'only the original approver can co-sign this reversal';
  end if;

  select * into v_res from public._reverse_chore_payout(p_chore_id, p_cosigner_id, coalesce(v_chore.dispute_reason, ''));
  return query select v_res.chore, v_res.coins_removed;
end;
$$;
