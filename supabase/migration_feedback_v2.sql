ALTER TABLE feedback_reports
  ADD COLUMN IF NOT EXISTS issue_type     text DEFAULT 'bug',
  ADD COLUMN IF NOT EXISTS screenshot_url text,
  ADD COLUMN IF NOT EXISTS app_name       text DEFAULT 'Petkoinia';
