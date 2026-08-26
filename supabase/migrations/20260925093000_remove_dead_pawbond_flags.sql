-- Removes 3 dead PawBond-leftover keys from feature_flags: cuteness_arena
-- and pet_report_card are unambiguous pet-app concepts with zero real
-- consumers anywhere in Family Cube (confirmed via grep — no component
-- calls useFeatureFlag/isFeatureEnabled with these keys), and sponsored_ads
-- is PawBond's "sponsored partner listings" concept (distinct from Family
-- Cube's own, unrelated "GP-sponsored quest" vocabulary) — also zero
-- consumers. lib/featureFlags.ts's FeatureFlagKey union and the admin
-- console's Feature Flags / Paywall Groups screens have already dropped
-- these three keys; this clears any stale rows so the admin console's live
-- list can't show a flag with no corresponding app-side gate.
delete from public.feature_flags
where key in ('cuteness_arena', 'pet_report_card', 'sponsored_ads');

delete from public.feature_paywall_assignments
where feature_key in ('cuteness_arena', 'pet_report_card', 'sponsored_ads');
