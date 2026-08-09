-- Ensure voice appointment feature flag is enabled in app_settings
-- Run with: psql $DATABASE_URL < supabase/migrations/ensure_voice_appointment_flag.sql

INSERT INTO app_settings (key, value, updated_by, updated_at)
VALUES ('appt_voice_input_enabled', true, 'system', NOW())
ON CONFLICT (key) DO UPDATE
SET value = true, updated_at = NOW();

-- Verify it's set
SELECT 'Voice appointment feature flag set to:' as status, value FROM app_settings WHERE key = 'appt_voice_input_enabled';
