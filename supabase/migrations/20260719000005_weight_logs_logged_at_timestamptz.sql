-- Widens weight_logs.logged_at from `date` to `timestamptz`.
--
-- The app has always stored and queried full ISO timestamps (new Date().toISOString()),
-- while the column was declared as `date`. Postgres coerced silently, but in
-- UTC-ahead timezones the "today" ISO string can represent yesterday's date,
-- causing today's weight entries to disappear from the list.
--
-- Steps:
--   1. Drop the old dedup index (its expression depends on the column type)
--   2. Widen the column — existing date values become midnight UTC timestamps
--   3. Fix the column default from current_date → now()
--   4. Recreate the dedup index using the IMMUTABLE UTC-cast expression
--      (timestamptz::date is STABLE, not IMMUTABLE, so we pin to UTC)

-- 1. Drop old index
DROP INDEX IF EXISTS uq_weight_logs_pet_value_date;

-- 2. Widen column — date '2026-07-19' becomes '2026-07-19 00:00:00+00'
ALTER TABLE weight_logs
  ALTER COLUMN logged_at TYPE timestamptz
  USING logged_at::timestamptz;

-- 3. Update default to match
ALTER TABLE weight_logs
  ALTER COLUMN logged_at SET DEFAULT now();

-- 4. Recreate dedup index with IMMUTABLE-safe expression
CREATE UNIQUE INDEX uq_weight_logs_pet_value_date
  ON weight_logs (pet_id, weight_kg, ((logged_at AT TIME ZONE 'UTC')::date));
