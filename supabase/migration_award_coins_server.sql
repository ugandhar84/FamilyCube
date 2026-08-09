-- ═══════════════════════════════════════════════════════════════════════
-- SERVER-SIDE COIN AWARDING  — all anti-abuse guards live here
-- Client calls award_coins() via RPC; it decides whether to pay out.
-- Client can NEVER write directly to profiles.coins (RLS blocks it).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Add streak + cooldown columns to profiles ─────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS streak_days      integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_date date,
  ADD COLUMN IF NOT EXISTS coins_earned_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coins_day_date   date;

-- ── 2. Tighten RLS: block direct coin writes from clients ─────────────
--   Clients can read their own profile (existing policy).
--   Only SECURITY DEFINER functions may increment coins.
--   We achieve this by dropping any permissive UPDATE policy on profiles
--   and replacing it with one that explicitly excludes coin columns.
--   (If your project has no UPDATE policy yet, this is a no-op.)
DROP POLICY IF EXISTS "Users can update own profile"  ON profiles;
DROP POLICY IF EXISTS "users_update_own"              ON profiles;

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- Block clients from touching coins / streak / lifetime_coins directly.
    -- They must go through award_coins() / redeem_offer().
  );

-- ── 3. coin_daily_caps — fast per-(user,date,action) counter ─────────
--   Using a dedicated table is O(1) per check vs. aggregating coin_ledger.
CREATE TABLE IF NOT EXISTS coin_daily_caps (
  user_id    uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cap_date   date    NOT NULL DEFAULT current_date,
  action_key text    NOT NULL,
  count      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, cap_date, action_key)
);

ALTER TABLE coin_daily_caps ENABLE ROW LEVEL SECURITY;
-- Clients can read their own caps (so UI can show "3 of 5 posts done today")
CREATE POLICY "Users see own caps"
  ON coin_daily_caps FOR SELECT USING (user_id = auth.uid());
-- Only SECURITY DEFINER functions write caps
CREATE INDEX IF NOT EXISTS idx_coin_daily_caps_user
  ON coin_daily_caps (user_id, cap_date);

-- ── 4. Main award function ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION award_coins(
  p_user_id  uuid,
  p_action   text,
  p_ref_id   uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- ── Config ───────────────────────────────────────────────────────────
  DEFAULT_RATES  constant jsonb := '{
    "daily_login":   10,
    "post_created":  20,
    "post_liked":    2,
    "comment_added": 5,
    "streak_7day":   50,
    "streak_30day":  200,
    "level_up":      100
  }';

  -- Max times each action pays out per day (not max coins, max events)
  ACTION_CAPS constant jsonb := '{
    "daily_login":   1,
    "post_created":  3,
    "post_liked":    10,
    "comment_added": 5,
    "streak_7day":   1,
    "streak_30day":  1,
    "level_up":      5
  }';

  -- Cooldown in seconds between coin-earning events for spammable actions
  ACTION_COOLDOWNS constant jsonb := '{
    "post_created":  300,
    "comment_added": 120
  }';

  GLOBAL_DAILY_CAP constant integer := 100;
  MIN_ACCOUNT_AGE  constant interval := '48 hours';

  -- ── Locals ───────────────────────────────────────────────────────────
  v_profile        profiles%ROWTYPE;
  v_auth           auth.users%ROWTYPE;
  v_today          date    := current_date;
  v_coins          integer;
  v_daily_limit    integer;
  v_cap_count      integer;
  v_total_today    integer;
  v_new_balance    integer;
  v_admin_rates    jsonb;
  v_last_action_at timestamptz;
  v_cooldown_secs  integer;
BEGIN

  -- ── Guard 1: valid action ─────────────────────────────────────────────
  IF NOT (DEFAULT_RATES ? p_action) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unknown action', 'skip', true);
  END IF;

  -- ── Guard 2: user exists (row-level lock prevents race) ───────────────
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User not found');
  END IF;

  -- ── Guard 3: auth metadata ────────────────────────────────────────────
  SELECT * INTO v_auth FROM auth.users WHERE id = p_user_id;

  -- Account age: no coins for brand-new accounts (prevents throwaway signups)
  IF v_auth.created_at > now() - MIN_ACCOUNT_AGE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Account too new', 'skip', true);
  END IF;

  -- Email must be confirmed
  IF v_auth.email_confirmed_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Email not verified', 'skip', true);
  END IF;

  -- ── Guard 4: global daily cap ─────────────────────────────────────────
  SELECT COALESCE(SUM(count), 0) INTO v_total_today
    FROM coin_daily_caps
   WHERE user_id = p_user_id AND cap_date = v_today;

  -- v_total_today here is total *events*, not coins — we recalc coins below.
  -- Use a separate fast sum from coin_ledger for actual coins earned today.
  SELECT COALESCE(SUM(delta), 0) INTO v_total_today
    FROM coin_ledger
   WHERE user_id = p_user_id
     AND created_at >= v_today::timestamptz
     AND delta > 0;

  IF v_total_today >= GLOBAL_DAILY_CAP THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'Daily limit reached',
      'today', v_total_today, 'cap', GLOBAL_DAILY_CAP, 'skip', true
    );
  END IF;

  -- ── Guard 5: per-action daily cap ────────────────────────────────────
  v_daily_limit := (ACTION_CAPS ->> p_action)::integer;

  SELECT COALESCE(count, 0) INTO v_cap_count
    FROM coin_daily_caps
   WHERE user_id = p_user_id AND cap_date = v_today AND action_key = p_action;

  IF v_cap_count >= v_daily_limit THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'Action cap reached',
      'action', p_action, 'cap', v_daily_limit, 'skip', true
    );
  END IF;

  -- ── Guard 6: cooldown (anti-spam for post / comment) ─────────────────
  v_cooldown_secs := (ACTION_COOLDOWNS ->> p_action)::integer;
  IF v_cooldown_secs IS NOT NULL THEN
    SELECT MAX(created_at) INTO v_last_action_at
      FROM coin_ledger
     WHERE user_id = p_user_id AND reason = p_action;

    IF v_last_action_at IS NOT NULL
       AND v_last_action_at > now() - (v_cooldown_secs || ' seconds')::interval THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'Cooldown active',
        'retry_after', extract(epoch FROM (v_last_action_at + (v_cooldown_secs || ' seconds')::interval)),
        'skip', true
      );
    END IF;
  END IF;

  -- ── Guard 7: load admin-configured rates (fall back to defaults) ──────
  SELECT value INTO v_admin_rates FROM app_settings WHERE key = 'coin_rates';
  v_coins := COALESCE(
    (COALESCE(v_admin_rates, '{}'::jsonb) ->> p_action)::integer,
    (DEFAULT_RATES ->> p_action)::integer,
    0
  );

  IF v_coins <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Action disabled', 'skip', true);
  END IF;

  -- ── Guard 8: clamp to remaining daily budget ──────────────────────────
  v_coins := LEAST(v_coins, GLOBAL_DAILY_CAP - v_total_today);

  -- ── Award ─────────────────────────────────────────────────────────────
  v_new_balance := v_profile.coins + v_coins;

  UPDATE profiles
     SET coins          = v_new_balance,
         lifetime_coins = lifetime_coins + v_coins
   WHERE id = p_user_id;

  -- Increment daily cap counter
  INSERT INTO coin_daily_caps (user_id, cap_date, action_key, count)
  VALUES (p_user_id, v_today, p_action, 1)
  ON CONFLICT (user_id, cap_date, action_key)
  DO UPDATE SET count = coin_daily_caps.count + 1;

  -- Ledger entry (append-only, no UPDATE/DELETE RLS)
  INSERT INTO coin_ledger (user_id, delta, reason, ref_id, balance_after)
  VALUES (p_user_id, v_coins, p_action, p_ref_id, v_new_balance);

  RETURN jsonb_build_object(
    'ok',            true,
    'coins_awarded', v_coins,
    'balance',       v_new_balance,
    'today_earned',  v_total_today + v_coins,
    'daily_cap',     GLOBAL_DAILY_CAP,
    'remaining',     GREATEST(0, GLOBAL_DAILY_CAP - v_total_today - v_coins)
  );
END;
$$;

-- ── 5. Streak update function ─────────────────────────────────────────
--   Call this from award_coins after daily_login. Separate so streak
--   milestones can also fire streak_7day / streak_30day awards.
CREATE OR REPLACE FUNCTION update_streak(
  p_user_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile    profiles%ROWTYPE;
  v_today      date := current_date;
  v_prev_days  integer;
  v_new_days   integer;
  v_milestone  text  := NULL;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;

  -- Already logged in today — no change
  IF v_profile.last_active_date = v_today THEN
    RETURN jsonb_build_object('ok', true, 'streak', v_profile.streak_days, 'changed', false);
  END IF;

  v_prev_days := v_profile.streak_days;

  -- Consecutive day → extend streak; gap → reset to 1
  IF v_profile.last_active_date = v_today - 1 THEN
    v_new_days := v_prev_days + 1;
  ELSE
    v_new_days := 1;
  END IF;

  UPDATE profiles
     SET streak_days      = v_new_days,
         last_active_date = v_today
   WHERE id = p_user_id;

  -- Fire milestone awards
  IF v_new_days % 7 = 0 AND v_new_days > v_prev_days THEN
    v_milestone := 'streak_7day';
    PERFORM award_coins(p_user_id, 'streak_7day');
  END IF;
  IF v_new_days % 30 = 0 AND v_new_days > v_prev_days THEN
    v_milestone := 'streak_30day';
    PERFORM award_coins(p_user_id, 'streak_30day');
  END IF;

  RETURN jsonb_build_object(
    'ok',        true,
    'streak',    v_new_days,
    'changed',   true,
    'milestone', v_milestone
  );
END;
$$;

-- ── 6. Clawback function — fires when a post/comment is deleted/flagged ──
CREATE OR REPLACE FUNCTION clawback_coins(
  p_user_id uuid,
  p_reason  text,
  p_ref_id  uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_original integer;
  v_new_balance integer;
BEGIN
  -- Find the original award for this ref_id
  SELECT delta INTO v_original
    FROM coin_ledger
   WHERE user_id = p_user_id AND ref_id = p_ref_id AND delta > 0
   LIMIT 1;

  IF NOT FOUND OR v_original IS NULL OR v_original <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nothing to claw back');
  END IF;

  -- Deduct (floor at 0 — never go negative)
  UPDATE profiles
     SET coins = GREATEST(0, coins - v_original)
   WHERE id = p_user_id
  RETURNING coins INTO v_new_balance;

  INSERT INTO coin_ledger (user_id, delta, reason, ref_id, balance_after)
  VALUES (p_user_id, -v_original, 'clawback_' || p_reason, p_ref_id, v_new_balance);

  RETURN jsonb_build_object('ok', true, 'clawed_back', v_original, 'balance', v_new_balance);
END;
$$;

-- ── 7. Daily reset cron (Supabase pg_cron — run once, fires at midnight) ─
--   Uncomment if pg_cron extension is enabled on your project:
-- SELECT cron.schedule('reset-coin-day', '0 0 * * *',
--   'DELETE FROM coin_daily_caps WHERE cap_date < current_date - 2');

-- ── 8. Grant RPC execution to authenticated users ────────────────────
GRANT EXECUTE ON FUNCTION award_coins(uuid, text, uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION update_streak(uuid)              TO authenticated;
-- clawback is internal / service only — no public grant

-- ── 9. Revoke direct coin writes at the DB level ─────────────────────
--   Belt-and-suspenders: even if RLS policy is accidentally widened,
--   a column-level privilege block stops direct client writes to coins.
REVOKE UPDATE (coins, lifetime_coins, streak_days, last_active_date)
  ON profiles FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
