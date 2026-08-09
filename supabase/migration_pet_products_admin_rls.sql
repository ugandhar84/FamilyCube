-- Admin write access + full-read for pet_products
-- Problem: only a public "active = true" SELECT policy existed; admins had no INSERT/UPDATE/DELETE.

-- Allow admins to read ALL products (including inactive)
DROP POLICY IF EXISTS "Admins can read all products" ON pet_products;
CREATE POLICY "Admins can read all products"
  ON pet_products FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- Allow admins to insert new products
DROP POLICY IF EXISTS "Admins can insert products" ON pet_products;
CREATE POLICY "Admins can insert products"
  ON pet_products FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- Allow admins to update existing products
DROP POLICY IF EXISTS "Admins can update products" ON pet_products;
CREATE POLICY "Admins can update products"
  ON pet_products FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- Allow admins to delete products
DROP POLICY IF EXISTS "Admins can delete products" ON pet_products;
CREATE POLICY "Admins can delete products"
  ON pet_products FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );
