ALTER TABLE pet_timelines
  ADD COLUMN IF NOT EXISTS source_record_id uuid REFERENCES health_records(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pet_timelines_source_record_id ON pet_timelines(source_record_id)
  WHERE source_record_id IS NOT NULL;
