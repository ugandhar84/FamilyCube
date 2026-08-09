-- Bump post updated_at whenever a comment is added so the post rises to
-- the top of the global feed (which orders by updated_at DESC).

CREATE OR REPLACE FUNCTION bump_post_on_comment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE social_posts SET updated_at = now() WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS bump_post_updated_at ON post_comments;

CREATE TRIGGER bump_post_updated_at
AFTER INSERT ON post_comments
FOR EACH ROW EXECUTE FUNCTION bump_post_on_comment();
