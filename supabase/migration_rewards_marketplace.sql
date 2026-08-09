-- ═══════════════════════════════════════════════════════════════════
-- REWARDS MARKETPLACE
-- Partner coupon offers + user coin wallet + redemption history
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Coin wallet on profiles ───────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_coins integer NOT NULL DEFAULT 0;

-- ── 2. Partner offers catalogue ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_offers (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_name text        NOT NULL,                 -- "Amazon", "Chewy", "PetSmart"
  partner_logo text,                                 -- public image URL or emoji fallback
  title        text        NOT NULL,                 -- "15% off dog food"
  description  text,
  category     text        NOT NULL DEFAULT 'food',  -- food | accessories | grooming | vet | toys
  coins_cost   integer     NOT NULL,                 -- coins user pays to redeem
  discount_pct integer,                              -- e.g. 15  (display only)
  discount_amt numeric(8,2),                         -- e.g. 5.00 (display only)
  coupon_type  text        NOT NULL DEFAULT 'code',  -- code | link | qr
  -- Pool of pre-loaded codes (admin fills these); NULL = dynamic/affiliate link
  coupon_pool  text[],
  affiliate_url text,                                -- deeplink for affiliate offers
  max_uses_per_user integer NOT NULL DEFAULT 1,
  total_stock  integer,                              -- NULL = unlimited
  redeemed_count integer   NOT NULL DEFAULT 0,
  valid_from   timestamptz NOT NULL DEFAULT now(),
  valid_until  timestamptz,                          -- NULL = no expiry
  is_active    boolean     NOT NULL DEFAULT true,
  is_featured  boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE partner_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active offers"
  ON partner_offers FOR SELECT USING (is_active = true);

-- ── 3. User redeemed coupons ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_coupons (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_id     uuid        NOT NULL REFERENCES partner_offers(id) ON DELETE CASCADE,
  coupon_code  text,                                 -- NULL for affiliate links
  coins_spent  integer     NOT NULL,
  status       text        NOT NULL DEFAULT 'active',  -- active | used | expired
  redeemed_at  timestamptz NOT NULL DEFAULT now(),
  used_at      timestamptz,
  expires_at   timestamptz
);

ALTER TABLE user_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own coupons"
  ON user_coupons FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own coupons"
  ON user_coupons FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own coupons"
  ON user_coupons FOR UPDATE USING (user_id = auth.uid());

-- ── 4. Coin transaction ledger ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS coin_ledger (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta        integer     NOT NULL,                 -- positive = earn, negative = spend
  reason       text        NOT NULL,                 -- 'daily_login' | 'post_like' | 'redeem_coupon' | etc.
  ref_id       uuid,                                 -- optional FK to the triggering row
  balance_after integer    NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coin_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own ledger"
  ON coin_ledger FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own ledger"
  ON coin_ledger FOR INSERT WITH CHECK (user_id = auth.uid());

-- ── 5. Indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_partner_offers_active   ON partner_offers (is_active, valid_until);
CREATE INDEX IF NOT EXISTS idx_partner_offers_category ON partner_offers (category);
CREATE INDEX IF NOT EXISTS idx_user_coupons_user       ON user_coupons (user_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_ledger_user        ON coin_ledger (user_id, created_at DESC);

-- ── 6. Atomic redemption function (runs as SECURITY DEFINER) ─────────
CREATE OR REPLACE FUNCTION redeem_offer(
  p_user_id   uuid,
  p_offer_id  uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_offer       partner_offers%ROWTYPE;
  v_profile     profiles%ROWTYPE;
  v_balance     integer;
  v_coupon_code text;
  v_coupon_id   uuid;
  v_already     integer;
  v_expires_at  timestamptz;
BEGIN
  -- Lock offer row
  SELECT * INTO v_offer FROM partner_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND OR NOT v_offer.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Offer not available');
  END IF;

  -- Check expiry
  IF v_offer.valid_until IS NOT NULL AND v_offer.valid_until < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Offer has expired');
  END IF;

  -- Check stock
  IF v_offer.total_stock IS NOT NULL AND v_offer.redeemed_count >= v_offer.total_stock THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Offer is sold out');
  END IF;

  -- Check per-user limit
  SELECT COUNT(*) INTO v_already
    FROM user_coupons
   WHERE user_id = p_user_id AND offer_id = p_offer_id;
  IF v_already >= v_offer.max_uses_per_user THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Already redeemed this offer');
  END IF;

  -- Check user balance
  SELECT coins INTO v_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_balance < v_offer.coins_cost THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not enough coins',
                              'need', v_offer.coins_cost, 'have', v_balance);
  END IF;

  -- Pop a code from the pool (if pool-based)
  IF v_offer.coupon_type = 'code' AND v_offer.coupon_pool IS NOT NULL AND array_length(v_offer.coupon_pool, 1) > 0 THEN
    v_coupon_code := v_offer.coupon_pool[1];
    UPDATE partner_offers
       SET coupon_pool     = coupon_pool[2:],
           redeemed_count  = redeemed_count + 1
     WHERE id = p_offer_id;
  ELSE
    -- Affiliate link: no code needed, just increment count
    v_coupon_code := NULL;
    UPDATE partner_offers
       SET redeemed_count = redeemed_count + 1
     WHERE id = p_offer_id;
  END IF;

  -- Deduct coins
  UPDATE profiles
     SET coins          = coins - v_offer.coins_cost,
         lifetime_coins = lifetime_coins  -- lifetime never decrements
   WHERE id = p_user_id;

  -- Compute expiry (30 days from redemption if no offer expiry)
  v_expires_at := COALESCE(v_offer.valid_until, now() + interval '30 days');

  -- Record coupon
  INSERT INTO user_coupons (user_id, offer_id, coupon_code, coins_spent, expires_at)
  VALUES (p_user_id, p_offer_id, v_coupon_code, v_offer.coins_cost, v_expires_at)
  RETURNING id INTO v_coupon_id;

  -- Ledger entry
  SELECT coins INTO v_balance FROM profiles WHERE id = p_user_id;
  INSERT INTO coin_ledger (user_id, delta, reason, ref_id, balance_after)
  VALUES (p_user_id, -v_offer.coins_cost, 'redeem_coupon', v_coupon_id, v_balance);

  RETURN jsonb_build_object(
    'ok',          true,
    'coupon_id',   v_coupon_id,
    'coupon_code', v_coupon_code,
    'affiliate_url', v_offer.affiliate_url,
    'coins_left',  v_balance
  );
END;
$$;

-- ── 7. Seed demo offers (admin can replace/expand these) ──────────────
INSERT INTO partner_offers
  (partner_name, partner_logo, title, description, category, coins_cost,
   discount_pct, coupon_type, affiliate_url, is_featured, valid_until)
VALUES
  ('Amazon Pet',  '🛒', '10% off Royal Canin',
   'Use at checkout on any Royal Canin dog or cat food bag.',
   'food', 300, 10, 'link',
   'https://amzn.to/pawbond-rc',  true,  now() + interval '90 days'),

  ('Chewy',       '🐾', '15% off first Chewy order',
   'New Chewy customers only. Applies to any order over $25.',
   'food', 500, 15, 'link',
   'https://www.chewy.com/?ref=pawbond', true, now() + interval '60 days'),

  ('PetSmart',    '🏪', '$5 off grooming appointment',
   'Valid at any PetSmart salon. Book in-store or online.',
   'grooming', 200, NULL, 'code',
   NULL, false, now() + interval '45 days'),

  ('Amazon Pet',  '🛒', '20% off cat toys bundle',
   'Save on a 3-pack of interactive cat toys.',
   'toys', 400, 20, 'link',
   'https://amzn.to/pawbond-toys', false, now() + interval '30 days'),

  ('PetSmart',    '🏪', 'Free nail trim',
   'One complimentary nail trim per pet. In-store only.',
   'grooming', 150, NULL, 'code',
   NULL, false, now() + interval '30 days'),

  ('Petco',       '🐶', '10% off vet visit',
   'Valid at Petco Vetco clinics for routine check-ups.',
   'vet', 600, 10, 'link',
   'https://www.petco.com/vetco?ref=pawbond', false, now() + interval '90 days')
ON CONFLICT DO NOTHING;

-- Seed one demo code pool for the PetSmart grooming offer
UPDATE partner_offers
   SET coupon_pool = ARRAY['PAWS5OFF-A1','PAWS5OFF-B2','PAWS5OFF-C3','PAWS5OFF-D4','PAWS5OFF-E5']
 WHERE partner_name = 'PetSmart' AND title = '$5 off grooming appointment';

NOTIFY pgrst, 'reload schema';
