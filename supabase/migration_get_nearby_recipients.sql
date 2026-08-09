-- Find nearby users for alert notification (including those without push tokens)
-- Returns ALL users with nearby locations, regardless of push token status
-- Used by send-lost-alert to determine who to notify (both push + DB fallback)

DROP FUNCTION IF EXISTS get_nearby_recipients(numeric, numeric, numeric) CASCADE;

CREATE FUNCTION get_nearby_recipients(
  p_lat      decimal,
  p_lng      decimal,
  p_radius_km decimal DEFAULT 10
)
RETURNS TABLE(
  user_id   uuid,
  full_name text,
  token     text,
  platform  text,
  location_source text,
  distance_km numeric
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  -- Find ALL nearby users (with or without push tokens) by their locations
  WITH user_coords AS (
    SELECT DISTINCT ON (pr.id)
      pr.id as user_id,
      pr.full_name,
      pt.token,
      pt.platform,
      COALESCE(ul.lat, pp.location_lat) as lat,
      COALESCE(ul.lng, pp.location_lng) as lng,
      CASE
        WHEN ul.user_id IS NOT NULL THEN 'user_location (real-time)'
        WHEN pp.owner_id IS NOT NULL THEN 'pet_location (home)'
        ELSE 'unknown'
      END as location_source
    FROM profiles pr
    -- left join push_tokens (may not exist)
    LEFT JOIN push_tokens pt ON pt.user_id = pr.id
    -- primary: user_locations (real-time app data)
    LEFT JOIN user_locations ul ON ul.user_id = pr.id
    -- fallback: pet location (most recent pet home)
    LEFT JOIN (
      SELECT DISTINCT ON (owner_id) owner_id, location_lat, location_lng
      FROM pets
      WHERE location_lat IS NOT NULL
      ORDER BY owner_id, location_updated_at DESC NULLS LAST
    ) pp ON pp.owner_id = pr.id
    WHERE pr.id != auth.uid()  -- exclude alert creator
      AND (ul.user_id IS NOT NULL OR pp.owner_id IS NOT NULL)  -- has a location
    ORDER BY pr.id, ul.user_id DESC NULLS LAST
  )
  SELECT
    uc.user_id,
    uc.full_name,
    uc.token,
    uc.platform,
    uc.location_source,
    (earth_distance(
      ll_to_earth(uc.lat::float8, uc.lng::float8),
      ll_to_earth(p_lat::float8, p_lng::float8)
    ) / 1000)::numeric(10,2) as distance_km
  FROM user_coords uc
  WHERE uc.lat IS NOT NULL
    AND uc.lng IS NOT NULL
    AND earth_distance(
      ll_to_earth(uc.lat::float8, uc.lng::float8),
      ll_to_earth(p_lat::float8, p_lng::float8)
    ) <= p_radius_km * 1000
  ORDER BY distance_km;
$$;

COMMENT ON FUNCTION get_nearby_recipients IS 'Find all nearby users for SOS alerts, including those without push tokens. Used for database notification fallback system.';
