-- Care gamification: add care actions to award_coins RPC
-- Run once: psql $DATABASE_URL < supabase/migration_care_coins.sql
--
-- New actions added to award_coins():
--   care_meal          3 coins · 2x/day (per pet, deduped by p_ref_id = pet_id)
--   care_mood          5 coins · 1x/day per pet
--   care_walk          5 coins · 1x/day per pet
--   care_groom         8 coins · 1x/day per pet
--   care_day_complete  20 coins · 1x/day per pet (ring hits 100%)
--   care_streak_3      15 coins · 1x (3-day care streak)
--   care_streak_7      50 coins · 1x (7-day care streak)
--   care_streak_30     200 coins · 1x (30-day care streak)
--
-- Also creates: pet_care_streaks table to track consecutive care-completion days.

-- ── pet_care_streaks ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pet_care_streaks (
  pet_id          uuid PRIMARY KEY REFERENCES pets(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  current_streak  integer NOT NULL DEFAULT 0,
  longest_streak  integer NOT NULL DEFAULT 0,
  last_complete_date date,
  updated_at      timestamptz DEFAULT now()
);
ALTER TABLE pet_care_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON pet_care_streaks FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Update award_coins to include care actions ───────────────────────────────
CREATE OR REPLACE FUNCTION award_coins(
  p_user_id  uuid,
  p_action   text,
  p_ref_id   uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  DEFAULT_RATES  constant jsonb := '{
    "daily_login":        10,
    "post_created":       20,
    "post_liked":          2,
    "comment_added":       5,
    "streak_7day":        50,
    "streak_30day":      200,
    "level_up":          100,
    "care_meal":           3,
    "care_mood":           5,
    "care_walk":           5,
    "care_groom":          8,
    "care_day_complete":  20,
    "care_streak_3":      15,
    "care_streak_7":      50,
    "care_streak_30":    200
  }';

  -- Max events per action per day (ref_id-scoped for pet actions)
  ACTION_CAPS constant jsonb := '{
    "daily_login":        1,
    "post_created":       3,
    "post_liked":        10,
    "comment_added":      5,
    "streak_7day":        1,
    "streak_30day":       1,
    "level_up":           5,
    "care_meal":          2,
    "care_mood":          1,
    "care_walk":          1,
    "care_groom":         1,
    "care_day_complete":  1,
    "care_streak_3":      1,
    "care_streak_7":      1,
    "care_streak_30":     1
  }';

  ACTION_COOLDOWNS constant jsonb := '{
    "post_created":  300,
    "comment_added": 120
  }';

  -- Care actions are capped per (action, ref_id=pet_id) not globally per action
  PET_SCOPED_ACTIONS constant text[] := ARRAY[
    'care_meal','care_mood','care_walk','care_groom','care_day_complete'
  ];

  GLOBAL_DAILY_CAP constant integer := 200;
  MIN_ACCOUNT_AGE  constant interval := '48 hours';

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

  IF NOT (DEFAULT_RATES ? p_action) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unknown action', 'skip', true);
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User not found');
  END IF;

  SELECT * INTO v_auth FROM auth.users WHERE id = p_user_id;

  IF v_auth.created_at > now() - MIN_ACCOUNT_AGE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Account too new', 'skip', true);
  END IF;

  IF v_auth.email_confirmed_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Email not verified', 'skip', true);
  END IF;

  -- Global daily cap (coins earned today)
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

  -- Per-action daily cap (pet-scoped actions use ref_id in the key)
  v_daily_limit := (ACTION_CAPS ->> p_action)::integer;

  IF p_action = ANY(PET_SCOPED_ACTIONS) AND p_ref_id IS NOT NULL THEN
    -- Count events for this action+pet today
    SELECT COALESCE(SUM(count), 0) INTO v_cap_count
      FROM coin_daily_caps
     WHERE user_id = p_user_id
       AND action   = p_action
       AND ref_id   = p_ref_id
       AND cap_date = v_today;
  ELSE
    SELECT COALESCE(count, 0) INTO v_cap_count
      FROM coin_daily_caps
     WHERE user_id = p_user_id
       AND action   = p_action
       AND cap_date = v_today;
  END IF;

  IF v_cap_count >= v_daily_limit THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'Action daily cap reached',
      'action', p_action, 'count', v_cap_count, 'cap', v_daily_limit, 'skip', true
    );
  END IF;

  -- Cooldown check
  v_cooldown_secs := (ACTION_COOLDOWNS ->> p_action)::integer;
  IF v_cooldown_secs IS NOT NULL THEN
    SELECT MAX(created_at) INTO v_last_action_at
      FROM coin_ledger
     WHERE user_id = p_user_id AND action = p_action;
    IF v_last_action_at IS NOT NULL AND v_last_action_at > now() - (v_cooldown_secs || ' seconds')::interval THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Cooldown active', 'skip', true);
    END IF;
  END IF;

  -- Resolve coin amount (admin override wins)
  SELECT coins_config INTO v_admin_rates FROM app_config WHERE id = 1;
  v_coins := COALESCE(
    (v_admin_rates ->> p_action)::integer,
    (DEFAULT_RATES ->> p_action)::integer
  );

  -- Award
  UPDATE profiles SET coins = COALESCE(coins, 0) + v_coins WHERE id = p_user_id
    RETURNING coins INTO v_new_balance;

  INSERT INTO coin_ledger (user_id, delta, action, ref_id, balance_after)
    VALUES (p_user_id, v_coins, p_action, p_ref_id, v_new_balance);

  INSERT INTO coin_daily_caps (user_id, action, ref_id, cap_date, count)
    VALUES (p_user_id, p_action, p_ref_id, v_today, 1)
    ON CONFLICT (user_id, action, ref_id, cap_date) DO UPDATE
      SET count = coin_daily_caps.count + 1;

  RETURN jsonb_build_object(
    'ok', true,
    'coins_awarded', v_coins,
    'balance', v_new_balance,
    'today_earned', v_total_today + v_coins,
    'daily_cap', GLOBAL_DAILY_CAP,
    'remaining', GREATEST(0, GLOBAL_DAILY_CAP - v_total_today - v_coins)
  );
END;
$$;

-- Allow ref_id in coin_daily_caps unique key if not already nullable
-- (existing key is user_id, action, cap_date — needs ref_id for pet-scoped)
ALTER TABLE coin_daily_caps ADD COLUMN IF NOT EXISTS ref_id uuid;
DROP INDEX IF EXISTS coin_daily_caps_pkey;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coin_daily_caps_user_action_ref_date_key'
  ) THEN
    ALTER TABLE coin_daily_caps DROP CONSTRAINT IF EXISTS coin_daily_caps_pkey;
    ALTER TABLE coin_daily_caps ADD CONSTRAINT coin_daily_caps_user_action_ref_date_key
      UNIQUE (user_id, action, ref_id, cap_date);
  END IF;
END$$;
