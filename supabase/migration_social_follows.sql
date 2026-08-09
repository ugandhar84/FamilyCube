-- ═══════════════════════════════════════════════════════════════════════════
-- FurEver — Social follows + comments
-- Run: psql $DATABASE_URL < supabase/migration_social_follows.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── pet_follows ───────────────────────────────────────────────────────────────
-- A user (follower_id) follows a pet (following_pet_id).
CREATE TABLE IF NOT EXISTS pet_follows (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_pet_id  uuid        NOT NULL REFERENCES pets(id)       ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_pet_id)
);
ALTER TABLE pet_follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read follows"   ON pet_follows;
DROP POLICY IF EXISTS "Users manage own follows"  ON pet_follows;
CREATE POLICY "Anyone can read follows"  ON pet_follows FOR SELECT USING (true);
CREATE POLICY "Users manage own follows" ON pet_follows FOR ALL   USING (follower_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_pet_follows_follower ON pet_follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_pet_follows_pet      ON pet_follows (following_pet_id);

-- Add followers_count to pets (denormalised for display)
ALTER TABLE pets ADD COLUMN IF NOT EXISTS followers_count integer NOT NULL DEFAULT 0;

-- ── post_comments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_comments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid        NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  author_id  uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  pet_id     uuid        REFERENCES pets(id) ON DELETE SET NULL,
  body       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read comments"    ON post_comments;
DROP POLICY IF EXISTS "Auth users can comment"      ON post_comments;
DROP POLICY IF EXISTS "Authors can delete comments" ON post_comments;
CREATE POLICY "Anyone can read comments"    ON post_comments FOR SELECT USING (true);
CREATE POLICY "Auth users can comment"      ON post_comments FOR INSERT WITH CHECK (author_id = auth.uid());
CREATE POLICY "Authors can delete comments" ON post_comments FOR DELETE USING (author_id = auth.uid());

-- Expose comments_count on social_posts if not present
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS comments_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments (post_id, created_at);

-- ── Trigger: keep followers_count in sync ─────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_pet_follow_count()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE pets SET followers_count = followers_count + 1 WHERE id = NEW.following_pet_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE pets SET followers_count = GREATEST(0, followers_count - 1) WHERE id = OLD.following_pet_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_count ON pet_follows;
CREATE TRIGGER trg_follow_count
  AFTER INSERT OR DELETE ON pet_follows
  FOR EACH ROW EXECUTE FUNCTION trg_pet_follow_count();

-- Backfill followers_count from existing pet_follows rows (idempotent)
UPDATE pets p
SET    followers_count = (
  SELECT COUNT(*) FROM pet_follows f WHERE f.following_pet_id = p.id
);
