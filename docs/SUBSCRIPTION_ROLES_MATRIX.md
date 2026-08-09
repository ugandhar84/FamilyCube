# Subscription × Role Matrix — Petkoinia

> **Last updated:** 2026-07-08  
> Covers every combination of user tier × pet-owner tier × family role and what is allowed.

---

## Roles (stored in `pet_family.role`)

| DB value | Real-world person | Inherits owner tier? |
|---|---|---|
| `owner` | Registered pet owner — full control | n/a (they ARE the owner) |
| `caretaker` | Partner / spouse / family member — active care | **YES** |
| `caregiver` | Dog walker / pet sitter — daily care only | **NO** |
| `viewer` | Grandparent / observer — read-only | **NO** |

> **Only caretakers inherit.** Caregiver and viewer always use their own subscription tier.

---

## Subscription Tiers

| Tier | Owned pets | Vet chat / Symptom scan | Health reminders | AI scans/day |
|---|---|---|---|---|
| `free` | 1 | ✗ | ✗ | 2 |
| `pro` | 5 | ✗ | ✓ | 10 |
| `ultimate` | **unlimited** | ✓ (50/day) | ✓ | 10 |

**Pet limit counts owned pets only** (`petRoles[id] === 'owner'`).  
Shared/family pets live on the owner's quota — they never count against the viewer's limit.

---

## Context-Tier Rule

When a user acts on a shared pet, their **effective tier** is:

```
effectiveTier = max(own_tier, owner_tier)   ← caretaker only
effectiveTier = own_tier                     ← caregiver, viewer
```

"max" uses the rank: `free(0) < pro(1) < ultimate(2)`

Each user gets their **own daily quota** under the effective tier — caretaker usage does not deplete the owner's pool.

---

## Full 27-Combination Matrix

> ✓ = allowed by own tier | **✓ inh** = allowed via inheritance | ✗ = blocked

### My tier: Free (owned pets: up to 1)

| Owner tier | My role | Vet chat | Reminders | Notes |
|---|---|---|---|---|
| Free | caretaker | ✗ | ✗ | No one has paid |
| Free | caregiver | ✗ | ✗ | |
| Free | viewer | ✗ | ✗ | |
| Pro | **caretaker** | ✗ | **✓ inh** | Gets reminders; Pro ≠ Ultimate for vet chat |
| Pro | caregiver | ✗ | ✗ | No inherit |
| Pro | viewer | ✗ | ✗ | No inherit |
| Ultimate | **caretaker** | **✓ inh** | **✓ inh** | Full access — partner of Ultimate owner |
| Ultimate | caregiver | ✗ | ✗ | Dog walker doesn't inherit |
| Ultimate | viewer | ✗ | ✗ | |

### My tier: Pro (owned pets: up to 5)

| Owner tier | My role | Vet chat | Reminders | Notes |
|---|---|---|---|---|
| Free | caretaker | ✗ | ✓ | Own Pro covers reminders |
| Free | caregiver | ✗ | ✓ | Own tier |
| Free | viewer | ✗ | ✓ | Own tier |
| Pro | caretaker | ✗ | ✓ | Same tier — no difference |
| Pro | caregiver | ✗ | ✓ | |
| Pro | viewer | ✗ | ✓ | |
| Ultimate | **caretaker** | **✓ inh** | ✓ | Inherits Ultimate for vet chat on top of own Pro reminders |
| Ultimate | caregiver | ✗ | ✓ | No inherit |
| Ultimate | viewer | ✗ | ✓ | |

### My tier: Ultimate (owned pets: unlimited)

All 9 combinations → vet chat ✓, reminders ✓, unlimited pets.  
Own Ultimate always wins — owner tier and role are irrelevant.

---

## Social / Playdate / SOS Rules

Social features are **community actions by the user**, not family-inherited. Context-tier does NOT apply.

| Feature | Tier gate | Role gate | Notes |
|---|---|---|---|
| Create post | Free | Caretaker+ (not viewer) | Community growth — never paywall |
| Like / comment | Free | Any | |
| Free daily posts | 5/day cap | — | Pro = unlimited |
| Request playdate | Free | Owner only | Already enforced server-side |
| Respond to playdate | Free | Owner only | |
| Playdate chat | **Pro** | Owner only | Premium feature |
| SOS send | **Never gate** | Owner + Caretaker | Emergency — paywalling is a safety liability |
| SOS receive (community) | Free | Any nearby user | Wider reach = faster recovery |
| SOS radius | Free=5km, Pro=25km, Ultimate=∞ | — | Optional upsell |
| Browse / RSVP events | Free | Any | |
| Create event | **Pro** | Any | Prevents spam |

---

## Implementation Map

### Server — Edge Functions

| File | Change |
|---|---|
| `supabase/functions/_shared/requirePro.ts` | Added `getContextTier(db, userId, petId)`, `requireUltimateForPet()`, `requireProForPet()` |
| `supabase/functions/vet-chat/index.ts` | Requires `pet_id` in body; gates via `requireUltimateForPet` |
| `supabase/functions/symptom-scan/index.ts` | Same as vet-chat |
| `supabase/functions/send-appointment-reminder/index.ts` | Caretakers on Pro+ owner's pet always pass tier gate |
| `supabase/functions/send-vaccine-reminder/index.ts` | Same, with per-pet owner tier resolution |

### Database

| Migration | What it does |
|---|---|
| `supabase/migration_context_tier.sql` | Creates `get_caretaker_owner_tiers()` RPC (SECURITY DEFINER) — returns `(pet_id, owner_tier)` for caller's caretaker pets; safely bypasses RLS on `subscriptions` |
| `supabase/migration_photo_privacy.sql` | Creates private `pet-media` bucket; RLS: owner + pet_family SELECT/INSERT, owner DELETE; adds `storage_path` column to `pet_photos` |
| `supabase/migration_rbac_gaps.sql` | Appointments: tighten from is_pet_member → can_log_health; pet_photos DELETE: owner only |
| `supabase/migration_notification_tier_gate.sql` | notification_logs tier column; service-role-only insert policy |

### Client

| File | Change |
|---|---|
| `lib/subscription.ts` | `ultimate.pets = -1` (unlimited) |
| `store/petStore.ts` | `ownerTierByPet: Record<string, string>` state; populated via `get_caretaker_owner_tiers()` RPC in `fetchPets`; cleared on sign-out |
| `lib/hooks/usePaywall.ts` | `useContextTier(petId?)` hook; pet count bug fixed (owned only via `petRoles === 'owner'`) |
| `app/ai/vet-chat.tsx` | Uses `useContextTier(pet?.id)`; passes `pet_id` to edge function |
| `app/ai/symptom-scan.tsx` | Same |
| `app/(tabs)/health.tsx` | Add appt + Log vaccine quick actions locked for viewer/caregiver (opacity + lock icon) |
| `app/(tabs)/profile.tsx` | Health alerts + Appointment reminders toggles locked behind Pro badge for free users |

---

## Key Invariants (never break these)

1. **Tier is always per-user** — being added to a pet family never upgrades your subscription.
2. **Only caretaker inherits** — caregiver and viewer always use their own tier.
3. **Pet limit = owned pets only** — shared pets live on the owner's quota.
4. **SOS is never paywalled** — not even for free users.
5. **Quota is per-user** — caretakers using inherited Ultimate get their own 50/day; they don't drain the owner's pool.
6. **Inheritance is live-checked** — if owner's subscription lapses, caretakers immediately lose inherited access. No grace period for inherited benefits.
