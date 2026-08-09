-- Add multi-attachment support
ALTER TABLE feedback_reports
  ADD COLUMN IF NOT EXISTS screenshot_urls text[] DEFAULT '{}';

-- Migrate existing single screenshot_url into the array
UPDATE feedback_reports
SET screenshot_urls = ARRAY[screenshot_url]
WHERE screenshot_url IS NOT NULL AND (screenshot_urls IS NULL OR screenshot_urls = '{}');

-- Storage RLS: allow admins to read/sign URLs for all files in the feedback bucket
CREATE POLICY "feedback_storage_admin_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'feedback' AND
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- Storage RLS: allow authenticated users to upload to their own folder
CREATE POLICY "feedback_storage_user_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'feedback' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
