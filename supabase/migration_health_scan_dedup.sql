-- Prevents duplicate rows when the same report is scanned twice concurrently
-- (e.g. two scans finishing around the same time both pass the app-level
-- "does this already exist?" check before either has written its row).
-- These are the source of truth; the app-level pre-check in
-- app/health/record/[id].tsx is just an optimization to avoid a round trip —
-- correctness comes from these constraints. The app catches unique_violation
-- (23505) and treats it as "already saved" rather than an error.
--
-- Existing duplicates (from before this migration) are cleaned up first —
-- keeping the oldest row of each duplicate group — since a UNIQUE INDEX
-- cannot be created over data that already violates it.
--
-- Run once: psql $DATABASE_URL < supabase/migration_health_scan_dedup.sql

-- vaccines
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY pet_id, lower(trim(name)), last_given
    ORDER BY created_at ASC
  ) AS rn
  FROM vaccines
  WHERE last_given IS NOT NULL
)
DELETE FROM vaccines WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vaccines_pet_name_date
  ON vaccines (pet_id, lower(trim(name)), last_given)
  WHERE last_given IS NOT NULL;

-- medications
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY pet_id, lower(trim(name)), start_date
    ORDER BY created_at ASC
  ) AS rn
  FROM medications
  WHERE start_date IS NOT NULL
)
DELETE FROM medications WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_medications_pet_name_date
  ON medications (pet_id, lower(trim(name)), start_date)
  WHERE start_date IS NOT NULL;

-- lab_results
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY pet_id, lower(trim(test_name)), tested_at
    ORDER BY created_at ASC
  ) AS rn
  FROM lab_results
  WHERE test_name IS NOT NULL AND tested_at IS NOT NULL
)
DELETE FROM lab_results WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_results_pet_name_date
  ON lab_results (pet_id, lower(trim(test_name)), tested_at)
  WHERE test_name IS NOT NULL AND tested_at IS NOT NULL;

-- weight_logs — logged_at's actual type varies by environment (date in the
-- original schema, but some environments may have widened it to timestamp/
-- timestamptz). A plain `col::date` cast on a timestamptz column is STABLE,
-- not IMMUTABLE (its result depends on the session timezone), which Postgres
-- rejects in an index expression — so this detects the real type and builds
-- the correct, IMMUTABLE-safe expression for whichever one it finds.
DO $$
DECLARE
  logged_at_type text;
  date_expr text;
BEGIN
  SELECT data_type INTO logged_at_type
  FROM information_schema.columns
  WHERE table_name = 'weight_logs' AND column_name = 'logged_at';

  date_expr := CASE
    WHEN logged_at_type = 'timestamp with time zone'
      THEN '(logged_at AT TIME ZONE ''UTC'')::date'
    WHEN logged_at_type = 'timestamp without time zone'
      THEN 'logged_at::date'
    ELSE 'logged_at'  -- already a plain date column
  END;

  EXECUTE format($f$
    DELETE FROM weight_logs WHERE id IN (
      SELECT id FROM (
        SELECT id, row_number() OVER (
          PARTITION BY pet_id, weight_kg, (%s)
          ORDER BY id ASC
        ) AS rn
        FROM weight_logs
      ) ranked
      WHERE rn > 1
    )
  $f$, date_expr);

  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_weight_logs_pet_value_date ON weight_logs (pet_id, weight_kg, (%s))',
    date_expr
  );
END $$;

-- appointments — scheduled_at is timestamptz; cast via a fixed UTC offset
-- (not the session timezone) so the expression is IMMUTABLE.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY pet_id, lower(trim(title)), ((scheduled_at AT TIME ZONE 'UTC')::date)
    ORDER BY created_at ASC
  ) AS rn
  FROM appointments
)
DELETE FROM appointments WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_pet_title_date
  ON appointments (pet_id, lower(trim(title)), ((scheduled_at AT TIME ZONE 'UTC')::date));
