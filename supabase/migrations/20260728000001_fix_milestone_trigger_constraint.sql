-- Fix milestone trigger constraint issue
-- The trigger on pets table fires and tries to INSERT with ON CONFLICT
-- but the constraint might not exist or be properly recognized

-- 1. Ensure milestones table exists
CREATE TABLE IF NOT EXISTS milestones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  day_count integer NOT NULL,
  title text NOT NULL,
  achieved_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 2. Drop existing constraint if it exists (to recreate cleanly)
ALTER TABLE milestones DROP CONSTRAINT IF EXISTS milestones_pet_day_unique;

-- 3. Add unique constraint
ALTER TABLE milestones ADD CONSTRAINT milestones_pet_day_unique UNIQUE (pet_id, day_count);

-- 4. Recreate the trigger function with proper error handling
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

-- 5. Recreate trigger - only on adoption_date changes
DROP TRIGGER IF EXISTS on_pet_updated_milestone ON pets;
CREATE TRIGGER on_pet_updated_milestone
  AFTER INSERT OR UPDATE OF adoption_date ON pets
  FOR EACH ROW
  EXECUTE FUNCTION check_milestone();
