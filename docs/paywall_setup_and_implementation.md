# Family Cube — Paywall Setup & Implementation

**Model:** single-tier subscription (no feature tiers), monthly + yearly, 7-day free trial.

**Gating timeline (finalized):**

| Phase | Days since signup | Behavior |
|---|---|---|
| Trial | 1–7 | Full access, zero prompts — let people actually use the app before asking for anything |
| Post-trial nag | 8–14 | Still fully usable; a dismissible banner on Hub (at most once per session, not every login) |
| Soft lock | 15+ | Existing data stays viewable (calendar, chat history, chore history, photos already uploaded); creating anything NEW (quest, event, chat message, photo upload, reward redemption) shows the paywall instead of completing the action |

Deliberately NOT a hard lock (blocking the whole app / read access to a family's own data) at day 15 — rejected for two reasons: (1) App Store review risk, since freezing a user's own previously-created data behind a paywall reads as holding data hostage rather than gating a premium feature; (2) it would poison word-of-mouth exactly when a family has fully onboarded (invited co-parent, kids, populated a calendar) — a persistent-but-dismissible nag converts better long-term than a wall that makes the whole household's setup suddenly unusable. Matches the shape most family-org apps (Life360, Cozi) actually use post-trial.

**Pricing:** $6.99/mo, $44.99/yr (yearly ≈ 46% off monthly — the standard anchor discount that makes yearly the obvious "smart" choice). Revisit after 4–6 weeks of real trial-to-paid conversion data; App Store Connect lets pricing change anytime with no build required.

**SDK:** RevenueCat (`react-native-purchases`) — handles StoreKit receipt validation, entitlement checks, restore purchases, and paywall templates. Chosen over hand-rolled StoreKit 2 to avoid owning refund/family-sharing/upgrade-proration edge cases directly.

**Status: implemented and live** (as of 2026-08-28). Actual RevenueCat configuration (from the real dashboard, not the placeholder names Part 1 below was originally written against):
- Product IDs: `familycube_monthly`, `familycube_yearly`
- Entitlement identifier: `com_familycube_ios_premium` (display name "Family Plan") — this exact string is hardcoded in `lib/subscription.ts` (`PREMIUM_ENTITLEMENT`), `store/subscriptionStore.ts`, and both `revenuecat-webhook`/`sync-subscription` edge functions
- `SubscriptionTier` type is `'free' | 'premium'` (collapsed from an earlier `pro`/`ultimate` two-tier leftover that was never actually used by this app)
- Day 15+ soft lock is enforced server-side via Postgres RLS (`public.family_can_create_content(family_id)`, migration `20260828040000_paywall_soft_lock_rls.sql`) on the INSERT policies of `chore_tasks`, `calendar_events`, `chat_messages`, and `reward_redemptions` — verified with real test rows (blocked/allowed/subscribed-allowed all confirmed against the live DB)
- Trial window anchors to `families.created_at` (immutable server timestamp), never client-supplied

---

## Part 1 — Account Setup (must be done by a human, in App Store Connect + RevenueCat dashboards — not automatable from this codebase)

### 1A. App Store Connect — subscription group + products

1. **App Store Connect → Family Cube app → Monetization → Subscriptions**
2. Create a new **Subscription Group** — internal name `Family Cube Premium` (never shown to users)
3. Inside that group, create two subscription products:

   | Reference Name | Product ID | Duration | Price |
   |---|---|---|---|
   | Monthly | `family_cube_monthly` | 1 month | $6.99 |
   | Yearly | `family_cube_yearly` | 1 year | $44.99 |

4. For **each** product, add an **Introductory Offer**: type = Free Trial, duration = 1 week
5. Fill in required localized display name + description per product, and the subscription group's display name
6. Add a **Review Screenshot** for the group (Apple requires one image showing what the subscription unlocks — a Hub screenshot is sufficient)
7. Save as draft — ships with the next app version submission, no separate review needed right now

### 1B. App-Specific Shared Secret

**App Store Connect → Family Cube app → App Information → App-Specific Shared Secret** → generate/copy it. RevenueCat needs this to validate receipts server-side.

### 1C. RevenueCat project setup

1. Sign up at revenuecat.com → create a new **Project** (e.g. "Family Cube")
2. **Add an app** → iOS → bundle ID `com.familycube.ios` + the App-Specific Shared Secret from 1B
3. **Products** tab → add/import `family_cube_monthly` and `family_cube_yearly` (RevenueCat pulls metadata from App Store Connect once linked)
4. **Entitlements** tab → create one entitlement named `premium` → attach both products to it
5. **Offerings** tab → create one offering named `default` → add both products as packages using RevenueCat's standard identifiers: `$rc_monthly`, `$rc_annual`
6. **API Keys** tab → copy the **public iOS SDK key** (starts with `appl_`)

### Checklist before starting Part 2

- [ ] `family_cube_monthly` and `family_cube_yearly` created in App Store Connect, both with 7-day free trial intro offers
- [ ] App-Specific Shared Secret generated
- [ ] RevenueCat project created, iOS app linked with bundle ID + shared secret
- [ ] Both products imported into RevenueCat
- [ ] `premium` entitlement created, both products attached
- [ ] `default` offering created with both packages
- [ ] Public iOS SDK key (`appl_...`) copied somewhere safe

If entitlement/offering names end up different from `premium`/`default` (e.g. RevenueCat's own defaults or a personal preference), note the actual names used — the code in Part 2 references these exact strings and needs updating to match.

---

## Part 2 — Code Implementation (this repo)

*(To be filled in once Part 1 is complete and the public API key is available.)*

### 2A. Install & initialize

- `npx expo install react-native-purchases`
- Initialize the SDK once at app boot (likely `app/_layout.tsx`), passing the public API key and the current member's stable identifier as RevenueCat's app user ID
- Config value needed: public iOS SDK key — store as an EAS env var / `.env` entry, never hardcoded, following the same pattern as `EXPO_PUBLIC_SUPABASE_URL`

### 2B. Entitlement state in the app

- A small store (e.g. `store/subscriptionStore.ts`, mirroring the existing one-file-per-domain Zustand pattern) holding: `isSubscribed`, `isInTrial`, `expirationDate`, refreshed on app foreground and after any purchase/restore event
- `Purchases.getCustomerInfo()` checked against the `premium` entitlement identifier to derive `isSubscribed`

### 2C. Paywall screen

- New screen (e.g. `features/paywall/PaywallScreen.tsx`) showing both packages from the `default` offering side by side, trial messaging ("7 days free, then $6.99/mo" / "$44.99/yr"), a primary purchase CTA per plan, and a "Restore Purchases" link
- Presented as a modal, triggered from the soft-gate nag points (2D) — never blocking navigation on its own

### 2D. Gating logic (see timeline table above)

- Days 1–7: no gating code runs at all
- Days 8–14: a dismissible Hub banner, shown at most once per app session (not on every screen focus) — exact copy still to be written
- Day 15+: every "create" action (add quest, add event, send chat message, upload photo, redeem reward) checks subscription state first; if not subscribed, opens the paywall modal instead of proceeding. Every "view" action (calendar, chat history, quest history, photo frame, roster) stays unaffected
- Trial/subscription day-count source: RevenueCat's `originalPurchaseDate`/first-seen date via `Purchases.getCustomerInfo()` — no separate signup-date tracking needed in `profiles`, since RevenueCat already anchors this to first launch under that App User ID

**Enforcement must be server-side, not just client UI — no backdoor.** A client-only check (hide the button, block the screen) is trivially bypassed by a jailbroken device, a patched/sideloaded build, or a direct call to the Supabase REST/RPC endpoint with a captured auth token — none of which touch the React Native UI code at all. The client-side paywall modal is only the UX layer (so a legitimate user sees *why* they're blocked, with a clear upgrade path); the actual gate has to live where the write happens:
- **RLS policies** on `quests`/`chore_tasks`, `calendar_events`, `messages`, and the photo-frame/reward-redemption tables gain a subscription check — e.g. an INSERT policy's `WITH CHECK` calls a `public.family_is_within_trial_or_subscribed(family_id)` function, so even a raw authenticated REST call is rejected at the database, independent of what the app does
- That function needs its own source of truth for "is this family subscribed" — RevenueCat webhooks (`revenuecat-webhook` function already exists in this repo) should write subscription status into a `families`-scoped table/column on every entitlement change, so Postgres can check it locally without calling out to RevenueCat's API on every single insert
- Trial-window start (day 1) has to be a real, immutable, server-recorded timestamp (e.g. `families.created_at`, already set once at family creation) — never a client-supplied date, which could trivially be spoofed by resetting local storage or app data
- This is meaningfully more backend work than the client-only version — needs its own RLS migration(s) and the webhook wiring finished before day-15 enforcement can be considered real, not just a client-side speed bump

### 2E. Restore purchases

- Add a "Restore Purchases" action in Profile/Settings (near existing account actions), calling `Purchases.restorePurchases()` and re-syncing the subscription store

---

## Open questions / decisions still needed before finishing Part 2

- [ ] Exact nag banner copy, placement, and frequency (2D)
- [ ] Whether trial/subscription state should sync across a family's multiple devices/members, or is tracked per RevenueCat app-user-id only (affects whether a kid's PIN-profile sees the same "premium" state as the parent who subscribed)
- [ ] Analytics/event tracking for paywall views, trial starts, and conversions (not yet scoped)
