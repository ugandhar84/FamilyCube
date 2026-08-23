-- authStore.ts's fetchProfile has selected ai_mood_consent/ai_mood_consent_date
-- since before this migrations folder's history begins, but the columns were
-- never actually created on the live profiles table (profiles predates this
-- folder's migration history entirely — created directly via SQL editor).
-- Every fetchProfile() call was silently failing with "column does not
-- exist", caught, logged as a warning, and swallowed with no fallback —
-- authStore.profile stayed null/stale, which is what left app/_layout.tsx's
-- routing gate with nothing to route on (root cause of the blank-screen
-- report after signup, not the signup flow itself).
alter table public.profiles
  add column if not exists ai_mood_consent boolean not null default false,
  add column if not exists ai_mood_consent_date timestamptz;

comment on column public.profiles.ai_mood_consent is
  'Whether the user has consented to AI-powered Mood Scan analysis of pet photos.';
comment on column public.profiles.ai_mood_consent_date is
  'When ai_mood_consent was last set — null until the user has made an explicit choice.';
