-- chat-media's strict allowed_mime_types kept silently breaking uploads for
-- any file type not yet explicitly added (most recently .md documents,
-- whose mimeType — text/markdown — wasn't in the list, so Storage's own
-- API rejected the upload outright with 0 rows ever landing in the
-- bucket). The bucket is already private and auth-gated via RLS ("Auth
-- upload chat media" requires auth.role() = 'authenticated') and capped at
-- 20MB per file — a MIME allowlist on top of that adds fragility (any new
-- file type silently fails until manually added) without real security
-- benefit for a private family chat's own attachments.
UPDATE storage.buckets
SET allowed_mime_types = NULL
WHERE id = 'chat-media';
