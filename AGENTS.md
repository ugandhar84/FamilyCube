# PawBond — Agent & Developer Notes

## Stack
- Expo SDK 56 / React Native / TypeScript
- Expo Router (file-based, `app/` directory)
- Supabase (Postgres + Auth + Storage + Edge Functions)
- Zustand stores in `store/`
- React Query (`lib/queryClient.ts`) for feed/social data
- RevenueCat for subscriptions

---

## Supabase project

**Project ID:** `plxkecboykmukotmixqx`
**Dashboard:** https://supabase.com/dashboard/project/plxkecboykmukotmixqx

### Migrations applied (in order)

| File | Applied | Notes |
|---|---|---|
| `supabase/migration_comment_likes_photos.sql` | ✅ 2026-08-03 | comment_likes, photo_url, likes_count, reply_to_comment_id |
| `supabase/migration_feature_flags.sql` | ✅ 2026-08-03 | feature_flags table, all flags seeded OFF |
| `supabase/migration_rewards_marketplace.sql` | ✅ 2026-08-03 | partner_offers, user_coupons, coin_ledger, redeem_offer() |
| `supabase/migration_award_coins_server.sql` | ✅ 2026-08-03 | award_coins(), update_streak(), clawback_coins(), coin_daily_caps, column REVOKE |
| `supabase/migration_partner_conversions.sql` | ✅ 2026-08-03 | partner_conversions, admin_conversion_summary view, push_token + email on profiles |

### Edge Functions deployed

| Function | Deployed | Purpose |
|---|---|---|
| `send-coupon` | ✅ 2026-08-03 | Push + email delivery after coupon redemption |
| `partner-webhook` | ✅ 2026-08-03 | Inbound conversion webhooks from affiliate partners |

### Secrets needed before go-live (not yet set)

```bash
supabase secrets set RESEND_API_KEY=re_xxxx
supabase secrets set RESEND_FROM="PawBond <rewards@pawbond.app>"
supabase secrets set PARTNER_SECRET_AMAZON=your_secret
supabase secrets set PARTNER_SECRET_CHEWY=your_secret
supabase secrets set PARTNER_SECRET_PETSMART=your_secret
supabase secrets set PARTNER_SECRET_PETCO=your_secret
supabase secrets set PARTNER_SECRET_GENERIC=your_fallback_secret
```

---

## Change notes (2026-08-03)

### Social: comment likes, photo attachments, reply threading

**Migration applied:** `supabase/migration_comment_likes_photos.sql`
- `post_comments.reply_to_comment_id uuid` — thread parent
- `post_comments.photo_url text` — photo in comment
- `post_comments.likes_count integer DEFAULT 0` — denormalised
- `comment_likes` table with RLS + trigger keeping `likes_count` in sync

**Files changed:**
- `features/social/screens/PostDetailScreen.tsx` — loads `liked`, `likes_count`, `photo_url`, `reply_to_comment_id`; `handleCommentLike()` writes to `comment_likes`
- `features/social/components/PostCommentsList.tsx` — `CommentRow` with optimistic heart toggle, photo display, reply indentation
- `features/social/components/PostCommentInput.tsx` — `expo-image-picker` photo attachment; `onSubmit(photoUri?)` signature

**Bug fixed (build 71):** `PostDetailScreen` pets embedded SELECT included `dob` and `city` columns that do not exist in the DB. PostgREST rejects the entire query when any embedded column is missing — this caused every post to show "Couldn't load post". Fixed by removing those columns from the SELECT.

---

### Social: unfollow sheet UX

`features/social/screens/SocialScreen.tsx` — unfollow confirmation no longer auto-closes the sheet. Sheet stays open until user swipes down or taps X. Unfollow alert fires inline; sheet remains visible throughout.

---

### Feature flag system

**`lib/featureFlags.ts`** — central registry of all unreleased features.

- Remote control: `feature_flags` table in Supabase (all OFF by default)
- Local dev override: `LOCAL_OVERRIDES` object in the file (never commit as `true`)
- Boot prefetch: `prefetchFeatureFlags()` called in `app/_layout.tsx`
- Hook: `useFeatureFlag('key')` — returns `boolean`
- Sync check: `isFeatureEnabled('key')` — for use outside components

**Migration applied:** `supabase/migration_feature_flags.sql`

**Current flags:**

| Key | Default | Description |
|---|---|---|
| `gamification` | OFF | Master switch — XP, levels, coins, quests, leaderboard |
| `daily_quests` | OFF | Daily quest panel |
| `leaderboard` | OFF | Weekly leaderboard |
| `cuteness_arena` | OFF | Weekly bracket vote |
| `pet_report_card` | OFF | Monthly shareable stat card |
| `seasonal_events` | OFF | Time-limited holiday challenges |
| `rewards_marketplace` | OFF | Partner coupon redemption with coins |

To enable for testing (no app update needed):
```sql
UPDATE feature_flags SET enabled = true WHERE key = 'rewards_marketplace';
```

---

### Gamification & Rewards Marketplace

**Architecture:**
- 🪙 Coins → `profiles.coins` (1 wallet per human owner, NOT per pet)
- ⬆️ XP/Level → `pets.xp` (future — per pet, independent)
- 🔥 Streak → `profiles.streak_days` + `profiles.last_active_date`

**Migrations applied (run in order):**
1. `supabase/migration_rewards_marketplace.sql` — partner_offers, user_coupons, coin_ledger, redeem_offer() function, seed offers
2. `supabase/migration_award_coins_server.sql` — award_coins() RPC, update_streak(), clawback_coins(), coin_daily_caps table, column-level REVOKE on coins

**Critical security rule:** Client code NEVER writes directly to `profiles.coins`. All coin movement goes through:
- `award_coins(p_user_id, p_action)` — earning (server validates all guards)
- `redeem_offer(p_user_id, p_offer_id)` — spending (atomic, no double-spend)
- `clawback_coins(p_user_id, p_reason, p_ref_id)` — internal only, fires when post/comment deleted or flagged

**Anti-abuse guards in `award_coins()`:**
1. Account must be ≥48h old (blocks throwaway signups)
2. Email must be confirmed
3. Global daily cap: 100 coins/day hard ceiling
4. Per-action daily caps (see table below)
5. Cooldowns: posts 5 min, comments 2 min
6. Admin-configurable rates (stored in `app_settings.coin_rates`) override defaults at runtime

**Earn rates & daily caps:**

| Action | Coins | Max/day |
|---|---|---|
| `daily_login` | 10 | 1× |
| `post_created` | 20 | 3× |
| `post_liked` | 2 | 10 likes |
| `comment_added` | 5 | 5× |
| `streak_7day` | 50 | 1× per streak |
| `streak_30day` | 200 | 1× per streak |
| `level_up` | 100 | 5× |

**Streak logic (`update_streak()`):** Call once per session after app open. Consecutive day → extend; gap → reset to 1. Milestone awards (`streak_7day`, `streak_30day`) fire automatically inside the function.

**Coupon redemption (`redeem_offer()`):**
- Atomic: row-lock on offer + profile
- Validates: active, not expired, stock available, per-user limit, sufficient balance
- Code-pool offers: pops first code from `coupon_pool[]`
- Affiliate-link offers: no code, just increments `redeemed_count`
- Writes `user_coupons` + `coin_ledger` in same transaction

**Client call (correct path):**
```typescript
import { awardCoins, updateStreak } from '@/lib/db/rewards';

// On app open / daily login:
const streakResult = await updateStreak(userId);
const coinResult   = await awardCoins(userId, 'daily_login');

// On post created:
const result = await awardCoins(userId, 'post_created', postId);
if (result.ok) showCoinToast(result.coins_awarded); // show +20🪙 animation
```

**Revenue model:** Coupons must be affiliate links (commission on purchase) or pre-negotiated free code pools. Never issue coupons that cost money per-redemption without a partner contract. Cheapest coupon = 150 coins = 1.5 days of max engagement — prevents overnight coupon farming.

---

### Admin: Rewards Management

Three new admin screens (all behind `is_admin = true` gate):

| Route | Screen | Purpose |
|---|---|---|
| `/admin/rewards-offers` | Partner Offers | Full CRUD for partner_offers — create, edit, toggle, delete |
| `/admin/coins-config` | Coins Config | Edit earn rates, view top earners, grant/deduct coins per user |
| `/admin/rewards-bulk-upload` | Bulk Upload | CSV import for offers + bulk code paste for code-pool offers |

**Bulk upload CSV format (offers):**
```
partner_name,partner_logo,title,description,category,coins_cost,discount_pct,coupon_type,affiliate_url,max_uses_per_user,total_stock,valid_until
Amazon,🛒,10% off dog food,Valid on Royal Canin,food,300,10,link,https://amzn.to/x,1,,2025-12-31
```

**Bulk upload codes:** Select offer → paste codes (one per line or comma-separated) → deduplication applied automatically.

**Earn rate changes** (Coins Config screen) take effect immediately — rates stored in `app_settings` (key: `coin_rates`), read by `award_coins()` at runtime. No app update needed.

---

### Edge Functions — Rewards delivery

**`send-coupon`** — Fires after `redeem_offer()` succeeds. Called client-side non-blocking via `supabase.functions.invoke('send-coupon', { body: { coupon_id } })`.
- Sends Expo push notification: "Your reward is ready!"
- Sends branded HTML email via Resend with coupon code or affiliate link button
- Requires secrets: `RESEND_API_KEY`, `RESEND_FROM`
- **Deployed: ✅ 2026-08-03**

**`partner-webhook`** — Receives inbound conversion webhooks from affiliate partners.
- URL: `https://plxkecboykmukotmixqx.supabase.co/functions/v1/partner-webhook?partner=amazon`
- Validates shared secret per partner (`PARTNER_SECRET_AMAZON`, `PARTNER_SECRET_CHEWY`, etc.)
- Normalises Amazon / Chewy / generic webhook schemas to one `ConversionEvent` shape
- On confirmed conversion: marks coupon used, awards bonus coins (bypasses daily cap — it's a purchase not engagement), writes `partner_conversions` row, sends push "Purchase confirmed +25 coins"
- Idempotent: duplicate webhook for same coupon is acknowledged but not double-processed
- Unattributed conversions (no `coupon_id` query param) are logged for analytics
- **Deployed: ✅ 2026-08-03**

**Migration applied:** `supabase/migration_partner_conversions.sql`
- `partner_conversions` table with RLS + indexes
- `admin_conversion_summary` view (revenue by partner — shown in Coins Config admin screen)
- `app_settings` row: `conversion_bonus_coins` → `{ "default_bonus": 25 }` (edit in admin)
- `profiles.push_token text` + `profiles.email text` columns added

**Live project ID:** `plxkecboykmukotmixqx`

**Webhook URLs to give each partner (replace `amazon` with partner slug):**
```
https://plxkecboykmukotmixqx.supabase.co/functions/v1/partner-webhook?partner=amazon
https://plxkecboykmukotmixqx.supabase.co/functions/v1/partner-webhook?partner=chewy
https://plxkecboykmukotmixqx.supabase.co/functions/v1/partner-webhook?partner=petsmart
https://plxkecboykmukotmixqx.supabase.co/functions/v1/partner-webhook?partner=petco
```
`coupon_id` **must** be appended to every affiliate deeplink as a query param so conversions can be attributed to the user who redeemed:
```
https://amzn.to/your-link?coupon_id={USER_COUPON_UUID}
```

**Secrets — set once per environment (not yet set — do this before going live):**
```bash
supabase secrets set RESEND_API_KEY=re_xxxx
supabase secrets set RESEND_FROM="PawBond <rewards@pawbond.app>"
supabase secrets set PARTNER_SECRET_AMAZON=your_amazon_shared_secret
supabase secrets set PARTNER_SECRET_CHEWY=your_chewy_shared_secret
supabase secrets set PARTNER_SECRET_PETSMART=your_petsmart_shared_secret
supabase secrets set PARTNER_SECRET_PETCO=your_petco_shared_secret
supabase secrets set PARTNER_SECRET_GENERIC=your_fallback_secret
```

**Redeploy command (after any code changes):**
```bash
supabase functions deploy send-coupon partner-webhook
```

---

## Do not do

- Never write directly to `profiles.coins`, `profiles.lifetime_coins`, `profiles.streak_days` from client code — column-level REVOKE blocks it and it will silently fail
- Never add `dob` or `city` to the pets embedded SELECT — those columns do not exist in the DB
- Never call `award_coins()` from a server context without the `p_user_id` of the acting user (no admin grants via this function — use `coin_ledger` direct insert with service role for that)
- Never commit `LOCAL_OVERRIDES` in `lib/featureFlags.ts` with any value set to `true`
