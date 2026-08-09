# Petkoinia — In-App Purchase & Subscription Setup

## What's already done
- [x] DB migration run (subscriptions + subscription_usage tables, RPCs, RLS)
- [x] Edge functions deployed: `vet-chat`, `symptom-scan`, `revenuecat-webhook`
- [x] GEMINI_API_KEY set in Supabase Edge Function secrets

---

## Remaining manual steps

### 1. RevenueCat — Create products in app stores

**App Store Connect (iOS)**
1. Go to https://appstoreconnect.apple.com → your app → Subscriptions
2. Create a Subscription Group (e.g. "Petkoinia Premium")
3. Add two subscription products:
   - `petkoinia_pro_monthly` — $3.99/month
   - `petkoinia_pro_yearly` — $24.99/year
   - `petkoinia_ultimate_monthly` — $6.99/month
4. Set display names, descriptions, and submit for review

**Google Play Console (Android)**
1. Go to https://play.google.com/console → your app → Monetize → Subscriptions
2. Create the same products with matching IDs:
   - `petkoinia_pro_monthly`
   - `petkoinia_pro_yearly`
   - `petkoinia_ultimate_monthly`

---

### 2. RevenueCat dashboard setup

1. Go to https://app.revenuecat.com
test_UeNCBEOuhrUmerAEPdRtRIroxJa
2. Create a new project → add iOS and Android apps
3. Under **Products**, add all product IDs from Step 1
4. Under **Entitlements**, create:
   - `pro` — attach `petkoinia_pro_monthly` and `petkoinia_pro_yearly`
   - `ultimate` — attach `petkoinia_ultimate_monthly`
5. Under **Offerings**, create a default offering with the packages
6. Under **Integrations → Webhooks**, add:
   - URL: `https://plxkecboykmukotmixqx.supabase.co/functions/v1/revenuecat-webhook`
   - Select events: INITIAL_PURCHASE, RENEWAL, EXPIRATION, CANCELLATION
7. Copy your **API Keys**:
   - iOS Public SDK key (starts with `appl_`)
   - Android Public SDK key (starts with `goog_`)

---

### 3. Set RevenueCat API keys in the app

Open `lib/subscription.ts` and replace the placeholder values:

```ts
export const RC_API_KEY_IOS     = 'appl_YOUR_ACTUAL_IOS_KEY';
export const RC_API_KEY_ANDROID = 'goog_YOUR_ACTUAL_ANDROID_KEY';
```

Platform    App    Public SDK API Key
🍎 iOS (App Store)    Petkoinia iOS    appl_KedAuwgQmBWVecipHRkYWwSdEkE
🤖 Android (Play Store)    Petkoinia Android    goog_QjbacBLwGavHxtwyUJXeXxrLRhw

---

### 4. Supabase — set RevenueCat webhook secret (optional but recommended)

To verify webhook authenticity:
1. In RevenueCat dashboard → Webhooks → copy the Authorization header secret
2. In Supabase Dashboard → Edge Functions → `revenuecat-webhook` → Secrets
3. Add: `REVENUECAT_WEBHOOK_SECRET` = the secret value
4. Update `supabase/functions/revenuecat-webhook/index.ts` to verify the header

---

### 5. Test the full flow (before App Store submission)

1. In RevenueCat dashboard, enable Sandbox mode
2. On a real iOS device, sign in with a Sandbox Apple ID
3. Go to the Plans screen in the app → tap Subscribe → complete sandbox purchase
4. Verify in Supabase → Table Editor → `subscriptions` table that a row was created with `tier = 'pro'`
5. Test the gate: try adding a second pet (free tier blocks it), then upgrade and confirm it unlocks

---

## Tier limits reference

| Feature | Free | Pro | Ultimate |
|---|---|---|---|
| Pets | 1 | 5 | 5 |
| Mood scans/day | 4 | 10 | 10 |
| Health records/month | 3 | Unlimited | Unlimited |
| Feed posts/month | 5 | Unlimited | Unlimited |
| Playdates/month | 2 | Unlimited | Unlimited |
| PetDoc chat/day | 0 | 0 | 50 |
| Symptom scans/day | 0 | 0 | 3 |

---

## Pricing

| Plan | Monthly | Annual |
|---|---|---|
| Pro | $3.99/mo | $24.99/yr |
| Ultimate | $6.99/mo | — |

---

## Architecture notes

- **`store/subscriptionStore.ts`** — Zustand store; call `loadSubscription(userId)` on login
- **`lib/hooks/usePaywall.ts`** — `gate(feature)` checks tier + usage; `consume(feature)` increments
- **`lib/subscription.ts`** — LIMITS map and RC API key constants
- **`app/subscription/plans.tsx`** — Paywall UI screen
- **Webhook flow:** RevenueCat → `revenuecat-webhook` edge function → upserts `subscriptions` table → app reads updated tier on next `loadSubscription` call
