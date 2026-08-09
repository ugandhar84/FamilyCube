ALTER TABLE feeding_logs    ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE daily_checklist ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE daily_checklist ADD COLUMN IF NOT EXISTS notes     text;
ALTER TABLE grooming_logs   ADD COLUMN IF NOT EXISTS photo_url text;
