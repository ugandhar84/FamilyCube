-- Subscriptions table — synced from RevenueCat webhook
CREATE TABLE IF NOT EXISTS subscriptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier              text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'ultimate')),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'grace_period')),
  product_id        text,
  platform          text CHECK (platform IN ('ios', 'android', 'stripe')),
  expires_at        timestamptz,
  revenuecat_app_user_id text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- One subscription record per user
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions(user_id);

-- RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role (webhook) can insert/update
CREATE POLICY "Service role can manage subscriptions"
  ON subscriptions FOR ALL
  USING (auth.role() = 'service_role');

-- Usage tracking table — tracks per-user per-month feature usage
CREATE TABLE IF NOT EXISTS subscription_usage (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature     text NOT NULL,
  period      text NOT NULL, -- 'YYYY-MM' format
  count       int NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, feature, period)
);

ALTER TABLE subscription_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage"
  ON subscription_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own usage"
  ON subscription_usage FOR ALL
  USING (auth.uid() = user_id);

-- RPC: increment usage count atomically, returns new count
CREATE OR REPLACE FUNCTION increment_feature_usage(
  p_user_id uuid,
  p_feature  text,
  p_period   text
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO subscription_usage(user_id, feature, period, count, updated_at)
  VALUES (p_user_id, p_feature, p_period, 1, now())
  ON CONFLICT (user_id, feature, period)
  DO UPDATE SET count = subscription_usage.count + 1, updated_at = now()
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

-- RPC: get current usage count
CREATE OR REPLACE FUNCTION get_feature_usage(
  p_user_id uuid,
  p_feature  text,
  p_period   text
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count int;
BEGIN
  SELECT count INTO v_count
  FROM subscription_usage
  WHERE user_id = p_user_id AND feature = p_feature AND period = p_period;
  RETURN COALESCE(v_count, 0);
END;
$$;
