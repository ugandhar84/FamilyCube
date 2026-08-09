ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS overlay_caption text;
NOTIFY pgrst, 'reload schema';
