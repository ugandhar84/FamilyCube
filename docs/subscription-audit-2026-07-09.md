# Subscription & Feature Audit — 2026-07-09

## What We Did

### 1. Production Readiness (ESLint + TypeScript)
- Disabled `react/no-unescaped-entities` in `eslint.config.js` (irrelevant in React Native)
- Fixed `react/display-name` in `components/ui/FureverIcons.tsx` — `ic()` factory now assigns `displayName`
- Fixed `no-unused-expressions` in 8 files — converted Set-toggle ternaries and date-picker ternaries to `if/else` statements

### 2. Full Subscription Gate Audit

Gaps found (UI-only gates, bypassable via direct API):

| Feature | Gap | Fix |
|---------|-----|-----|
| Video posts | No server-side check | DB RLS policy via `migration_subscription_server_gates.sql` |
| Feed post limit (5/month for Free) | No server-side check | DB RLS policy (same migration) |
| Playdates (2/month for Free) | No server-side check | `supabase/functions/playdates/index.ts` — added tier + count check |
| Family invites | No server-side check | `supabase/functions/send-family-invite/index.ts` — added Pro gate |

All upgrade flows (FeatureGate, UltimateGate, health records, usePaywall, useStorageGuard) already unified to route → `/subscription/plans`.

Migration file: `supabase/migration_subscription_server_gates.sql`
- `get_user_tier(uid)` DB function
- `user_post_count_this_month(uid)` DB function
- New RLS INSERT policy on `social_posts`

### 3. Subscription Page Redesign (`app/subscription/plans.tsx`)
- Full redesign: hero section, billing toggle (monthly/annual), theme-aware cards, trust strip
- Replaced close button with `<BackButton />` for proper navigation
- Removed "Family management" from copy (feature not launching publicly yet — now added back as "Family & caretaker sharing" after audit)
- Made plan feature lists configurable: loaded from `app_settings.plan_features` at runtime, falls back to `DEFAULT_PLAN_FEATURES`
- Admin can edit all feature list text/toggles from `app/admin/pricing.tsx`

### 4. Admin Pricing Page (`app/admin/pricing.tsx`)
- Added full Plan Features editor UI — 3 cards (Free / Pro / Ultimate)
- Each row: toggle included/excluded + editable text + remove button
- "Add row" per plan
- Saves `plan_features` JSON to `app_settings` alongside prices

### 5. Edge Functions Deployed
```
supabase functions deploy send-family-invite
supabase functions deploy playdates
supabase functions deploy generate-pet-timeline   # had stale local fix
supabase functions deploy milestone-cron          # was untracked/undeployed
```

---

## Feature Audit Results

Audited every tab, AI screen, health module, and LIMITS object in `lib/subscription.ts`.

### Quota accuracy — all correct ✓

| Feature | Free | Pro | Ultimate |
|---------|------|-----|--------|
| Pets | 1 | 5 | ∞ |
| Mood scans/day | 4 | 10 | 10 |
| Health records/month | 3 | ∞ | ∞ |
| Feed posts/month | 5 | ∞ | ∞ |
| Video posts | ✗ | ✓ | ✓ |
| Playdates/month | 2 | ∞ | ∞ |
| History | 7 days | Full | Full |
| PetDoc AI chat/day | ✗ | ✗ | 50 |
| Symptom scans/day | ✗ | ✗ | 3 |
| Family management | ✗ | ✓ | ✓ |

### Features missing from marketing copy (now added)

**Free plan — newly added:**
- Daily health & wellness log (feeding, grooming, meds, checklist)
- Vet appointments & medication tracking
- Weight, vaccines & insurance log
- Nearby pets discovery (GPS-based)
- Emergency SOS & lost pet alerts

**Pro plan — newly added:**
- "Everything in Free" lead-in (previously implied, not stated)
- Family & caretaker sharing (was completely absent — major differentiator)
- Community events & RSVP

**Ultimate — already complete, minor wording only**

### Features in code not yet marketed (optional future copy)
- Pet timeline AI generation (pastel, minimal, scrapbook templates)
- Community events organizer chat
- Breed encyclopedia
- Advanced discovery filters (species, breed, distance radius)

---

## Files Changed

| File | Change |
|------|--------|
| `eslint.config.js` | Disabled `react/no-unescaped-entities` |
| `components/ui/FureverIcons.tsx` | Fixed `displayName` on all 23 icons |
| `app/(tabs)/notifications.tsx` | Set toggle ternary → if/else |
| `app/(tabs)/social-notifications.tsx` | Set toggle ternary → if/else |
| `app/health/record/[id].tsx` | Set toggle ternary → if/else |
| `app/(tabs)/social.tsx` | Set toggle ternary → if/else |
| `app/(tabs)/health.tsx` | Set toggle ternary → if/else |
| `app/health/records.tsx` | Set toggle ternary → if/else |
| `app/admin/pets.tsx` | Date-picker ternary → if/else |
| `app/admin/users.tsx` | Date-picker ternary → if/else |
| `supabase/functions/playdates/index.ts` | Added Free tier monthly limit gate |
| `supabase/functions/send-family-invite/index.ts` | Added Pro subscription gate |
| `supabase/migration_subscription_server_gates.sql` | New — DB-level video + post limit enforcement |
| `app/subscription/plans.tsx` | Full redesign + configurable feature lists |
| `app/admin/pricing.tsx` | Added plan feature list editor |
