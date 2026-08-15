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

---

# FamilyCubeApp — UI Typography Standard (2026-08-15)

## TYPO scale (`constants/theme.ts`)

```typescript
export const TYPO = {
  hero:       32,
  title:      24,
  heading:    20,
  subheading: 17,
  body:       15,
  caption:    13,
  label:      11,
  micro:      9,
};
```

## How to use TYPO in every form / bottom sheet

Apply this scale consistently across **all** modal, sheet, and form components. Never hardcode font sizes.

| Element | TYPO token | Notes |
|---|---|---|
| Sheet / modal title | `heading` (20) | `fontWeight: '900'` |
| Subtitle / description | `caption` (13) | Under the title |
| Section headers (ALL CAPS labels) | `caption` (13) | `textTransform: 'uppercase'`, `letterSpacing: 0.5` |
| Field labels | `caption` (13) | `fontWeight: '700'` |
| Text inputs | `body` (15) | `padding: 13`, `borderWidth: 1.5`, `borderRadius: 14` |
| Textarea | `body` (15) | `padding: 13`, `minHeight: 80` |
| Pill / chip text (primary) | `body` (15) | Selector chips, urgency buttons, category chips |
| Pill / chip text (compact) | `caption` (13) | Inline suggestion pills in title field |
| Suggestion pill header | `label` (11) | "Quick picks" / "Matching — tap to fill" |
| Info/note text | `label` (11) | Secondary hints below inputs |
| Micro badges, counts | `label` (11) or `caption` (13) | Never use `micro` (9) in forms |
| Submit button text | `body` (15) | `fontWeight: '900'` |
| Cancel button text | `body` (15) | `fontWeight: '700'` |

**Rule:** `TYPO.micro` (9) is forbidden inside forms — it is only for tiny decorative labels (e.g. map pins, graph axis). Minimum readable size in any interactive element is `TYPO.label` (11).

## Files where TYPO is applied

| File | Key upgrades |
|---|---|
| `features/calendar/EventFormModal.tsx` | Full form: title→heading, labels→caption, input→body, suggestion pills→caption/label |
| `components/HelpRequestModal.tsx` | Section headers→caption, title→heading, pill text→body, urgency buttons→body |
| `features/hub/RequestHelpModal.tsx` | Labels→caption, inputs→body(15)/padding13, submit text→body |
| `features/hub/KidModals.tsx` | title→heading, labels→caption, pill padding 12/8, sugg pills→caption |
| `features/quests/QuestsScreen.tsx` | Both form StyleSheets (dm + aq): label→caption, input→body, sugg pills→caption/label |
| `features/grocery/GroceryScreen.tsx` | AddItemSheet: consistent with above |

---

# FamilyCubeApp Grocery Architecture (2026-08-14)

## Overview
Full grocery management system for parents/partners with:
- Receipt scanning (camera/photos → AI extraction → DB storage)
- Smart staples learning (3+ purchases auto-suggests as restock item)
- Real-time partner presence (Supabase Realtime)
- Budget tracking from completed runs
- Purchase history for predictive restocking
- Kroger API + AI pricing on-demand (delta-only, no re-fetch)

## DB Schema

### New Tables (migrations 20260814000002-005)

**`grocery_receipts`** — scanned receipts
```
id (uuid PK)
family_id (text FK)
run_id (uuid FK → grocery_runs)
store (text)
scanned_by (text FK → members)
receipt_date (date)
total (numeric 10,2)
image_url (text)
ai_raw_json (jsonb) — full Claude Vision API response
created_at (timestamptz)
```

**`grocery_receipt_items`** — line items extracted from receipts
```
id (uuid PK)
receipt_id (uuid FK → grocery_receipts, CASCADE)
family_id (text FK)
name (text)
category (text) — auto-extracted by AI (produce, dairy, meat, etc)
quantity (numeric)
unit_price (numeric 10,2)
total_price (numeric 10,2)
brand (text)
added_to_list (boolean) — true if user added to current list
```

**`grocery_staples`** — learned staple items
```
id (uuid PK)
family_id (text FK)
name (text)
category (text)
avg_days_between (numeric) — computed from receipt dates
last_bought_at (timestamptz)
times_bought (integer)
auto_suggest (boolean) — if true, show in "Restock This?" banner
usual_store (text)
usual_brand (text)
UNIQUE(family_id, name)
```

**`grocery_price_cache`** — dedup-friendly price cache
```
id (uuid PK)
family_id (text FK)
item_name (text)
kroger_price (numeric 10,2) — from Kroger API
ai_estimate (numeric 10,2) — from Claude pricing prediction
source (text) — 'kroger' | 'ai_estimate'
unit (text) — 'each' | 'lb' | etc
fetched_at (timestamptz)
UNIQUE(family_id, item_name)
```

**`grocery_runs`** (existing, enhanced)
```
+ total_spent (numeric 10,2) — sum of items marked bought
```

## Edge Functions

### `parse-grocery-receipt` (new, replaces PawBond `parse-receipt`)

**Trigger:** User taps "📷 Scan Receipt" → camera/photo picker → calls function

**Input:**
```typescript
{
  familyId: string;
  scannedById: string;
  imageBase64: string; // JPEG/PNG
  store?: string;
}
```

**Process:**
1. Send image to Claude Vision API (models: `claude-3-5-sonnet-20241022` or later)
2. Extract:
   - Store name (if not provided)
   - Receipt date
   - Line items: name, quantity, unit price, total price
   - AI-guessed category per item
3. Insert `grocery_receipts` row with `ai_raw_json`
4. Insert `grocery_receipt_items` rows (one per line)
5. Call `grocery-ai-suggest` to update staples (async, via `rpc()`)

**Response:**
```typescript
{
  receiptId: uuid;
  itemCount: number;
  total: number;
  store: string;
  date: date;
  items: Array<{
    name: string;
    category: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
}
```

### `grocery-ai-suggest` (new)

**Trigger:** After receipt parsing, user completes a run, or cron daily

**Process:**
1. Count purchases by item name (last 90 days)
2. For items appearing 3+ times: insert/upsert `grocery_staples`
3. Compute `avg_days_between` from receipt dates
4. Mark `auto_suggest = true` for high-frequency items (e.g., every 7-10 days)
5. Update `last_bought_at` and `times_bought`

**Upsert key:** `UNIQUE(family_id, name)` — updates existing rows

## UI Changes

### GroceryScreen Tabs (restructured from 2 → 4)

1. **List** — editable items, prices, checkboxes
   - SmartRestockBanner (top) — "Milk: you buy every 10 days, last bought 12 days ago"
   - ReceiptScanButton (inline or FAB)
   - PriceCheckButton (per-item or batch)
   - Realtime presence badge (partner online status)

2. **Runs** — history of completed shopping trips
   - Summary: date, store, total, items
   - Receipt images (carousel)
   - Edit/delete

3. **History** — receipt timeline
   - Date, store, total
   - Expandable: line items with categories
   - Add to list button

4. **Insights** — analytics
   - Spending by category (pie/bar chart)
   - Staples trend (chart: "Milk $X/month")
   - Budget tracker (running spend, bar)
   - Restock predictions (table: item, days_until_reorder)

### Components (New)

**`ReceiptScanSheet`** — camera/file picker modal
```typescript
props: {
  visible: boolean;
  onClose: () => void;
  onSuccess: (receiptId, items) => void;
  familyId: string;
}
```
- Camera view with capture button
- Or file picker for existing photos
- Shows loading spinner during `parse-grocery-receipt` call
- Error Alert on failure
- Review screen: show extracted items, allow edit before confirm

**`SmartRestockBanner`** — predictive item card
```typescript
props: {
  item: GroceryStaple;
  daysUntilReorder: number;
  onAddToList: () => void;
}
```
- Shows: "🥛 Milk • Every 10 days • Last bought 12d ago"
- CTA: "Add to List"

**`PartnerStatusBar`** — live presence
```typescript
props: {
  familyId: string;
  currentRun?: GroceryRun;
}
```
- Realtime channel: `grocery:${familyId}`
- Shows: "👤 Alex is shopping at Costco"
- Uses member avatar + color

**`BudgetBar`** — spending summary
```typescript
props: {
  weeklyBudget?: number;
  currentWeekSpend: number;
  trend?: 'up' | 'down' | 'stable';
}
```
- Horizontal bar: filled % of budget
- "Spent: $X / $Y this week"
- Color: green (< 50%), yellow (50-80%), red (> 80%)

## Realtime Channels

**`grocery:${familyId}`** — presence + events
```typescript
// Presence: partner online status
channel.subscribe('presence', ({ event, key, newPresences, leftPresences }) => {
  if (event === 'sync' || 'join') {
    // Show "Alex is shopping" banner
  }
  if (event === 'leave') {
    // Clear banner
  }
});

// Broadcast: item price updated
channel.on('broadcast', { event: 'price_updated', payload: { itemName, price } }, () => {
  // Refetch prices, show toast
});
```

## Integrations

### Kroger API (Certification environment)

**Base URL:** `api-ce.kroger.com/v1`

**Flow (inside `features/grocery/GroceryScreen.tsx`):**
1. User taps "Check Prices" on items missing from `priceMap`
2. Delta-filter: `const toFetch = items.filter(i => !priceMap[i.name])`
3. Call `supabase.functions.invoke('kroger-price-check', { items: toFetch })`
4. Function returns `{ itemName, price, store }`
5. Insert/upsert `grocery_price_cache`
6. Merge: `setPriceMap(prev => ({ ...prev, ...newEntries }))`

**Note:** Never re-fetch items already in `priceMap` — cache hit avoids API calls

### Claude Vision (Receipt Parsing)

**Model:** `claude-3-5-sonnet-20241022` (or latest vision model)

**Prompt:**
```
Extract from this receipt:
1. Store name (if visible)
2. Date
3. Every line item: name, quantity, unit, unit price, total price
4. Categorize each item: produce/dairy/meat/snacks/beverages/frozen/household/other

Format response as JSON:
{
  "store": "Whole Foods",
  "date": "2026-08-14",
  "items": [
    { "name": "Milk 2%", "qty": 1, "unit": "1 gal", "unitPrice": 3.99, "totalPrice": 3.99, "category": "dairy" }
  ]
}
```

## Deployed Functions (Checklist)

```bash
supabase functions deploy parse-grocery-receipt
supabase functions deploy grocery-ai-suggest
```

## Grocery Feature Flags

In `lib/featureFlags.ts`:
```typescript
GROCERY_RECEIPT_SCAN: true   // Enables camera/scan UI
GROCERY_AI_SUGGESTIONS: true // Enables smart restock banner
GROCERY_PARTNER_PRESENCE: true // Enables real-time partner status
```

---

# FamilyCube — Grocery Feature Architecture

> Added: 2026-08-14. This section covers the full rearchitecture of the grocery system to make it 100% usable for parents/partners with real-time tracking, AI receipt reading, and smart suggestions.

## Current state (what exists)

| Feature | Status |
|---|---|
| List CRUD | ✅ Done |
| Shopping runs (draft/active/done) | ✅ Done |
| Realtime sync (items + runs) | ✅ Done |
| Kroger pricing (on-demand, delta only) | ✅ Done |
| AI suggestions (generic, no history) | ⚠️ Partial |
| Receipt scan | ❌ Missing (`parse-receipt` is PawBond pet parser — wrong domain) |
| Purchase history (DB) | ❌ No table |
| Staples / restock prediction | ❌ Not built |
| Budget / spend tracking | ❌ No spend data |
| Partner presence indicator | ⚠️ Items sync live; no "who's shopping now" indicator |
| Price cache (persisted to DB) | ⚠️ In-memory only — lost on reload |
| Insights / analytics tab | ❌ Not built |

## New DB tables — 4 migrations required

### 1. `grocery_receipts`
```sql
ALTER TABLE grocery_runs ADD COLUMN IF NOT EXISTS total_spent numeric(10,2);

CREATE TABLE grocery_receipts (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id    text NOT NULL,
  run_id       uuid REFERENCES grocery_runs(id),
  store        text,
  scanned_by   text REFERENCES members(id),
  receipt_date date,
  total        numeric(10,2),
  image_url    text,       -- optional; only if user consents to store
  ai_raw_json  jsonb,      -- full AI parse result
  created_at   timestamptz DEFAULT now()
);
```

### 2. `grocery_receipt_items`
```sql
CREATE TABLE grocery_receipt_items (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_id   uuid NOT NULL REFERENCES grocery_receipts(id) ON DELETE CASCADE,
  family_id    text NOT NULL,
  name         text NOT NULL,
  category     text,
  quantity     numeric,
  unit_price   numeric(10,2),
  total_price  numeric(10,2),
  brand        text,
  added_to_list boolean DEFAULT false  -- user confirmed adding back to list
);
```

### 3. `grocery_staples`
```sql
CREATE TABLE grocery_staples (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id          text NOT NULL,
  name               text NOT NULL,
  category           text,
  avg_days_between   numeric,     -- learned from receipt history
  last_bought_at     timestamptz,
  times_bought       integer DEFAULT 0,
  auto_suggest       boolean DEFAULT true,
  usual_store        text,
  usual_brand        text,
  UNIQUE(family_id, name)
);
```

### 4. `grocery_price_cache`
```sql
CREATE TABLE grocery_price_cache (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id     text NOT NULL,
  item_name     text NOT NULL,
  kroger_price  numeric(10,2),
  ai_estimate   numeric(10,2),
  source        text,   -- 'kroger' | 'estimate'
  unit          text,
  fetched_at    timestamptz DEFAULT now(),
  UNIQUE(family_id, item_name)
);
```

Migration files: `supabase/migration_grocery_receipts.sql`, `supabase/migration_grocery_staples.sql`, `supabase/migration_grocery_price_cache.sql`

## New edge functions

### `parse-grocery-receipt` (NEW)
- POST `{ image_base64, familyId, memberId, runId? }`
- Gemini 2.5 Flash Vision reads receipt → extracts items (name, qty, unit_price, category, brand), store, date, total
- Saves to `grocery_receipts` + `grocery_receipt_items`
- Upserts `grocery_staples`: increments `times_bought`, updates `last_bought_at`, recalculates `avg_days_between`
- Falls back to DeepSeek Vision if Gemini fails
- Replaces the current `parse-receipt` function which is PawBond pet-specific

### `grocery-ai-suggest` (NEW)
- POST `{ familyId, currentList: string[], context?: string }`
- Loads last 90 days of `grocery_receipt_items` + `grocery_staples`
- Returns ranked suggestions with human-readable reasons:
  - "Milk — last bought 12 days ago, you usually buy every 8 days"
  - "Eggs — appears in 9 of your last 12 receipts"
- Skips items already on the current list

### Staple learning rule
- 1st time seen in a receipt → insert with `times_bought = 1`
- 3+ times across receipts → `auto_suggest = true` (becomes a tracked staple)
- `avg_days_between` = rolling average of gaps between purchase dates

## `groceryStore.ts` changes

**New state:** `receipts`, `staples`, `priceCache: Record<string, PriceCacheEntry>`, `partnerPresence: PartnerPresence[]`, `weeklySpend`, `monthlySpend`

**New actions:** `saveReceipt(receipt, items)`, `loadReceipts(familyId)`, `loadStaples(familyId)`, `loadPriceCache(familyId)`, `upsertPriceCache(entries)`, `broadcastPresence(memberId, status, runId?)`

**New realtime channels:**
- `grocery:presence:{familyId}` — Supabase Presence (partner live shopping status; ephemeral, no DB writes)
- `grocery_receipts:{familyId}` — DB changes for new receipts

**Modified `load()`:** also loads price cache + staples from DB on init; computes `weeklySpend` from completed runs.

## `GroceryScreen.tsx` — 4 tabs (currently 2)

| Tab | Content | New components |
|---|---|---|
| **List** | Smart Restock Banner · Category sections · Prices · AI suggestions | `SmartRestockBanner`, `BudgetBar` |
| **Runs** | Active run with partner check-off status · Past runs with totals | `PartnerCheckoffRow` |
| **History** | Past receipts · Line items · Add missed items back to list | `ReceiptCard`, `ReceiptDetailSheet` |
| **Insights** | Weekly/monthly spend · Top categories · Frequent items · Spend by store | `SpendChart`, `TopItemsList` |

**Always-visible `PartnerStatusBar`** sits above tabs. Uses Supabase Presence. Shows "Alex is shopping at Costco — 12 items checked off" with a live pulse dot. Hidden if nobody is actively shopping.

## Receipt scanner flow

1. User taps 📷 FAB or camera icon inside Run Detail Sheet
2. Camera/photo library → base64 sent to `parse-grocery-receipt`
3. Gemini Vision extracts line items, prices, store name, date, total
4. Review sheet: user confirms/edits items, removes non-grocery entries
5. Saved to DB → staples updated → prices cached → run total updated
6. Receipt image is NOT stored unless user explicitly enables it

## Build order

| # | Task | Effort |
|---|---|---|
| 1 | Run 4 DB migrations | XS |
| 2 | Persist price cache to DB in kroger-prices fn + load on store init | S |
| 3 | `parse-grocery-receipt` edge function (Gemini Vision) | M |
| 4 | `ReceiptScanSheet` component (camera → review → save) | M |
| 5 | Partner Presence channel + `PartnerStatusBar` UI | S |
| 6 | `grocery-ai-suggest` edge function | M |
| 7 | `SmartRestockBanner` + history-aware AI panel | M |
| 8 | History tab (receipt list + `ReceiptDetailSheet`) | S |
| 9 | Insights tab (spend charts, top items, store breakdown) | M |
| 10 | `BudgetBar` on List tab (weekly spend vs estimate) | S |
