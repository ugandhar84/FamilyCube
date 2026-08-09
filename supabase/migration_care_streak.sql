-- Care streak columns on pets table
ALTER TABLE pets
  ADD COLUMN IF NOT EXISTS care_streak     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_care_date  date;
