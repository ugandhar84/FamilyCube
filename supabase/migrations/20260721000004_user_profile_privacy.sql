ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS profile_show_full_name boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS profile_show_email     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_show_photo     boolean NOT NULL DEFAULT true;
