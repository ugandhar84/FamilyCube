-- Migration: notification tier gating
-- 1. Add subscription_tier column so each log row records the tier it was sent for.
-- 2. Lock down the INSERT policy so only service_role (edge functions) can write.
-- Run once: psql $DATABASE_URL < supabase/migration_notification_tier_gate.sql

-- ── 1. Add tier column ────────────────────────────────────────────────────────
ALTER TABLE notification_logs
  ADD COLUMN IF NOT EXISTS subscription_tier text
    CHECK (subscription_tier IN ('free', 'pro', 'ultimate'));

-- ── 2. Drop the overly permissive INSERT policy ───────────────────────────────
-- Old policy allowed any authenticated user to insert their own rows.
-- Notifications should only be written by server-side cron/edge functions.
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON notification_logs;

-- ── 3. New INSERT policy: service_role only ───────────────────────────────────
-- Edge functions run with SUPABASE_SERVICE_ROLE_KEY which bypasses RLS entirely,
-- so this policy is a belt-and-braces guard against client-side abuse.
CREATE POLICY "Service role can insert notifications"
  ON notification_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);
