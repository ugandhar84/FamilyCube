-- Add AI recipe fields to family_meals
ALTER TABLE family_meals
  ADD COLUMN IF NOT EXISTS emoji            text,
  ADD COLUMN IF NOT EXISTS prep_minutes     integer,
  ADD COLUMN IF NOT EXISTS dietary_tags     text[],
  ADD COLUMN IF NOT EXISTS kid_friendly_rating integer,
  ADD COLUMN IF NOT EXISTS prep_steps       text[],
  ADD COLUMN IF NOT EXISTS ai_generated     boolean DEFAULT false;
