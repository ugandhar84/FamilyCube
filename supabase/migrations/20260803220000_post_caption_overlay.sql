ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS caption_overlay boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
