-- Onboarding, Terms & AI consent tracking
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed   boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_accepted         boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_accepted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version          text,
  ADD COLUMN IF NOT EXISTS ai_consent_accepted    boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_consent_accepted_at timestamptz;
