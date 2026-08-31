-- Real, severe gap found by a deep exploratory QA trace of Coins &
-- Rewards: guard_member_balance_writes()'s self-write exception
-- ("caller_id = new.id → always allowed") had NO bound on the new value
-- or its relationship to any real transaction. A kid's own session could
-- issue the exact same UPDATE shape familyStore.awardCoins already sends
-- — supabase.from('members').update({ main_coins: <any number> }) — aimed
-- at their own row, and mint an unbounded balance with zero trace in
-- point_transactions, completely bypassing every reward/chore/cash-out
-- flow's own balance protections. award_coins() (the RPC) has the
-- identical unconditional self-write exception, so simply routing through
-- the RPC does not close this — the delta itself needs a real bound.
--
-- The trigger's own comment identifies the only legitimate self-write
-- case as "a teen's own ride-claim payout/clawback" — confirmed by
-- reading every real call site in the app: exactly one place
-- (TeenView.tsx's claimPickup) self-awards coins, always a small,
-- bounded amount sourced from either the specific ride's own rideCoins or
-- the household's configured ride_earnings_per_run (default 50). A
-- second call site (kiosk redemption clawback) only ever self-DEDUCTS.
--
-- Fix: a self-write may still freely DECREASE any balance (a clawback or
-- spend can never mint money), but a self-write INCREASE is now capped at
-- the caller's own configured ride_earnings_per_run/
-- grocery_earnings_per_run (whichever is larger) per single UPDATE — the
-- only real self-service earning amounts this app actually has. This
-- closes the unbounded-mint exploit while leaving the one legitimate
-- self-award flow untouched.
create or replace function public.guard_member_balance_writes()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  caller_id text;
  caller_role text;
  v_max_self_award integer;
  v_coins_delta integer;
  v_main_coins_delta integer;
  v_gp_coins_delta integer;
  v_xp_delta integer;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.coins is not distinct from old.coins
     and new.main_coins is not distinct from old.main_coins
     and new.gp_coins is not distinct from old.gp_coins
     and new.xp is not distinct from old.xp then
    return new;
  end if;

  caller_id := public.resolve_active_member_id();

  if caller_id = new.id then
    v_coins_delta      := coalesce(new.coins, 0)      - coalesce(old.coins, 0);
    v_main_coins_delta := coalesce(new.main_coins, 0) - coalesce(old.main_coins, 0);
    v_gp_coins_delta   := coalesce(new.gp_coins, 0)   - coalesce(old.gp_coins, 0);
    v_xp_delta         := coalesce(new.xp, 0)         - coalesce(old.xp, 0);

    -- Any balance/xp DECREASE (a clawback, a spend) is always allowed —
    -- it can never be used to mint money. Only an INCREASE needs bounding.
    if v_coins_delta <= 0 and v_main_coins_delta <= 0 and v_gp_coins_delta <= 0 and v_xp_delta <= 0 then
      return new;
    end if;

    select greatest(coalesce(ride_earnings_per_run, 50), coalesce(grocery_earnings_per_run, 30))
      into v_max_self_award
      from public.members where id = new.id;
    v_max_self_award := coalesce(v_max_self_award, 50);

    if v_coins_delta <= v_max_self_award
       and v_main_coins_delta <= v_max_self_award
       and v_gp_coins_delta <= v_max_self_award
       and v_xp_delta <= v_max_self_award then
      return new;
    end if;

    raise exception 'Self-awarded balance increase exceeds the configured per-run earning cap'
      using errcode = '42501';
  end if;

  if caller_id is null or new.family_id <> public.current_user_family_id() then
    raise exception 'Not authorized to change this member''s balance'
      using errcode = '42501';
  end if;

  select role into caller_role from public.members where id = caller_id;

  if public.is_approver() or caller_role = 'grandparent' then
    return new;
  end if;

  raise exception 'Not authorized to change this member''s balance'
    using errcode = '42501';
end;
$function$;

-- Same fix applied to award_coins()'s own identical self-write exception
-- — it's a second, independent path to the same unbounded mint.
create or replace function public.award_coins(member_id text, coins_delta integer, xp_delta integer default 0, wallet text default 'main'::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  caller_id text;
  target_family_id uuid;
  caller_role text;
  v_max_self_award integer;
begin
  if auth.role() <> 'service_role' then
    caller_id := public.resolve_active_member_id();

    if caller_id is null then
      raise exception 'award_coins: no authenticated member session'
        using errcode = '42501';
    end if;

    if caller_id <> member_id then
      select family_id into target_family_id
      from public.members where id = member_id;

      if target_family_id is null or target_family_id <> public.current_user_family_id() then
        raise exception 'award_coins: caller is not in the target member''s family'
          using errcode = '42501';
      end if;

      select role into caller_role from public.members where id = caller_id;

      if not (public.is_approver() or caller_role = 'grandparent') then
        raise exception 'award_coins: caller lacks approval or grant authority over this member'
          using errcode = '42501';
      end if;
    else
      -- Self-credit/self-debit — a self-DEBIT (clawback/spend) is always
      -- allowed; a self-CREDIT is capped at the caller's own configured
      -- per-run earning amount, same bound as guard_member_balance_writes.
      if coins_delta > 0 or xp_delta > 0 then
        select greatest(coalesce(ride_earnings_per_run, 50), coalesce(grocery_earnings_per_run, 30))
          into v_max_self_award
          from public.members where id = member_id;
        v_max_self_award := coalesce(v_max_self_award, 50);

        if coins_delta > v_max_self_award or xp_delta > v_max_self_award then
          raise exception 'award_coins: self-awarded increase exceeds the configured per-run earning cap'
            using errcode = '42501';
        end if;
      end if;
    end if;
  end if;

  IF wallet = 'gp' THEN
    UPDATE public.members
    SET
      gp_coins = GREATEST(0, gp_coins + coins_delta),
      xp       = GREATEST(0, xp       + xp_delta)
    WHERE id = member_id;
  ELSE
    UPDATE public.members
    SET
      coins      = GREATEST(0, coins + coins_delta),
      main_coins = GREATEST(0, main_coins + coins_delta),
      xp         = GREATEST(0, xp    + xp_delta)
    WHERE id = member_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member % not found', member_id;
  END IF;
end;
$function$;
