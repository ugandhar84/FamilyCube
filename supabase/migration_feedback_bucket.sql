-- Public bucket for feedback screenshots (admin reads via service role; no user-visible URLs needed to be signed)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback',
  'feedback',
  false,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Users can upload their own feedback screenshots
CREATE POLICY "feedback_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'feedback' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Only service role can read (admin console uses service key)
