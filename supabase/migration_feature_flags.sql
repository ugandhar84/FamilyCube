-- Feature flags table for remote toggling without app updates
CREATE TABLE IF NOT EXISTS feature_flags (
  key        text        PRIMARY KEY,
  enabled    boolean     NOT NULL DEFAULT false,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Anyone (even unauthenticated) can read flags — they're not sensitive
CREATE POLICY "Anyone can read feature_flags"
  ON feature_flags FOR SELECT USING (true);

-- Only service role can write (via Supabase dashboard / migrations)
-- No INSERT/UPDATE policy = only service_role can modify

-- Seed all known flags as OFF
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('gamification',    false, 'XP / levels / coins / daily quests / leaderboard system'),
  ('daily_quests',    false, 'Daily quest panel — sub-feature of gamification'),
  ('leaderboard',     false, 'Weekly leaderboard — sub-feature of gamification'),
  ('cuteness_arena',  false, 'Weekly bracket vote — sub-feature of gamification'),
  ('pet_report_card', false, 'Monthly auto-generated shareable stat card'),
  ('seasonal_events', false, 'Time-limited holiday challenges')
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
