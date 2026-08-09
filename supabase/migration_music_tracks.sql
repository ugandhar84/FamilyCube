-- Music tracks for Year in Review slideshow backgrounds
-- Run once: psql $DATABASE_URL < supabase/migration_music_tracks.sql
-- Or paste into Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS music_tracks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category        text NOT NULL CHECK (category IN ('upbeat','calm','nostalgic','tender')),
  title           text NOT NULL,
  artist          text,
  duration_seconds integer,
  storage_path    text NOT NULL,  -- path inside the "music" storage bucket
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS music_tracks_category_idx ON music_tracks (category);

-- Storage bucket (run once in dashboard or via CLI, bucket must be public)
-- supabase storage create music --public
