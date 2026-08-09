ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS is_media_blocked boolean NOT NULL DEFAULT false;
