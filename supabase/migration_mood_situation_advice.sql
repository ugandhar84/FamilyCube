ALTER TABLE mood_logs
  ADD COLUMN IF NOT EXISTS situation text,
  ADD COLUMN IF NOT EXISTS advice    jsonb;
