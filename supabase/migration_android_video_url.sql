-- Add Android-specific video URL column (mp4) to pet_products.
-- iOS uses video_url (.mov); Android uses android_video_url (.mp4).
ALTER TABLE pet_products
  ADD COLUMN IF NOT EXISTS android_video_url text;
