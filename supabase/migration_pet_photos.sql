-- FurEver — Pet photo storage bucket
-- Run once in Supabase dashboard SQL editor

-- Create public 'pets' bucket for pet avatar photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pets',
  'pets',
  true,
  5242880,  -- 5 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow authenticated users to upload to their own folder (userId/filename)
CREATE POLICY "Users can upload pet photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pets' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update/delete their own photos
CREATE POLICY "Users can update their pet photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'pets' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their pet photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'pets' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Public read access (bucket is public so URLs work without auth)
CREATE POLICY "Pet photos are publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'pets');
