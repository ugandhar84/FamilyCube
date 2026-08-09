-- Allow admins to read all feedback reports
CREATE POLICY "feedback_select_admin" ON feedback_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

-- Allow admins to delete feedback reports
CREATE POLICY "feedback_delete_admin" ON feedback_reports
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );
