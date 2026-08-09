-- ── post_reports table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (post_id, reporter_id)
);

ALTER TABLE post_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own reports" ON post_reports;
CREATE POLICY "Users insert own reports" ON post_reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "Users read own reports" ON post_reports;
CREATE POLICY "Users read own reports" ON post_reports
  FOR SELECT USING (reporter_id = auth.uid());

-- ── is_hidden column on social_posts ──────────────────────────────────────────
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

-- ── RPC: posts with ≥ min_reports reports, not yet moderated ─────────────────
CREATE OR REPLACE FUNCTION get_reported_posts(min_reports int DEFAULT 50)
RETURNS TABLE (
  id           uuid,
  caption      text,
  photo_url    text,
  created_at   timestamptz,
  is_flagged   boolean,
  is_hidden    boolean,
  moderated    boolean,
  author_id    uuid,
  likes_count  int,
  report_count bigint,
  author_name  text,
  pet_name     text
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    sp.id,
    sp.caption,
    sp.photo_url,
    sp.created_at,
    sp.is_flagged,
    sp.is_hidden,
    sp.moderated,
    sp.author_id,
    sp.likes_count,
    COUNT(pr.id) AS report_count,
    p.full_name  AS author_name,
    pets.name    AS pet_name
  FROM social_posts sp
  JOIN post_reports pr ON pr.post_id = sp.id
  LEFT JOIN profiles p   ON p.id = sp.author_id
  LEFT JOIN pets         ON pets.owner_id = sp.author_id
  WHERE sp.moderated = false
  GROUP BY sp.id, p.full_name, pets.name
  HAVING COUNT(pr.id) >= min_reports
  ORDER BY report_count DESC, sp.created_at DESC
  LIMIT 200;
$$;

GRANT EXECUTE ON FUNCTION get_reported_posts(int) TO authenticated;
