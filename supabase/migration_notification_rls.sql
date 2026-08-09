-- Allow authenticated users to insert notifications for other users
-- (follow, like, comment, playdate etc. triggered by client-side actions)
-- Prevents self-notification spam by requiring user_id <> auth.uid()
CREATE POLICY "Authenticated users can notify others"
ON notification_logs
FOR INSERT
TO authenticated
WITH CHECK (user_id <> auth.uid());
