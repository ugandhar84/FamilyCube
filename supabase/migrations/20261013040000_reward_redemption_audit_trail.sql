-- Live-reported gap: the Reward Review screen has no record of who
-- approved/declined a redemption, when, or what the kid's coin balance
-- was before/after — resolve_reward_redemption() already flips status and
-- (on decline) refunds coins, but neither it nor redeem_reward() ever
-- wrote an actor id or a balance snapshot anywhere, and the client type
-- (Redemption.approvedBy/rejectedBy) was declared but never actually
-- mapped from a DB column, because no such column existed.
--
-- Adds the actor + balance-snapshot columns and backfills
-- resolve_reward_redemption/redeem_reward to populate them in the same
-- transaction that already does the status flip / coin debit, so the
-- audit trail can never drift from the real decision.

alter table public.reward_redemptions
  add column if not exists approved_by   text,
  add column if not exists declined_by   text,
  add column if not exists balance_before integer,
  add column if not exists balance_after  integer;

-- redeem_reward: snapshot the balance before/after the debit it already
-- performs (balance_after is only meaningful once the redemption is
-- resolved for non-approval-required rewards, which skip the review
-- screen entirely and are 'approved' immediately here).
create or replace function public.redeem_reward(p_reward_id text, p_member_id text, p_wallet text default null)
returns table(redemption_id text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  caller_id text;
  reward_row public.rewards%rowtype;
  redemption_count int;
  new_redemption_id text;
  requires_approval_val boolean;
  wallet_column text;
  current_balance int;
begin
  if auth.role() is null or auth.role() <> 'service_role' then
    caller_id := public.resolve_active_member_id();
    if caller_id is null then
      raise exception 'redeem_reward: no authenticated member session'
        using errcode = '42501';
    end if;
    if caller_id <> p_member_id then
      raise exception 'redeem_reward: can only redeem for yourself'
        using errcode = '42501';
    end if;
  end if;

  select * into reward_row from public.rewards where id = p_reward_id
    for update;

  if not found then
    raise exception 'redeem_reward: reward not found' using errcode = 'P0002';
  end if;
  if not reward_row.available then
    raise exception 'redeem_reward: reward is not available' using errcode = 'P0001';
  end if;
  if reward_row.expires_at is not null and reward_row.expires_at < now() then
    raise exception 'redeem_reward: reward has expired' using errcode = 'P0001';
  end if;
  if reward_row.eligible_member_ids is not null
     and not (p_member_id = any(reward_row.eligible_member_ids)) then
    raise exception 'redeem_reward: not eligible for this reward' using errcode = 'P0001';
  end if;
  if reward_row.stock is not null and reward_row.stock <= 0 then
    raise exception 'redeem_reward: reward is out of stock' using errcode = 'P0001';
  end if;
  if reward_row.max_per_member is not null then
    select count(*) into redemption_count
      from public.reward_redemptions
      where reward_id = p_reward_id and member_id = p_member_id
        and status <> 'declined';
    if redemption_count >= reward_row.max_per_member then
      raise exception 'redeem_reward: max redemptions reached for this member' using errcode = 'P0001';
    end if;
  end if;

  wallet_column := case when p_wallet = 'gpCoins' then 'gp_coins' else 'main_coins' end;
  execute format('select %I from public.members where id = $1 for update', wallet_column)
    into current_balance using p_member_id;

  if current_balance is null then
    raise exception 'redeem_reward: member not found' using errcode = 'P0002';
  end if;
  if current_balance < reward_row.cost then
    raise exception 'redeem_reward: insufficient balance' using errcode = 'P0001';
  end if;

  execute format('update public.members set %I = %I - $1 where id = $2', wallet_column, wallet_column)
    using reward_row.cost, p_member_id;

  if reward_row.stock is not null then
    update public.rewards set stock = stock - 1 where id = p_reward_id;
  end if;

  requires_approval_val := reward_row.requires_approval;
  new_redemption_id := 'rd' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text;

  insert into public.reward_redemptions (
    id, reward_id, reward_title, coin_cost, member_id, member_name,
    status, requested_at, created_at, wallet, approved_at,
    balance_before, balance_after
  ) values (
    new_redemption_id, p_reward_id, reward_row.title, reward_row.cost,
    p_member_id, (select name from public.members where id = p_member_id),
    case when requires_approval_val then 'pending' else 'approved' end,
    now(), now(), p_wallet,
    case when requires_approval_val then null else now() end,
    current_balance, current_balance - reward_row.cost
  );

  return query select new_redemption_id;
end;
$$;

-- resolve_reward_redemption: stamp the acting parent, and — since coins
-- are debited at REQUEST time (redeem_reward above), not at approval —
-- a decline's refund is the only remaining balance-changing event to
-- snapshot here; approval just finalizes a balance that was already set.
create or replace function public.resolve_reward_redemption(
  p_redemption_id text,
  p_approve boolean,
  p_actor_id text,
  p_note text default null
)
returns reward_redemptions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_active_member_id text;
  v_caller_is_parent boolean;
  v_redemption public.reward_redemptions;
  v_reward public.rewards;
  v_now timestamptz := now();
  v_wallet_column text;
  v_balance_before int;
  v_balance_after int;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_actor_id then
    raise exception 'caller is not member %', p_actor_id;
  end if;

  select exists (
    select 1 from public.members
    where id = v_active_member_id and role = 'parent'
  ) into v_caller_is_parent;
  if not v_caller_is_parent then
    raise exception 'only a parent can approve or decline a redemption';
  end if;

  select * into v_redemption from public.reward_redemptions where id = p_redemption_id for update;
  if v_redemption.id is null then
    raise exception 'redemption % not found', p_redemption_id;
  end if;
  if v_redemption.status <> 'pending' then
    raise exception 'redemption % is not pending (status=%) — already resolved by someone else', p_redemption_id, v_redemption.status;
  end if;

  if p_approve then
    update public.reward_redemptions
      set status = 'approved', approved_at = v_now, approved_by = p_actor_id
      where id = p_redemption_id
      returning * into v_redemption;
  else
    if v_redemption.coin_cost > 0 and v_redemption.member_id is not null then
      v_wallet_column := case when v_redemption.wallet = 'gpCoins' then 'gp_coins' else 'main_coins' end;
      execute format('select %I from public.members where id = $1 for update', v_wallet_column)
        into v_balance_before using v_redemption.member_id;
      v_balance_after := coalesce(v_balance_before, 0) + v_redemption.coin_cost;
      execute format('update public.members set %I = $1 where id = $2', v_wallet_column)
        using v_balance_after, v_redemption.member_id;

      if v_redemption.reward_id is not null then
        select * into v_reward from public.rewards where id = v_redemption.reward_id for update;
        if v_reward.id is not null and v_reward.stock is not null then
          update public.rewards set stock = v_reward.stock + 1 where id = v_reward.id;
        end if;
      end if;
    end if;

    update public.reward_redemptions
      set status = 'declined', declined_at = v_now, declined_reason = p_note,
          declined_by = p_actor_id,
          balance_before = coalesce(v_balance_before, balance_before),
          balance_after = coalesce(v_balance_after, balance_after)
      where id = p_redemption_id
      returning * into v_redemption;
  end if;

  return v_redemption;
end;
$function$;
