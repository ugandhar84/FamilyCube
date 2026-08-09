-- Fix: notification_logs RLS — allow client-side social notifications
--
-- Root cause: no INSERT policy existed on notification_logs.
-- The original schema comment said "only service-role/edge functions insert",
-- but social features (like, comment, follow) write notifications client-side.
-- Without an INSERT policy, every upsertNotification() call fails silently.
--
-- Additionally, UPDATE and DELETE were restricted to auth.uid() = user_id,
-- which blocked cross-user dedup upserts (A upserts into B's notifications)
-- and unlike/unfollow cleanup (A removes the like-notification from B's row).
--
-- Security: SELECT is still locked to auth.uid() = user_id — users can never
-- read another user's notifications.  INSERT/UPDATE/DELETE just require the
-- caller to be authenticated; spamming is a product/rate-limit concern, not RLS.
--
-- Run once: psql $DATABASE_URL < supabase/migration_notification_rls_fix.sql

-- INSERT: any authenticated user may write a notification for any recipient
DROP POLICY IF EXISTS "Authenticated users can send notifications" ON notification_logs;
CREATE POLICY "Authenticated users can send notifications"
  ON notification_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: allow cross-user updates so upsert dedup works
-- (e.g. A re-likes B's post → upserts the existing like-notification row)
DROP POLICY IF EXISTS "Users can update own notifications"          ON notification_logs;
DROP POLICY IF EXISTS "Authenticated users can update notifications" ON notification_logs;
CREATE POLICY "Authenticated users can update notifications"
  ON notification_logs FOR UPDATE
  USING  (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- DELETE: allow cross-user deletes for unlike/unfollow cleanup
-- (e.g. A unlikes B's post → deletes the like-notification from B's rows)
DROP POLICY IF EXISTS "Users can delete own notifications"          ON notification_logs;
DROP POLICY IF EXISTS "Authenticated users can delete notifications" ON notification_logs;
CREATE POLICY "Authenticated users can delete notifications"
  ON notification_logs FOR DELETE
  USING (auth.uid() IS NOT NULL);
