-- Add proper timestamptz to log tables that only stored a date
-- Existing rows get the date at midnight UTC (best we can do for old data)

-- weight_logs: logged_at date → keep date col, add logged_at_time timestamptz
ALTER TABLE weight_logs
  ADD COLUMN IF NOT EXISTS logged_at_time timestamptz DEFAULT now();

-- Backfill existing rows: set to date at midnight UTC
UPDATE weight_logs
  SET logged_at_time = logged_at::timestamptz
  WHERE logged_at_time IS NULL;

-- grooming_logs: done_at date + done_at_time text → add done_at_ts timestamptz
ALTER TABLE grooming_logs
  ADD COLUMN IF NOT EXISTS done_at_ts timestamptz DEFAULT now();

UPDATE grooming_logs
  SET done_at_ts = CASE WHEN done_at_time IS NOT NULL
      THEN (done_at::text || 'T' || done_at_time)::timestamptz
      ELSE done_at::timestamptz
    END
  WHERE done_at_ts IS NULL;

-- vet_visits: visit_date date → add visit_ts timestamptz
ALTER TABLE vet_visits
  ADD COLUMN IF NOT EXISTS visit_ts timestamptz DEFAULT now();

UPDATE vet_visits
  SET visit_ts = visit_date::timestamptz
  WHERE visit_ts IS NULL;

-- daily_checklist: completed_at already exists as timestamptz — nothing to do
-- feeding_logs: fed_at already timestamptz — nothing to do
-- mood_logs: created_at already timestamptz — nothing to do
