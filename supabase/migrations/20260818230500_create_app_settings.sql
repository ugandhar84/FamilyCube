-- lib/db/appSettings.ts and lib/hooks/useAppSettings.ts (useFeatureFlag) have
-- referenced this table since the pet-appointment voice feature was built,
-- but it was never actually created — every read/write against it
-- (appt_voice_input_enabled, and now voice_intake_enabled) has been failing
-- with "relation app_settings does not exist".

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- App-wide config (feature flags) — readable by any authenticated user,
-- matching useFeatureFlag's client-side read pattern. No client write path
-- exists today (admin-only, via the Supabase dashboard), so no INSERT/UPDATE
-- policy is needed yet.
DROP POLICY IF EXISTS "app_settings_select" ON public.app_settings;
CREATE POLICY "app_settings_select" ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.app_settings (key, value, updated_by, updated_at)
VALUES
  ('appt_voice_input_enabled', 'true'::jsonb, 'system', now()),
  ('voice_intake_enabled', 'true'::jsonb, 'system', now())
ON CONFLICT (key) DO NOTHING;
