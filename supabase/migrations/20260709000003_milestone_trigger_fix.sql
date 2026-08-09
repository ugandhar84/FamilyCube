-- Fix milestone trigger: attach it to pets table, add day 30, add unique constraint

-- 1. Unique constraint so ON CONFLICT works (idempotent inserts)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'milestones_pet_day_unique'
  ) THEN
    ALTER TABLE milestones ADD CONSTRAINT milestones_pet_day_unique UNIQUE (pet_id, day_count);
  END IF;
END $$;

-- 2. Updated function — includes day 30, better titles
CREATE OR REPLACE FUNCTION check_milestone()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  days_count INTEGER;
BEGIN
  IF NEW.adoption_date IS NULL THEN RETURN NEW; END IF;
  days_count := (CURRENT_DATE - NEW.adoption_date);

  IF days_count = ANY(ARRAY[1, 30, 100, 365, 500, 1000]) THEN
    INSERT INTO milestones (pet_id, day_count, title, achieved_at)
    VALUES (
      NEW.id,
      days_count,
      CASE days_count
        WHEN 1    THEN 'First day home 🏠'
        WHEN 30   THEN 'One month together 🌙'
        WHEN 100  THEN '100 days of memories ⭐'
        WHEN 365  THEN 'First full year 🎂'
        WHEN 500  THEN '500 days together 🎉'
        WHEN 1000 THEN '1000 days — legendary! 🏆'
      END,
      CURRENT_DATE
    )
    ON CONFLICT (pet_id, day_count) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Attach trigger (drop first to make idempotent)
DROP TRIGGER IF EXISTS on_pet_updated_milestone ON pets;
CREATE TRIGGER on_pet_updated_milestone
  AFTER INSERT OR UPDATE OF adoption_date ON pets
  FOR EACH ROW EXECUTE FUNCTION check_milestone();
