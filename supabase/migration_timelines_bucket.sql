-- Create public 'timelines' storage bucket for shared PDF links
-- Run: psql $DATABASE_URL < supabase/migration_timelines_bucket.sql

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'timelines',
  'timelines',
  true,
  10485760,  -- 10 MB per file
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow authenticated users to upload their own pet timelines
CREATE POLICY "timelines_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'timelines' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Public read (anyone with the URL can download)
CREATE POLICY "timelines_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'timelines');

-- Allow owner to delete their own files
CREATE POLICY "timelines_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'timelines' AND auth.uid()::text = (storage.foldername(name))[1]);
