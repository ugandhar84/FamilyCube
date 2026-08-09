-- Generic key/value config table for admin-controlled feature flags
CREATE TABLE IF NOT EXISTS app_config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only service role / admin can write; authenticated users can read
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all" ON app_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "read_all" ON app_config
  FOR SELECT USING (true);

-- Seed: species enabled map (bird + fish disabled)
INSERT INTO app_config (key, value) VALUES (
  'species_enabled',
  '{"dog":true,"cat":true,"rabbit":true,"bird":false,"fish":false,"hamster":true,"turtle":true,"other":true}'::jsonb
) ON CONFLICT (key) DO NOTHING;
