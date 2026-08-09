-- Cached nearby places, keyed by area grid cell (~1km x 1km)
-- area_key = "lat_2dp,lng_2dp" e.g. "37.77,-122.41"
CREATE TABLE IF NOT EXISTS nearby_places (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  area_key     text        NOT NULL UNIQUE,
  lat_center   numeric     NOT NULL,
  lng_center   numeric     NOT NULL,
  radius_m     integer     NOT NULL DEFAULT 4000,
  places       jsonb       NOT NULL DEFAULT '[]',
  enriched     boolean     NOT NULL DEFAULT false,
  raw_count    integer     NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nearby_places_area_key_idx ON nearby_places(area_key);
CREATE INDEX IF NOT EXISTS nearby_places_refreshed_idx ON nearby_places(refreshed_at);

-- Public read (any authenticated user can read nearby cache)
ALTER TABLE nearby_places ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nearby_read"   ON nearby_places FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "nearby_upsert" ON nearby_places FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "nearby_update" ON nearby_places FOR UPDATE USING (auth.role() = 'authenticated');

-- Allow authenticated users to delete (needed for cache clearing)
CREATE POLICY "nearby_delete" ON nearby_places FOR DELETE USING (auth.role() = 'authenticated');
