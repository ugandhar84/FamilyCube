-- Allow any authenticated user to view any pet's profile.
-- Pet passports are public by design; the existing policy was too restrictive,
-- blocking followers' pets that have no social posts yet.

DROP POLICY IF EXISTS "Public can view social pets" ON pets;

CREATE POLICY "Authenticated users can view all pets"
  ON pets FOR SELECT
  USING (
    auth.uid() IS NOT NULL
  );
