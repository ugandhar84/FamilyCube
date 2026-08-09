-- Rename 'paw_pro' tier to 'ultimate' across all tables

-- 1. subscriptions table
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_tier_check;
UPDATE subscriptions SET tier = 'ultimate' WHERE tier = 'paw_pro';
UPDATE subscriptions SET fallback_tier = 'ultimate' WHERE fallback_tier = 'paw_pro';
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_tier_check
  CHECK (tier IN ('free', 'pro', 'ultimate'));

-- 2. notifications table tier gate (only if it exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_subscription_tier_check;
    UPDATE notifications SET subscription_tier = 'ultimate' WHERE subscription_tier = 'paw_pro';
    ALTER TABLE notifications ADD CONSTRAINT notifications_subscription_tier_check
      CHECK (subscription_tier IN ('free', 'pro', 'ultimate'));
  END IF;
END $$;

-- 3. Update RLS policy that references tier values (only if posts table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'posts') THEN
    DROP POLICY IF EXISTS "video_posts_tier_gate" ON posts;
    CREATE POLICY "video_posts_tier_gate" ON posts
      FOR INSERT WITH CHECK (
        video_url IS NULL
        OR get_user_tier(auth.uid()) IN ('pro', 'ultimate')
      );
  END IF;
END $$;

-- 4. Update app_settings pricing keys
UPDATE app_settings SET key = 'pricing_ultimate_monthly' WHERE key = 'pricing_pawpro_monthly';
UPDATE app_settings SET key = 'pricing_ultimate_annual'  WHERE key = 'pricing_pawpro_annual';
UPDATE app_settings SET key = 'storage_cap_ultimate_bytes' WHERE key = 'storage_cap_pawpro_bytes';
