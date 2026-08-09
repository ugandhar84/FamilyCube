-- API usage tracking — records every external API call for cost monitoring
-- Run once: psql $DATABASE_URL < supabase/migration_api_usage.sql

CREATE TABLE IF NOT EXISTS api_usage_logs (
  id           bigserial    PRIMARY KEY,
  user_id      uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  api_type     text         NOT NULL,
  -- api_type values:
  --   'gemini_mood'      Gemini mood analysis (analyze-pet-mood fn)
  --   'gemini_health'    Gemini health record parse (parse-health-record fn)
  --   'nearby_yelp'      Yelp Fusion search (nearby-places fn)
  --   'nearby_osm'       Overpass/OSM fallback (nearby-places fn)
  --   'storage_upload'   Storage write (tracked client-side)
  subcategory  text,        -- e.g. model name, endpoint
  called_at    timestamptz  NOT NULL DEFAULT now(),
  tokens_in    int,         -- input tokens (LLM only)
  tokens_out   int,         -- output tokens (LLM only)
  cost_usd     numeric(10,6),
  duration_ms  int,
  success      boolean      NOT NULL DEFAULT true,
  error_msg    text,
  metadata     jsonb        DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user     ON api_usage_logs (user_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_type     ON api_usage_logs (api_type, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_date     ON api_usage_logs (called_at DESC);

-- Partition hint: if rows grow large, partition by month on called_at.

-- RLS: users cannot read or write usage logs. Service-role only.
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read usage" ON api_usage_logs;
DROP POLICY IF EXISTS "service insert"   ON api_usage_logs;

CREATE POLICY "admin read usage" ON api_usage_logs
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

CREATE POLICY "service insert" ON api_usage_logs
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Storage usage summary view — grouped by resolved user
DROP VIEW IF EXISTS storage_usage_summary;
-- First path segment is either a pet UUID, 'sponsored', or a literal prefix.
-- We join public.pets to map pet UUID → owner_id, then group by owner.
CREATE OR REPLACE VIEW storage_usage_summary AS
SELECT
  COALESCE(p.owner_id::text, o.first_segment)   AS user_id,    -- auth user uuid, or 'sponsored' / other literal
  COUNT(*)                                        AS file_count,
  SUM((o.metadata->>'size')::bigint)              AS total_bytes,
  MAX(o.created_at)                               AS last_upload
FROM (
  SELECT
    *,
    split_part(name, '/', 1) AS first_segment
  FROM storage.objects
  WHERE bucket_id = 'pets'
) o
LEFT JOIN public.pets p
  ON p.id::text = o.first_segment   -- only matches when first_segment is a valid pet uuid
GROUP BY 1
ORDER BY total_bytes DESC NULLS LAST;
