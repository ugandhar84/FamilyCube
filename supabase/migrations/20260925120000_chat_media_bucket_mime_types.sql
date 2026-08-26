-- chat-media's allowed_mime_types was missing audio/mp4 (the exact
-- contentType ChatScreen.tsx's sendVoiceNote uploads voice notes with) and
-- had no document types at all (PDF/Word/etc. for sendDocument) — both
-- uploads were being rejected by the bucket's own MIME allowlist before
-- ever reaching storage RLS. Widen it to cover what the app actually sends.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a',
  'video/mp4',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  'application/octet-stream'
]
WHERE id = 'chat-media';
