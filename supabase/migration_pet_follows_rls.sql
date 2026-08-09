-- Fix pet_follows RLS to work with the pet-to-pet schema (follower_pet_id / following_pet_id).
-- The previous policy referenced follower_id = auth.uid() which doesn't exist in this table.

ALTER TABLE pet_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read follows"  ON pet_follows;
DROP POLICY IF EXISTS "Users manage own follows" ON pet_follows;

-- Anyone can read follows (needed for followers/following counts & lists)
CREATE POLICY "Anyone can read follows"
  ON pet_follows FOR SELECT USING (true);

-- Only the owner of the follower pet can insert/delete follows
CREATE POLICY "Pet owner can follow"
  ON pet_follows FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pets
      WHERE id = follower_pet_id
        AND owner_id = auth.uid()
    )
  );

CREATE POLICY "Pet owner can unfollow"
  ON pet_follows FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM pets
      WHERE id = follower_pet_id
        AND owner_id = auth.uid()
    )
  );
