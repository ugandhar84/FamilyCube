-- award_coins() always credited members.coins/main_coins, with no way to
-- target the separate gp_coins sub-wallet. This meant every grandparent-
-- sponsored quest payout (grandparentApproveAndCheer, and the generic
-- approveChore path for any chore with categoryType = 'grandparent_quest')
-- was silently credited as regular earned/spend-save-give money instead of
-- landing in the Grandparent Bonus jar — the exact opposite of the
-- product's intent that GP-funded money (kudos, sponsor match, quest
-- payouts) should all flow into gp_coins, tracked separately from money
-- earned through ordinary household chores.
--
-- Adds an optional `wallet` parameter — defaults to 'main' so every
-- existing call site (which doesn't pass it) keeps its current behavior
-- unchanged. Explicitly drops the old 3-arg signature first: adding a 4th
-- parameter via CREATE OR REPLACE creates a SECOND overload rather than
-- replacing the original (Postgres functions are identified by name +
-- parameter list), which left `GRANT EXECUTE ON FUNCTION public.award_coins`
-- ambiguous between two overloads on first attempt at this migration.

DROP FUNCTION IF EXISTS public.award_coins(text, int, int);

CREATE OR REPLACE FUNCTION public.award_coins(
  member_id  text,
  coins_delta int,
  xp_delta    int DEFAULT 0,
  wallet      text DEFAULT 'main'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_coins(text, int, int, text) TO authenticated, anon;
