-- Seed the admin-controlled AI model priority config.
-- Run once: psql $DATABASE_URL < supabase/migration_ai_model_config.sql

INSERT INTO app_settings (key, value, updated_by)
VALUES (
  'ai_model_config',
  '{
    "vision":   ["gemini-2.5-flash", "gemini-2.0-flash"],
    "text":     ["gemini-2.5-flash", "gemini-2.0-flash"],
    "deepseek": ["deepseek-chat"]
  }'::jsonb,
  NULL
)
ON CONFLICT (key) DO NOTHING;
