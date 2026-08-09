-- Add youtube_url to product recommendations and sponsored listings
ALTER TABLE pet_products
  ADD COLUMN IF NOT EXISTS youtube_url text;

ALTER TABLE sponsored_listings
  ADD COLUMN IF NOT EXISTS youtube_url text;
