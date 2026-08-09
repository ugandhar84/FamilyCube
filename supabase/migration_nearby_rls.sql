-- =============================================
-- Fix: Allow viewing nearby pets for playdates
-- =============================================
-- Issue: Pets with location_shared=true aren't visible in Nearby
-- Cause: RLS policy only allows viewing own/family pets
-- Fix: Add policy allowing viewing nearby pets with location_shared=true

DROP POLICY IF EXISTS "Anyone can view nearby pets" ON pets;
CREATE POLICY "Anyone can view nearby pets"
  ON pets FOR SELECT
  USING (
    -- User is owner
    auth.uid() = owner_id
    OR
    -- User is family member
    id IN (SELECT get_my_family_pet_ids())
    OR
    -- Pet has location sharing enabled (Nearby feature)
    location_shared = true AND location_lat IS NOT NULL AND location_lng IS NOT NULL
  );
