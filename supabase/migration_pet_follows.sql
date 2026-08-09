-- Pet-level follow system
-- Replaces user_follows with per-pet relationships so follower counts
-- and influencer scores are tracked per pet, not per owner.

CREATE TABLE IF NOT EXISTS pet_follows (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_pet_id  uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  following_pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(follower_pet_id, following_pet_id)
);

CREATE INDEX IF NOT EXISTS pet_follows_follower_idx  ON pet_follows(follower_pet_id);
CREATE INDEX IF NOT EXISTS pet_follows_following_idx ON pet_follows(following_pet_id);

-- Denormalized follower count for fast leaderboard/profile queries
ALTER TABLE pets ADD COLUMN IF NOT EXISTS followers_count int NOT NULL DEFAULT 0;

-- Keep it accurate via triggers
CREATE OR REPLACE FUNCTION _pet_follows_count_inc() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE pets SET followers_count = followers_count + 1 WHERE id = NEW.following_pet_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION _pet_follows_count_dec() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE pets SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_pet_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS pet_follows_inc ON pet_follows;
CREATE TRIGGER pet_follows_inc AFTER INSERT ON pet_follows FOR EACH ROW EXECUTE FUNCTION _pet_follows_count_inc();

DROP TRIGGER IF EXISTS pet_follows_dec ON pet_follows;
CREATE TRIGGER pet_follows_dec AFTER DELETE ON pet_follows FOR EACH ROW EXECUTE FUNCTION _pet_follows_count_dec();

-- Backfill followers_count from existing rows (safe to run multiple times)
UPDATE pets p
SET followers_count = (SELECT COUNT(*) FROM pet_follows pf WHERE pf.following_pet_id = p.id);
