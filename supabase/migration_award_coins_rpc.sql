-- award_coins RPC — called by questStore when parent approves a quest
-- Atomically increments coins and xp for a member.

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
    coins = GREATEST(0, coins + coins_delta),
    xp    = GREATEST(0, xp    + xp_delta)
  WHERE id = member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member % not found', member_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_coins TO authenticated, anon;
