ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS fit_frame boolean NOT NULL DEFAULT false;
NOTIFY pgrst, 'reload schema';
