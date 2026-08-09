ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notif_post_like    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_post_comment boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_follow       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_mention      boolean NOT NULL DEFAULT true;
