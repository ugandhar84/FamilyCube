-- Scope notification_logs UPDATE and DELETE policies to the row owner.
-- Previously `auth.uid() IS NOT NULL` allowed any authenticated user to
-- mutate any notification row. Restrict to the owning user only.

DROP POLICY IF EXISTS "Users can update own notifications" ON notification_logs;
DROP POLICY IF EXISTS "Users can delete own notifications" ON notification_logs;

CREATE POLICY "Users can update own notifications"
  ON notification_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON notification_logs FOR DELETE
  USING (auth.uid() = user_id);
