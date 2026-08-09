-- Enhanced get_nearby_users with debug logging and better fallback logic

DROP FUNCTION IF EXISTS get_nearby_users(numeric, numeric, numeric) CASCADE;

CREATE FUNCTION get_nearby_users(
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
  -- Find users by their actual locations (primary: user_locations, fallback: pet locations)
  WITH user_coords AS (
    SELECT DISTINCT ON (pt.user_id)
      pt.user_id,
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
    FROM push_tokens pt
    JOIN profiles pr ON pr.id = pt.user_id
    -- primary: user_locations (real-time app data)
    LEFT JOIN user_locations ul ON ul.user_id = pt.user_id
    -- fallback: pet location (most recent pet home)
    LEFT JOIN (
      SELECT DISTINCT ON (owner_id) owner_id, location_lat, location_lng
      FROM pets
      WHERE location_lat IS NOT NULL
      ORDER BY owner_id, location_updated_at DESC NULLS LAST
    ) pp ON pp.owner_id = pt.user_id
    WHERE pt.token LIKE 'ExponentPushToken%'
      AND pt.user_id != auth.uid()
      AND (ul.user_id IS NOT NULL OR pp.owner_id IS NOT NULL)
    ORDER BY pt.user_id, ul.user_id DESC NULLS LAST
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
  WHERE earth_distance(
    ll_to_earth(uc.lat::float8, uc.lng::float8),
    ll_to_earth(p_lat::float8, p_lng::float8)
  ) <= p_radius_km * 1000
  ORDER BY distance_km;
$$;

-- Also sync location when user is logged in from SOS screen
-- This ensures real-time location data for nearby notifications
