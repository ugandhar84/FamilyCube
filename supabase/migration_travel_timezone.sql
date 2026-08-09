-- home_timezone: the timezone the user's reminders/crons are calibrated to.
--   Set once on first sign-in; updated only when user explicitly taps "Update Reminders".
-- current_timezone: the device's live timezone, updated silently on every app foreground.
--   Used only for the travel-banner comparison.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS home_timezone    text,
  ADD COLUMN IF NOT EXISTS current_timezone text;

-- Backfill: treat the existing `timezone` column as their home timezone.
UPDATE profiles
SET home_timezone    = timezone,
    current_timezone = timezone
WHERE home_timezone IS NULL AND timezone IS NOT NULL;
