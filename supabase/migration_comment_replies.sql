-- Add reply threading to post_comments
-- Run once: psql $DATABASE_URL < supabase/migration_comment_replies.sql

ALTER TABLE post_comments
  ADD COLUMN IF NOT EXISTS reply_to_comment_id uuid REFERENCES post_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_post_comments_reply ON post_comments (reply_to_comment_id)
  WHERE reply_to_comment_id IS NOT NULL;
