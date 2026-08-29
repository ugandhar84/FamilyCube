-- Bug hunt finding: rewardStore.ts's redeemReward() does every eligibility
-- check (available, expired, eligibleMemberIds, maxPerMember count, stock)
-- against pure client-side Zustand state, then fires an unconditional
-- INSERT into reward_redemptions and a client-side stock decrement — no
-- server-side uniqueness/CAS guard at all, unlike award_coins() (see
-- 20260925113000_lock_down_award_coins_and_member_balance_writes.sql),
-- which IS a real atomic RPC. Two rapid taps or two devices both read the
-- same stale "stock: 1, count: 0" state, both pass the local checks, and
-- both redeem successfully — a maxPerMember:1 or stock-limited reward can
-- be claimed more times than it should be, with no re-check anywhere
-- before the write actually lands.
--
-- redeem_reward() moves ALL of this into one SECURITY DEFINER transaction:
-- the eligibility reads and the stock decrement + redemption insert happen
-- under the same row lock (SELECT ... FOR UPDATE on the rewards row), so a
-- second concurrent call sees the post-decrement state and correctly
-- fails instead of racing past a check that already passed for the first
-- caller. Coin deduction itself is NOT done here — the client still calls
-- deductCoins/award_coins separately, same as today, since that already
-- has its own real atomicity (a separate concern: not double-spending the
-- BALANCE, versus this fix's concern of not double-claiming the REWARD).

create or replace function public.redeem_reward(
  p_reward_id   text,
  p_member_id   text,
  p_wallet      text default null
)
returns table (redemption_id text)
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
begin
  -- Same authorization shape as award_coins(): service_role bypasses,
  -- otherwise the caller must be redeeming for themselves or have
  -- approval/grant authority over the target member's family.
  if auth.role() <> 'service_role' then
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

  -- Row lock — this is what actually closes the race. A second concurrent
  -- call for the same reward blocks here until the first transaction
  -- commits or rolls back, then reads the POST-decrement stock/row state,
  -- not the stale pre-decrement state a plain client-side read would see.
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

  if reward_row.stock is not null then
    update public.rewards set stock = stock - 1 where id = p_reward_id;
  end if;

  requires_approval_val := reward_row.requires_approval;
  new_redemption_id := 'rd' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text;

  insert into public.reward_redemptions (
    id, reward_id, reward_title, coin_cost, member_id, member_name,
    status, requested_at, created_at, wallet, approved_at
  ) values (
    new_redemption_id, p_reward_id, reward_row.title, reward_row.cost,
    p_member_id, (select name from public.members where id = p_member_id),
    case when requires_approval_val then 'pending' else 'approved' end,
    now(), now(), p_wallet,
    case when requires_approval_val then null else now() end
  );

  return query select new_redemption_id;
end;
$$;

comment on function public.redeem_reward is
  'Atomic reward redemption — replaces rewardStore.ts client-side check-then-insert with a locked, server-side eligibility check + stock decrement + redemption insert in one transaction, closing the double-redeem race a plain client read/write pair could not prevent.';

revoke execute on function public.redeem_reward(text, text, text) from anon;
grant execute on function public.redeem_reward(text, text, text) to authenticated, service_role;
