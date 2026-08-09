-- Allow admin users to read all push tokens (for broadcast reach count in admin UI)
-- Without this, the client-side reach count always returns 0 due to RLS.

CREATE POLICY "Admins can read all push tokens"
  ON push_tokens
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );
