-- Two columns have been tracking "how many coins does this kid have" and
-- disagreeing:
--   • members.coins       — bumped by the award_coins() RPC on every chore
--                            approval. The one path that actually works.
--   • members.main_coins  — the column Kid Hub reads (mainCoins ?? coins)
--                            and Parent Hub's GP-bonus/cheer flow writes to
--                            client-side via a plain `.update()` call with
--                            no error handling — but this column has never
--                            existed in the database at all. Every such
--                            write has been silently failing outright, so
--                            a cheer/bonus appeared to land on the device
--                            that triggered it (optimistic local state) and
--                            then vanished on next sync, never reaching any
--                            other family member's device.
-- Parent Hub's Family Leaderboard shows a THIRD number again — derived from
-- summing point_transactions, a ledger that never decrements on reward
-- redemption — which is the main reason it disagreed with both of the above.
--
-- Fix: create the missing columns, backfill from the one value that has
-- actually been reliably tracked (coins), and make award_coins() keep both
-- in lockstep going forward. Parent Hub's Leaderboard switches to reading
-- the same column Kid Hub does (see the app-code change alongside this).

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS main_coins integer,
  ADD COLUMN IF NOT EXISTS gp_coins   integer NOT NULL DEFAULT 0;

UPDATE public.members
SET main_coins = coins
WHERE main_coins IS NULL;

ALTER TABLE public.members
  ALTER COLUMN main_coins SET DEFAULT 0,
  ALTER COLUMN main_coins SET NOT NULL;

CREATE OR REPLACE FUNCTION public.award_coins(
  member_id  text,
  coins_delta int,
  xp_delta    int DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.members
  SET
    coins      = GREATEST(0, coins + coins_delta),
    main_coins = GREATEST(0, main_coins + coins_delta),
    xp         = GREATEST(0, xp    + xp_delta)
  WHERE id = member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member % not found', member_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_coins TO authenticated, anon;
