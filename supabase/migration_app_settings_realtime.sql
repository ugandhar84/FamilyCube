-- Adds app_settings to the realtime publication so admin feature-flag toggles
-- push to already-open clients immediately, instead of waiting for the
-- client's 5-minute react-query staleTime to expire or a manual reload.
-- Run once: psql $DATABASE_URL < supabase/migration_app_settings_realtime.sql

ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;
