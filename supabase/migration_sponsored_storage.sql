-- Allow admin users to upload to the pets bucket (sponsored/ prefix)
-- Run once: psql $DATABASE_URL < supabase/migration_sponsored_storage.sql

-- INSERT (upload)
CREATE POLICY "admin upload sponsored" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pets'
    AND (storage.foldername(name))[1] = 'sponsored'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- SELECT (read — public, same as other pet media)
CREATE POLICY "public read sponsored" ON storage.objects
  FOR SELECT TO public
  USING (
    bucket_id = 'pets'
    AND (storage.foldername(name))[1] = 'sponsored'
  );

-- UPDATE
CREATE POLICY "admin update sponsored" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pets'
    AND (storage.foldername(name))[1] = 'sponsored'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- DELETE
CREATE POLICY "admin delete sponsored" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'pets'
    AND (storage.foldername(name))[1] = 'sponsored'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );
