-- Audit trail for health record edits (who/when)
ALTER TABLE appointments   ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE appointments   ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES auth.users(id);
ALTER TABLE medications    ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE medications    ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES auth.users(id);
ALTER TABLE vaccinations   ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE vaccinations   ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES auth.users(id);
ALTER TABLE weight_logs    ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE weight_logs    ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES auth.users(id);
ALTER TABLE lab_results    ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE lab_results    ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES auth.users(id);
