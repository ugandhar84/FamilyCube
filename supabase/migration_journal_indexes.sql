-- Indexes to support get_pet_journal RPC cursor-based pagination.
-- Each sub-query filters on (pet_id) and sorts/filters on a timestamp column.
-- These composite indexes let Postgres satisfy both in one index scan.

CREATE INDEX IF NOT EXISTS idx_pet_notes_pet_noted
  ON pet_notes (pet_id, noted_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_mood_logs_pet_created
  ON mood_logs (pet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feeding_logs_pet_fed
  ON feeding_logs (pet_id, fed_at DESC);

-- grooming uses COALESCE(done_at_ts, done_at::timestamptz); index on done_at_ts first
CREATE INDEX IF NOT EXISTS idx_grooming_logs_pet_ts
  ON grooming_logs (pet_id, done_at_ts DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_vet_visits_pet_date
  ON vet_visits (pet_id, visit_ts DESC NULLS LAST);

-- weight_logs uses COALESCE(logged_at_time, logged_at::timestamptz)
CREATE INDEX IF NOT EXISTS idx_weight_logs_pet_time
  ON weight_logs (pet_id, logged_at_time DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_milestones_pet_achieved
  ON milestones (pet_id, achieved_at DESC);

CREATE INDEX IF NOT EXISTS idx_medications_pet_created
  ON medications (pet_id, created_at DESC);

-- vaccines: filtered on last_given IS NOT NULL
CREATE INDEX IF NOT EXISTS idx_vaccines_pet_last_given
  ON vaccines (pet_id, last_given DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_appointments_pet_scheduled
  ON appointments (pet_id, scheduled_at DESC);

-- daily_checklist: filtered on completed = true, sorted by completed_at
CREATE INDEX IF NOT EXISTS idx_daily_checklist_pet_completed
  ON daily_checklist (pet_id, completed_at DESC NULLS LAST)
  WHERE completed = true;

CREATE INDEX IF NOT EXISTS idx_health_records_pet_created
  ON health_records (pet_id, created_at DESC)
  WHERE status = 'done' AND extracted_data IS NOT NULL;
