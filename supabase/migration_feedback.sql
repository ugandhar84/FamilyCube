CREATE TABLE IF NOT EXISTS feedback_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  description text NOT NULL,
  app_version text,
  os_name     text,
  os_version  text,
  device_name text,
  screen_size text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feedback_reports ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback; can read their own.
CREATE POLICY "feedback_insert" ON feedback_reports
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "feedback_select_own" ON feedback_reports
  FOR SELECT USING (auth.uid() = user_id);
