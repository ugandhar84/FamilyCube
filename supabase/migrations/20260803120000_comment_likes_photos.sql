-- Comment replies (idempotent)
ALTER TABLE post_comments
  ADD COLUMN IF NOT EXISTS reply_to_comment_id uuid REFERENCES post_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_post_comments_reply ON post_comments (reply_to_comment_id)
  WHERE reply_to_comment_id IS NOT NULL;

-- Comment photo attachments
ALTER TABLE post_comments
  ADD COLUMN IF NOT EXISTS photo_url text;

-- Comment likes count (denormalized for speed)
ALTER TABLE post_comments
  ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0;

-- Comment likes table
CREATE TABLE IF NOT EXISTS comment_likes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid        NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Anyone can read comment_likes" ON comment_likes FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Auth users manage own likes" ON comment_likes FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes (comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user    ON comment_likes (user_id);

-- Keep likes_count in sync
CREATE OR REPLACE FUNCTION trg_comment_like_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE post_comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE post_comments SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_comment_like_count ON comment_likes;
CREATE TRIGGER trg_comment_like_count
  AFTER INSERT OR DELETE ON comment_likes
  FOR EACH ROW EXECUTE FUNCTION trg_comment_like_count();

NOTIFY pgrst, 'reload schema';
