-- Track alert deliveries to prevent duplicates and enable periodic sending
-- Links users to alerts they've been notified about

CREATE TABLE IF NOT EXISTS alert_recipients (
  id uuid default uuid_generate_v4() primary key,
  alert_id uuid references lost_alerts(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  sent_at timestamptz default now(),
  unique(alert_id, user_id)  -- ensure no duplicate sends
);

-- Index for efficient lookups during periodic checks
CREATE INDEX IF NOT EXISTS alert_recipients_alert_idx ON alert_recipients(alert_id);
CREATE INDEX IF NOT EXISTS alert_recipients_user_idx ON alert_recipients(user_id);
CREATE INDEX IF NOT EXISTS alert_recipients_sent_at_idx ON alert_recipients(sent_at);

-- Drop the old notification_recipients column from lost_alerts (if it exists)
-- The new alert_recipients table is more flexible for periodic sending
ALTER TABLE lost_alerts DROP COLUMN IF EXISTS notification_recipients;

-- Add expiration to lost_alerts (10 days from creation)
ALTER TABLE lost_alerts
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Set expires_at to created_at + 10 days for existing alerts without expiration
UPDATE lost_alerts
  SET expires_at = created_at + interval '10 days'
  WHERE expires_at IS NULL;

-- Make expires_at NOT NULL with default for future inserts
ALTER TABLE lost_alerts
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '10 days');
