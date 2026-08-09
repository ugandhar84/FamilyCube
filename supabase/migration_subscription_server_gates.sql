-- ── Server-side subscription enforcement gates ────────────────────────────────
-- Adds DB-level tier checks that can't be bypassed by direct API calls.
-- Run once: psql $DATABASE_URL < supabase/migration_subscription_server_gates.sql

-- ── Helper: current user's active tier ────────────────────────────────────────
-- Returns 'free' when no active subscription row exists.
CREATE OR REPLACE FUNCTION get_user_tier(uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (
      SELECT tier FROM subscriptions
      WHERE user_id = uid
        AND status IN ('active', 'trialing')
        AND (expires_at IS NULL OR expires_at > now())
      LIMIT 1
    ),
    'free'
  );
$$;

-- ── Helper: check monthly post count for a user ───────────────────────────────
CREATE OR REPLACE FUNCTION user_post_count_this_month(uid uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::integer
  FROM social_posts
  WHERE author_id = uid
    AND created_at >= date_trunc('month', now());
$$;

-- ── social_posts: enforce video + monthly limits at DB level ──────────────────

-- Drop the old unrestricted INSERT policy
DROP POLICY IF EXISTS "social_posts: caretaker+ can insert" ON social_posts;

-- New INSERT policy:
--   1. Caller must be caretaker or owner (existing role gate)
--   2. Video posts require Pro or Ultimate
--   3. Free tier limited to 5 posts per calendar month
CREATE POLICY "social_posts: caretaker+ can insert with tier check"
  ON social_posts FOR INSERT
  WITH CHECK (
    can_log_health(pet_id)
    -- video posts: Pro or Ultimate only
    AND (
      media_type IS DISTINCT FROM 'video'
      OR get_user_tier(auth.uid()) IN ('pro', 'ultimate')
    )
    -- free tier: max 5 feed posts per month
    AND (
      get_user_tier(auth.uid()) != 'free'
      OR user_post_count_this_month(auth.uid()) < 5
    )
  );

-- ── Grant execute rights on helpers to authenticated users ────────────────────
GRANT EXECUTE ON FUNCTION get_user_tier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION user_post_count_this_month(uuid) TO authenticated;
