-- Migration: switch from pet-centric follows to owner-centric follows
-- Users now follow other users (owners), not individual pets.
-- Feed "Following" tab shows all posts from any pet owned by followed users.

-- 1. New table
CREATE TABLE IF NOT EXISTS user_follows (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_user_id),
  CHECK(follower_id <> following_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower  ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_user_id);

ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read user_follows"  ON user_follows FOR SELECT USING (true);
CREATE POLICY "Users manage own user_follows" ON user_follows FOR ALL    USING (follower_id = auth.uid());

-- 2. followers_count on profiles (how many people follow this owner)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS followers_count integer NOT NULL DEFAULT 0;

-- 3. Trigger to keep profiles.followers_count in sync
CREATE OR REPLACE FUNCTION trg_user_follow_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET followers_count = GREATEST(0, followers_count - 1) WHERE id = OLD.following_user_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_follow_count ON user_follows;
CREATE TRIGGER trg_user_follow_count
  AFTER INSERT OR DELETE ON user_follows
  FOR EACH ROW EXECUTE FUNCTION trg_user_follow_count();

-- 4. Migrate existing pet_follows → user_follows
--    Each pet_follows row (user follows a pet) becomes (user follows that pet's owner)
INSERT INTO user_follows (follower_id, following_user_id, created_at)
SELECT DISTINCT pf.follower_id, p.owner_id, pf.created_at
FROM   pet_follows pf
JOIN   pets p ON p.id = pf.following_pet_id
WHERE  pf.follower_id <> p.owner_id
ON CONFLICT (follower_id, following_user_id) DO NOTHING;

-- 5. Backfill profiles.followers_count from migrated data
UPDATE profiles
SET    followers_count = (
  SELECT COUNT(*) FROM user_follows WHERE following_user_id = profiles.id
);
