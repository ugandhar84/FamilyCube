-- Track real-time user locations for SOS nearby alerts
-- Updated whenever the app is open and location is available (TTL: 30 days)

-- Enable PostGIS extensions for spatial distance calculations
CREATE EXTENSION IF NOT EXISTS earthdistance CASCADE;
CREATE EXTENSION IF NOT EXISTS cube CASCADE;

CREATE TABLE IF NOT EXISTS user_locations (
  user_id      uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lat          numeric     NOT NULL,
  lng          numeric     NOT NULL,
  accuracy_m   numeric,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- GiST index for spatial queries with earthdistance
CREATE INDEX IF NOT EXISTS user_locations_geo_idx
  ON user_locations USING gist (ll_to_earth(lat::float8, lng::float8));

ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;

-- Users can only write their own location
DROP POLICY IF EXISTS "user_locations_own_write" ON user_locations;
CREATE POLICY "user_locations_own_write" ON user_locations
  FOR ALL USING (user_id = auth.uid());

-- Service role reads all (for SOS queries)
DROP POLICY IF EXISTS "user_locations_service_read" ON user_locations;
CREATE POLICY "user_locations_service_read" ON user_locations
  FOR SELECT USING (true);

-- ── Updated get_nearby_users — queries user_locations table ──────────────────
-- Falls back to pets.location_lat/lng if no user_location row exists.

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
  platform  text
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT ON (pt.user_id)
    pt.user_id,
    pr.full_name,
    pt.token,
    pt.platform
  FROM push_tokens pt
  JOIN profiles pr ON pr.id = pt.user_id
  -- primary: user_locations (most accurate, real-time)
  LEFT JOIN user_locations ul ON ul.user_id = pt.user_id
  -- fallback: pet location
  LEFT JOIN (
    SELECT DISTINCT ON (owner_id) owner_id, location_lat, location_lng
    FROM pets
    WHERE location_lat IS NOT NULL
    ORDER BY owner_id, location_updated_at DESC NULLS LAST
  ) pp ON pp.owner_id = pt.user_id
  WHERE pt.token LIKE 'ExponentPushToken%'
    AND pt.user_id != auth.uid()
    AND (
      -- within radius via user_locations
      (ul.user_id IS NOT NULL AND
       earth_distance(
         ll_to_earth(ul.lat::float8, ul.lng::float8),
         ll_to_earth(p_lat::float8, p_lng::float8)
       ) <= p_radius_km * 1000)
      OR
      -- fallback via pet location
      (ul.user_id IS NULL AND pp.owner_id IS NOT NULL AND
       earth_distance(
         ll_to_earth(pp.location_lat::float8, pp.location_lng::float8),
         ll_to_earth(p_lat::float8, p_lng::float8)
       ) <= p_radius_km * 1000)
    )
  ORDER BY pt.user_id;
$$;
