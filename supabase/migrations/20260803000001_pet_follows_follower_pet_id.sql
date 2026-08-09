-- Migration: add follower_pet_id to pet_follows
-- The table was originally created with follower_id (user UUID referencing profiles).
-- This adds the pet-level follower column so the app's pet-to-pet follow system works.
-- The old follower_id rows are left intact (soft migration — both columns coexist).

-- 1. Add the pet-level follower column (nullable so existing rows are unaffected)
ALTER TABLE pet_follows
  ADD COLUMN IF NOT EXISTS follower_pet_id uuid REFERENCES pets(id) ON DELETE CASCADE;

-- 2. Index for fast look-ups by follower pet
DROP INDEX IF EXISTS pet_follows_follower_pet_idx;
CREATE INDEX IF NOT EXISTS pet_follows_follower_pet_idx ON pet_follows(follower_pet_id);

-- 3. Unique constraint for pet-to-pet follows
--    PostgreSQL allows multiple NULL rows under UNIQUE, so old rows (follower_pet_id IS NULL)
--    don't conflict with each other or with new pet-level rows.
ALTER TABLE pet_follows
  DROP CONSTRAINT IF EXISTS pet_follows_pet_to_pet_unique;
ALTER TABLE pet_follows
  ADD CONSTRAINT pet_follows_pet_to_pet_unique UNIQUE (follower_pet_id, following_pet_id);

-- 4. Expand the RLS policy so pet owners can manage their pet's follows in addition to
--    the existing user-level policy (follower_id = auth.uid()).
DROP POLICY IF EXISTS "Pets can manage own follows" ON pet_follows;
CREATE POLICY "Pets can manage own follows" ON pet_follows FOR ALL
  USING (
    follower_id = auth.uid()
    OR follower_pet_id IN (SELECT id FROM pets WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    follower_id = auth.uid()
    OR follower_pet_id IN (SELECT id FROM pets WHERE owner_id = auth.uid())
  );

-- 5. Ensure followers_count column exists on pets (may have already been added)
ALTER TABLE pets ADD COLUMN IF NOT EXISTS followers_count integer NOT NULL DEFAULT 0;

-- 6. Replace the trigger functions with versions that handle both column shapes.
--    On INSERT: increment following_pet's count. On DELETE: decrement it.
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
CREATE TRIGGER pet_follows_inc
  AFTER INSERT ON pet_follows
  FOR EACH ROW EXECUTE FUNCTION _pet_follows_count_inc();

DROP TRIGGER IF EXISTS pet_follows_dec ON pet_follows;
CREATE TRIGGER pet_follows_dec
  AFTER DELETE ON pet_follows
  FOR EACH ROW EXECUTE FUNCTION _pet_follows_count_dec();

-- 7. Backfill followers_count from current rows (idempotent)
UPDATE pets p
SET    followers_count = (SELECT COUNT(*) FROM pet_follows pf WHERE pf.following_pet_id = p.id);
