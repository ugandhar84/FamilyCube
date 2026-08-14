ALTER TABLE family_meals
  ADD COLUMN IF NOT EXISTS family_id text;

-- Optional: backfill if you have a known default family id
-- UPDATE family_meals SET family_id = 'your-family-id' WHERE family_id IS NULL;
