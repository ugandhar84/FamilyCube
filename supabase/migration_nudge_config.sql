-- Seed upgrade nudge config into app_settings (upsert so re-running is safe)
INSERT INTO app_settings (key, value, updated_at)
VALUES
  ('upgrade_nudge_enabled',       'true'::jsonb,  now()),
  ('upgrade_nudge_interval_days', '1'::jsonb,     now()),
  ('upgrade_nudge_concern_mode',  '"random"'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
