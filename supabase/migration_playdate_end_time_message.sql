-- Add proposed_end_time and message columns to playdate_requests and playdate_proposals
ALTER TABLE playdate_requests
  ADD COLUMN IF NOT EXISTS proposed_end_time time,
  ADD COLUMN IF NOT EXISTS message           text;

ALTER TABLE playdate_proposals
  ADD COLUMN IF NOT EXISTS proposed_end_time time,
  ADD COLUMN IF NOT EXISTS message           text;
