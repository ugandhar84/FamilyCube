-- Allow admins to write to feature_flags from the client (admin settings screen)
-- Previously only service_role could write; this adds a policy for is_admin users.
DROP POLICY IF EXISTS "Admins can write feature_flags" ON feature_flags;
CREATE POLICY "Admins can write feature_flags"
  ON feature_flags FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

NOTIFY pgrst, 'reload schema';
