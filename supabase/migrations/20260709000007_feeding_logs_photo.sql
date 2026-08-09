-- Add photo_url to feeding_logs and allow members to update their own entries

ALTER TABLE feeding_logs ADD COLUMN IF NOT EXISTS photo_url text;

-- UPDATE policy: same role check as INSERT (daily care roles)
CREATE POLICY "feeding_logs: daily care roles can update"
  ON feeding_logs FOR UPDATE
  USING (can_log_daily_care(pet_id))
  WITH CHECK (can_log_daily_care(pet_id));
