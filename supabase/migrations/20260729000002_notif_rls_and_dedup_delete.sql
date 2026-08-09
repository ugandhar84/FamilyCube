-- Fix 1: Tighten notification_logs INSERT policy.
-- Previous policy was WITH CHECK (true) — any authenticated client could write
-- a notification where user_id = auth.uid() (self-notification).
-- Edge functions use service_role and bypass RLS, so they're unaffected.

DROP POLICY IF EXISTS "notification_logs: authenticated users can insert" ON notification_logs;
DROP POLICY IF EXISTS "Authenticated users can notify others"             ON notification_logs;

CREATE POLICY "notification_logs: insert for others only"
ON notification_logs
FOR INSERT
TO authenticated
WITH CHECK (user_id <> auth.uid());

-- Fix 2: SECURITY DEFINER helper so clients can delete another user's dedup
-- notification (unlike / unfollow). The standard DELETE RLS is scoped to own
-- rows (auth.uid() = user_id), so a liker cannot clean up the post-owner's
-- notification. This function runs as the DB owner and bypasses that restriction.

CREATE OR REPLACE FUNCTION delete_notification_by_dedup(p_user_id uuid, p_dedup_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM notification_logs
  WHERE user_id = p_user_id AND dedup_key = p_dedup_key;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_notification_by_dedup(uuid, text) TO authenticated;
