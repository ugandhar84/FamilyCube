-- Sponsored listings — admin-managed promotions shown in Discovery/Home
-- Run once: psql $DATABASE_URL < supabase/migration_sponsored_listings.sql

CREATE TABLE IF NOT EXISTS sponsored_listings (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  category      text         NOT NULL CHECK (category IN ('clinic','food','toy','facility','grooming','boarding','training','insurance','other')),
  business_name text         NOT NULL,
  tagline       text,
  description   text,
  logo_url      text,
  cover_url     text,
  website_url   text,
  phone         text,
  address       text,
  city          text,
  state         text,
  country       text         DEFAULT 'US',
  lat           numeric(10,6),
  lng           numeric(10,6),
  target_species text[]      DEFAULT '{}',   -- empty = all species
  cta_label     text         DEFAULT 'Learn More',
  cta_url       text,
  is_active     boolean      NOT NULL DEFAULT true,
  is_featured   boolean      NOT NULL DEFAULT false,
  priority      int          NOT NULL DEFAULT 0,  -- higher = shown first
  starts_at     timestamptz,
  ends_at       timestamptz,
  impressions   bigint       NOT NULL DEFAULT 0,
  clicks        bigint       NOT NULL DEFAULT 0,
  created_by    uuid         REFERENCES auth.users(id),
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsored_active    ON sponsored_listings (is_active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_sponsored_category  ON sponsored_listings (category);
CREATE INDEX IF NOT EXISTS idx_sponsored_featured  ON sponsored_listings (is_featured) WHERE is_featured = true;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION _sponsored_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_sponsored_updated_at ON sponsored_listings;
CREATE TRIGGER trg_sponsored_updated_at
  BEFORE UPDATE ON sponsored_listings
  FOR EACH ROW EXECUTE FUNCTION _sponsored_set_updated_at();

-- RLS
ALTER TABLE sponsored_listings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read active listings (shown in-app)
CREATE POLICY "read active listings" ON sponsored_listings
  FOR SELECT USING (is_active = true OR EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  ));

-- Only admins can write
CREATE POLICY "admin write" ON sponsored_listings
  FOR ALL USING (
    auth.role() = 'service_role'
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );
