-- Seeds the admin feature flag for full-screen media viewing + download.
-- Same app_settings table used by video_posts_enabled (migration_video_posts_and_insurance.sql)
-- — no schema change needed, just a new row. Toggle it from /admin/settings.
--
-- Run once: psql $DATABASE_URL < supabase/migration_media_fullscreen_flag.sql

INSERT INTO app_settings (key, value)
VALUES ('media_fullscreen_download_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
