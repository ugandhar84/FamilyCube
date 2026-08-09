-- Per-user pet profile privacy settings.
-- All sections default to true (public). Users can toggle sections off
-- to hide them from visitors viewing any of their pets' profiles.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pet_show_about       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pet_show_vaccines     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pet_show_allergies    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pet_show_vet_visits   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pet_show_weight       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pet_show_milestones   boolean NOT NULL DEFAULT true;
