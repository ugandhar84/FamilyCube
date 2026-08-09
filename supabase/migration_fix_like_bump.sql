-- Fix: likes should NOT bump a post to the top of the feed.
-- Only real content edits and comments (via bump_post_on_comment trigger) should update updated_at.
--
-- Root cause: the generic set_social_posts_updated_at trigger fires on ANY update,
-- including likes_count / comments_count counter increments.

DROP TRIGGER IF EXISTS set_social_posts_updated_at ON social_posts;

CREATE OR REPLACE FUNCTION trg_social_post_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip when only counter columns changed (like/unlike or comment count sync).
  -- bump_post_on_comment already handles updated_at for new comments.
  IF (
    OLD.likes_count    IS DISTINCT FROM NEW.likes_count OR
    OLD.comments_count IS DISTINCT FROM NEW.comments_count
  )
  AND OLD.caption          IS NOT DISTINCT FROM NEW.caption
  AND OLD.photo_url        IS NOT DISTINCT FROM NEW.photo_url
  AND OLD.photo_urls       IS NOT DISTINCT FROM NEW.photo_urls
  AND OLD.video_url        IS NOT DISTINCT FROM NEW.video_url
  AND OLD.is_public        IS NOT DISTINCT FROM NEW.is_public
  AND OLD.is_media_blocked IS NOT DISTINCT FROM NEW.is_media_blocked
  THEN
    RETURN NEW;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_social_posts_updated_at
  BEFORE UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION trg_social_post_updated_at();
