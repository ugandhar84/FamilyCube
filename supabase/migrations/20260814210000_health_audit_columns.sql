-- Audit trail for health record edits (who/when)
-- Wrapped in DO blocks so missing tables are skipped gracefully
DO $$ BEGIN ALTER TABLE appointments  ADD COLUMN IF NOT EXISTS edited_at timestamptz; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE appointments  ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES auth.users(id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE medications   ADD COLUMN IF NOT EXISTS edited_at timestamptz; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE medications   ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES auth.users(id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE vaccinations  ADD COLUMN IF NOT EXISTS edited_at timestamptz; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE vaccinations  ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES auth.users(id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE weight_logs   ADD COLUMN IF NOT EXISTS edited_at timestamptz; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE weight_logs   ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES auth.users(id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE lab_results   ADD COLUMN IF NOT EXISTS edited_at timestamptz; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE lab_results   ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES auth.users(id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
