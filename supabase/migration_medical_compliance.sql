-- ── Medical Compliance: medication_logs + appointment multi-window ────────────

-- Daily dose log — one row per medication per day per logged-by user
CREATE TABLE IF NOT EXISTS medication_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid        NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  pet_id        uuid        NOT NULL REFERENCES pets(id)        ON DELETE CASCADE,
  logged_by     uuid        NOT NULL REFERENCES auth.users(id),
  logged_at     timestamptz NOT NULL DEFAULT now(),
  notes         text
);

ALTER TABLE medication_logs ENABLE ROW LEVEL SECURITY;

-- Users can log (insert) and view logs for pets they have access to.
-- Simplest safe rule: allow insert/select when auth.uid() = logged_by
CREATE POLICY "med_log_owner_insert" ON medication_logs
  FOR INSERT WITH CHECK (auth.uid() = logged_by);

CREATE POLICY "med_log_owner_select" ON medication_logs
  FOR SELECT USING (auth.uid() = logged_by);

-- Index for "did this pet's medication get logged today?" query
CREATE INDEX IF NOT EXISTS med_logs_med_day
  ON medication_logs (medication_id, logged_at DESC);

-- ── Appointment multi-window dedup ────────────────────────────────────────────
-- Replace single reminder_sent boolean with per-window flags so we can send
-- 7-day, 1-day, and 2-hour reminders independently.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_7d_sent  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_1d_sent  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_2h_sent  boolean DEFAULT false;

-- Back-fill: treat any appointment that already has reminder_sent=true
-- as having had its 1d notification sent (best approximation).
UPDATE appointments
   SET reminder_1d_sent = true
 WHERE reminder_sent = true;
