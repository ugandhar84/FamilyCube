-- Add reminder time and local notification ID to medications
ALTER TABLE medications
  ADD COLUMN IF NOT EXISTS remind_time  time,
  ADD COLUMN IF NOT EXISTS notif_id     text;   -- expo local notification identifier
