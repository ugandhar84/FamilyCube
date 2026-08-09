-- Adds the missing DELETE RLS policy for playdate_requests.
-- The v2 redesign migration dropped the old FOR ALL policy and replaced it
-- with SELECT / INSERT / UPDATE only — no DELETE was included.
-- This meant all delete() calls on terminal-status rows silently failed.
--
-- Already applied to the live DB. This file is for documentation + future re-runs.

CREATE POLICY IF NOT EXISTS "Parties can delete playdate_requests"
  ON playdate_requests FOR DELETE
  USING (from_owner_id = auth.uid() OR to_owner_id = auth.uid());
