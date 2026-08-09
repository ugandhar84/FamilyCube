-- Add multi-photo support to social_posts
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS photo_urls text[] DEFAULT '{}';

-- Backfill: existing single photo_url rows get their URL into the array
UPDATE social_posts SET photo_urls = ARRAY[photo_url] WHERE photo_url IS NOT NULL AND (photo_urls IS NULL OR photo_urls = '{}');
