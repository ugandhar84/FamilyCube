-- FurEver — Discovery & sponsored partners (monetization)
-- Run once in Supabase dashboard SQL editor.
--
-- Powers the home-screen "Near you" carousel and "Picked for <pet>" product card.
-- Two catalogs:
--   partners      → local services (vets, grooming, stores) with optional sponsored placement
--   pet_products  → product feed (food, supplies) matched to a pet's species/size/age
-- Both are public read-only catalogs; rows are seeded/managed by admins (service role),
-- never written by app users.

-- ──────────────────────────────────────────────────────────────────────────
-- Partners (local services)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partners (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  category     text NOT NULL CHECK (category IN ('vet','grooming','food','store','boarding','training','other')),
  subtitle     text,                       -- e.g. "Veterinary · 24/7 ER"
  lat          double precision,
  lng          double precision,
  city         text,
  rating       numeric(2,1),               -- 0.0 – 5.0
  price_from   numeric(10,2),              -- nullable "from $X"
  is_24h       boolean NOT NULL DEFAULT false,
  phone        text,
  -- which pet species this partner is relevant to; NULL/empty = all species
  species      text[],
  emoji        text,
  image_url    text,
  accent_color text,
  -- monetization
  sponsored    boolean NOT NULL DEFAULT false,
  sponsor_rank integer NOT NULL DEFAULT 0, -- higher = shown first among sponsored
  cta_label    text NOT NULL DEFAULT 'View',
  cta_url      text,
  -- lifecycle
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partners_active_cat_idx ON partners (active, category);
CREATE INDEX IF NOT EXISTS partners_geo_idx        ON partners (lat, lng);

-- ──────────────────────────────────────────────────────────────────────────
-- Pet products (matched product feed)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pet_products (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand          text,
  name           text NOT NULL,
  category       text NOT NULL DEFAULT 'food', -- food | treats | supplement | supplies
  -- matching dimensions (NULL = matches any)
  species        text,                          -- 'dog' | 'cat' | ...
  breed_size     text CHECK (breed_size IN ('small','medium','large')),
  min_age_years  numeric(4,1),
  max_age_years  numeric(4,1),
  price          numeric(10,2),
  original_price numeric(10,2),
  emoji          text,
  image_url      text,
  -- monetization
  sponsored      boolean NOT NULL DEFAULT true,
  sponsor_rank   integer NOT NULL DEFAULT 0,
  cta_label      text NOT NULL DEFAULT 'Shop',
  cta_url        text,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pet_products_match_idx ON pet_products (active, species, breed_size);

-- ──────────────────────────────────────────────────────────────────────────
-- RLS — public read of active rows only; no user writes
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE partners     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partners are publicly readable"     ON partners;
DROP POLICY IF EXISTS "Products are publicly readable"      ON pet_products;

CREATE POLICY "Partners are publicly readable"
  ON partners FOR SELECT TO anon, authenticated
  USING (active = true);

CREATE POLICY "Products are publicly readable"
  ON pet_products FOR SELECT TO anon, authenticated
  USING (active = true);

-- ──────────────────────────────────────────────────────────────────────────
-- RPC — nearby partners with haversine distance (no PostGIS dependency)
--   p_lat/p_lng NULL  → distance NULL, ordered by sponsored + rating ("popular")
--   p_category  NULL  → all categories
--   p_species   NULL  → all species, else partners whose species[] is NULL or contains it
-- Ordering: sponsored first (by sponsor_rank), then nearest, then highest rated.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_nearby_partners(
  p_lat      double precision DEFAULT NULL,
  p_lng      double precision DEFAULT NULL,
  p_category text             DEFAULT NULL,
  p_species  text             DEFAULT NULL,
  p_limit    integer          DEFAULT 12
)
RETURNS TABLE (
  id           uuid,
  name         text,
  category     text,
  subtitle     text,
  city         text,
  rating       numeric,
  price_from   numeric,
  is_24h       boolean,
  phone        text,
  emoji        text,
  image_url    text,
  accent_color text,
  sponsored    boolean,
  cta_label    text,
  cta_url      text,
  distance_km  double precision
)
LANGUAGE sql STABLE AS $$
  SELECT
    p.id, p.name, p.category, p.subtitle, p.city, p.rating, p.price_from,
    p.is_24h, p.phone, p.emoji, p.image_url, p.accent_color,
    p.sponsored, p.cta_label, p.cta_url,
    CASE
      WHEN p_lat IS NULL OR p_lng IS NULL OR p.lat IS NULL OR p.lng IS NULL THEN NULL
      ELSE 6371 * acos(
        LEAST(1.0,
          cos(radians(p_lat)) * cos(radians(p.lat)) *
          cos(radians(p.lng) - radians(p_lng)) +
          sin(radians(p_lat)) * sin(radians(p.lat))
        )
      )
    END AS distance_km
  FROM partners p
  WHERE p.active = true
    AND (p_category IS NULL OR p.category = p_category)
    AND (p_species  IS NULL OR p.species IS NULL OR cardinality(p.species) = 0 OR p_species = ANY(p.species))
  ORDER BY
    p.sponsored DESC,
    p.sponsor_rank DESC,
    distance_km ASC NULLS LAST,
    p.rating DESC NULLS LAST
  LIMIT GREATEST(1, p_limit);
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- Seed data (sample — replace with real partner inventory)
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO partners (name, category, subtitle, city, rating, price_from, is_24h, species, emoji, accent_color, sponsored, sponsor_rank, cta_label, cta_url)
VALUES
  ('Paws & Claws Clinic', 'vet',      'Veterinary · 24/7 ER',     'San Francisco', 4.8, NULL,  true,  ARRAY['dog','cat'], '🩺', '#7C5CBF', true,  100, 'Book visit', 'https://example.com/paws'),
  ('Fluffy Tails Spa',    'grooming', 'Grooming · Bath & trim',   'San Francisco', 4.6, 35.00, false, ARRAY['dog','cat'], '✂️', '#FF8C55', false, 0,   'View',       'https://example.com/fluffy'),
  ('PetMart Superstore',  'food',     'Pet store · Food & toys',  'San Francisco', 4.4, NULL,  false, NULL,               '🛍️', '#4ECDC4', true,  50,  'Shop',       'https://example.com/petmart'),
  ('Happy Hounds Boarding','boarding','Boarding · Day care',      'San Francisco', 4.7, 40.00, false, ARRAY['dog'],       '🏠', '#E8A320', false, 0,   'View',       'https://example.com/hounds')
ON CONFLICT DO NOTHING;

INSERT INTO pet_products (brand, name, category, species, breed_size, min_age_years, max_age_years, price, original_price, emoji, sponsored, sponsor_rank, cta_label, cta_url)
VALUES
  ('Royal Canin', 'Golden Retriever Adult', 'food', 'dog', 'large',  1, 7,  54.99, 64.00, '🦴', true, 100, 'Shop', 'https://example.com/rc-golden'),
  ('Hill''s',      'Science Diet Puppy',     'food', 'dog', 'large',  0, 1,  48.00, NULL,  '🍖', true, 80,  'Shop', 'https://example.com/hills-puppy'),
  ('Purina',      'Pro Plan Indoor Cat',    'food', 'cat', NULL,     1, 12, 32.99, 39.00, '🐟', true, 90,  'Shop', 'https://example.com/purina-cat'),
  ('Blue Buffalo','Wilderness Small Breed',  'food', 'dog', 'small',  1, 8,  39.99, NULL,  '🦴', true, 70,  'Shop', 'https://example.com/bb-small')
ON CONFLICT DO NOTHING;
