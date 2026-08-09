ALTER TABLE playdate_requests
  ADD COLUMN IF NOT EXISTS cancel_reason text;
