-- ═══════════════════════════════════════════════════════════════════════
-- admin_adjust_coins — atomic coin increment/decrement for server-side use
--
-- Called by:
--   partner-webhook edge function (purchase_bonus awards)
--   coins-config admin screen (manual grants/deductions)
--
-- Uses a single UPDATE ... RETURNING to avoid read-modify-write races.
-- Bypasses daily caps — only call from trusted server contexts.
-- SECURITY DEFINER so it can write profiles.coins despite column REVOKE.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION admin_adjust_coins(
  p_user_id  uuid,
  p_delta    integer,
  p_reason   text,
  p_ref_id   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_coins          integer;
  v_new_lifetime_coins integer;
BEGIN
  -- Validate delta
  IF p_delta = 0 THEN
    RAISE EXCEPTION 'p_delta must be non-zero';
  END IF;

  -- Atomic increment — clamps coins floor to 0, lifetime_coins only grows
  UPDATE profiles
  SET
    coins          = GREATEST(0, coins + p_delta),
    lifetime_coins = CASE WHEN p_delta > 0 THEN lifetime_coins + p_delta ELSE lifetime_coins END
  WHERE id = p_user_id
  RETURNING coins, lifetime_coins
  INTO v_new_coins, v_new_lifetime_coins;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;

  -- Write ledger entry
  INSERT INTO coin_ledger (user_id, delta, reason, ref_id, balance_after)
  VALUES (p_user_id, p_delta, p_reason, p_ref_id, v_new_coins);

  RETURN jsonb_build_object(
    'ok',            true,
    'new_balance',   v_new_coins,
    'lifetime_coins', v_new_lifetime_coins,
    'delta',         p_delta
  );
END;
$$;

-- Only authenticated users with is_admin = true should call this from client.
-- Edge functions use service role key which bypasses RLS entirely.
GRANT EXECUTE ON FUNCTION admin_adjust_coins(uuid, integer, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
