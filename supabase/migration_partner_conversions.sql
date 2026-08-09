-- ═══════════════════════════════════════════════════════════════════════
-- PARTNER CONVERSIONS
-- Tracks confirmed purchases via partner webhooks.
-- Also adds: profiles.push_token (if not present), profiles.email mirror,
-- and app_settings row for conversion bonus coins.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. push_token on profiles (needed by send-coupon + partner-webhook) ──
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_token text,
  ADD COLUMN IF NOT EXISTS email      text;   -- mirrored from auth.users for edge functions

-- ── 2. partner_conversions table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_conversions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner      text        NOT NULL,                  -- 'amazon' | 'chewy' | 'petsmart' | 'petco'
  coupon_id    uuid        REFERENCES user_coupons(id) ON DELETE SET NULL,
  user_id      uuid        REFERENCES auth.users(id)  ON DELETE SET NULL,
  order_id     text,                                  -- partner's order/transaction ref
  order_amount numeric(10,2),                         -- purchase value USD
  commission   numeric(10,2),                         -- our commission USD (if reported)
  bonus_coins  integer     NOT NULL DEFAULT 0,        -- coins awarded to user
  status       text        NOT NULL DEFAULT 'converted', -- converted | unattributed | refunded
  raw          jsonb,                                 -- full raw webhook payload for debugging
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE partner_conversions ENABLE ROW LEVEL SECURITY;

-- Admins can read all; users can read their own
CREATE POLICY "Users see own conversions"
  ON partner_conversions FOR SELECT
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_partner_conversions_user
  ON partner_conversions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_conversions_coupon
  ON partner_conversions (coupon_id);
CREATE INDEX IF NOT EXISTS idx_partner_conversions_partner
  ON partner_conversions (partner, created_at DESC);

-- ── 3. app_settings: conversion bonus coins config ───────────────────────
INSERT INTO app_settings (key, value)
VALUES ('conversion_bonus_coins', '{"default_bonus": 25}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── 4. View: revenue dashboard for admin ────────────────────────────────
CREATE OR REPLACE VIEW admin_conversion_summary AS
SELECT
  partner,
  COUNT(*)                                    AS total_conversions,
  COUNT(*) FILTER (WHERE status = 'converted') AS attributed,
  COUNT(*) FILTER (WHERE status = 'unattributed') AS unattributed,
  COALESCE(SUM(commission)  FILTER (WHERE status = 'converted'), 0) AS total_commission_usd,
  COALESCE(SUM(order_amount) FILTER (WHERE status = 'converted'), 0) AS total_gmv_usd,
  COALESCE(SUM(bonus_coins)  FILTER (WHERE status = 'converted'), 0) AS total_bonus_coins_issued,
  MAX(created_at) AS last_conversion_at
FROM partner_conversions
GROUP BY partner
ORDER BY total_commission_usd DESC;

NOTIFY pgrst, 'reload schema';
