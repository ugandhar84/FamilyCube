-- Track recipients of lost alerts for found notifications
-- When marking as found, send notifications to the same users who received the original alert

ALTER TABLE lost_alerts
  ADD COLUMN IF NOT EXISTS notification_recipients uuid[] DEFAULT '{}';

-- Add index for efficient array operations
CREATE INDEX IF NOT EXISTS lost_alerts_recipients_idx
  ON lost_alerts USING gin(notification_recipients);
