-- Full-page redeem flow adds an optional inline Notes field for the kid
-- requesting a reward [live-requested: "show the CTA button to redeem
-- with oprion inline Notes button"] — distinct from declined_reason
-- (the parent's decision note). redeem_reward gains p_note (with a
-- default so existing callers keep working) and persists it to this
-- new column in the same insert that creates the redemption row.

alter table public.reward_redemptions
  add column if not exists kid_note text;

create or replace function public.redeem_reward(
  p_reward_id text,
  p_member_id text,
  p_wallet text default null,
  p_note text default null
)
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
    balance_before, balance_after, kid_note
  ) values (
    new_redemption_id, p_reward_id, reward_row.title, reward_row.cost,
    p_member_id, (select name from public.members where id = p_member_id),
    case when requires_approval_val then 'pending' else 'approved' end,
    now(), now(), p_wallet,
    case when requires_approval_val then null else now() end,
    current_balance, current_balance - reward_row.cost, p_note
  );

  return query select new_redemption_id;
end;
$$;
