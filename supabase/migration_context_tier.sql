-- Migration: context-tier (family membership sharing)
--
-- Adds a SECURITY DEFINER RPC that lets the client discover the pet owner's
-- subscription tier for pets where the caller is a CARETAKER.
-- RLS on `subscriptions` prevents direct cross-user reads, so this function
-- acts as the safe, scoped bridge.
--
-- Rules enforced here:
--   • Only caretaker role inherits — caregiver and viewer do NOT
--   • Returns (pet_id, owner_tier) for each caretaker pet the caller has
--   • Callers with no caretaker pets get an empty result set
--
-- Run once: psql $DATABASE_URL < supabase/migration_context_tier.sql

CREATE OR REPLACE FUNCTION get_caretaker_owner_tiers()
RETURNS TABLE(pet_id uuid, owner_tier text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pf.pet_id,
    COALESCE(
      (
        SELECT s.tier
        FROM subscriptions s
        WHERE s.user_id = p.owner_id
          AND s.status IN ('active', 'grace_period')
        ORDER BY s.updated_at DESC
        LIMIT 1
      ),
      'free'
    ) AS owner_tier
  FROM pet_family pf
  JOIN pets p ON p.id = pf.pet_id
  WHERE pf.user_id = auth.uid()
    AND pf.role = 'caretaker';
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION get_caretaker_owner_tiers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_caretaker_owner_tiers() TO authenticated;
