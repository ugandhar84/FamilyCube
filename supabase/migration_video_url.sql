-- Add video_url to pet_products (recommendations)
ALTER TABLE pet_products
  ADD COLUMN IF NOT EXISTS video_url text;

-- Add video_url to sponsored_listings (sponsored ads)
ALTER TABLE sponsored_listings
  ADD COLUMN IF NOT EXISTS video_url text;
