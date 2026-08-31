-- Real gap found by a deep exploratory QA trace of Coins & Rewards:
-- approveRedemption/rejectRedemption were bare client-side status
-- overwrites with only a local-cache pending-check as a guard — not a
-- server-verified one, unlike redeem_reward (fully atomic, row-locked).
-- Two co-parents racing to approve/reject the same redemption within the
-- realtime propagation window could produce a last-write-wins status with
-- rejectRedemption's coin refund not conditioned on actually winning that
-- race — a real double-refund / silently-reversed-decision risk.
--
-- Fix: a single atomic RPC mirroring redeem_reward's own shape — row-lock
-- the redemption, verify status is still 'pending' server-side (not
-- trusting the caller's local cache), then act. Only a parent may call
-- this (matches this session's reward_redemptions UPDATE RLS fix — a
-- self-cancel by the owning kid stays a separate, narrower path via the
-- RLS policy itself, not this RPC).
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
      set status = 'approved', approved_at = v_now
      where id = p_redemption_id
      returning * into v_redemption;
  else
    update public.reward_redemptions
      set status = 'declined', declined_at = v_now, declined_reason = p_note
      where id = p_redemption_id
      returning * into v_redemption;

    -- Refund the coins, in the same transaction as the status flip — the
    -- exact thing rejectRedemption's client-side version couldn't
    -- guarantee (a raw UPDATE plus a separate, unconditioned client call).
    if v_redemption.coin_cost > 0 and v_redemption.member_id is not null then
      execute format(
        'update public.members set %I = greatest(0, %I + $1) where id = $2',
        case when v_redemption.wallet = 'gpCoins' then 'gp_coins' else 'main_coins' end,
        case when v_redemption.wallet = 'gpCoins' then 'gp_coins' else 'main_coins' end
      ) using v_redemption.coin_cost, v_redemption.member_id;

      -- Also restore stock, same as the client-side fix applied this
      -- session — a stock-limited reward's unit shouldn't stay
      -- permanently consumed by a declined request.
      if v_redemption.reward_id is not null then
        select * into v_reward from public.rewards where id = v_redemption.reward_id for update;
        if v_reward.id is not null and v_reward.stock is not null then
          update public.rewards set stock = v_reward.stock + 1 where id = v_reward.id;
        end if;
      end if;
    end if;
  end if;

  return v_redemption;
end;
$function$;
