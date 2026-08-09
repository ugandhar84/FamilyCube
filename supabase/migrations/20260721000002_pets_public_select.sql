-- Allow any authenticated user to view active pets.
-- Previously restricted to owner / family / location-shared, which blocked
-- the social pet profile view when tapping @mentions or public posts.
-- Sensitive columns (insurance, microchip, vet details) are protected at the
-- application layer — they are only rendered for owners/family members.

DROP POLICY IF EXISTS "Anyone can view nearby pets" ON pets;

CREATE POLICY "Authenticated users can view active pets"
  ON pets FOR SELECT
  USING (
    -- Always: owner can see own pets (including inactive/memorial)
    auth.uid() = owner_id
    OR
    -- Always: family members can see family pets
    id IN (SELECT get_my_family_pet_ids())
    OR
    -- Social: any authenticated user can view active pets
    (is_active = true AND auth.uid() IS NOT NULL)
  );
