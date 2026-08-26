# Family Cube

A comprehensive React Native pet care platform for iOS and Android, built with Expo, Supabase, and RevenueCat. Manage pet health, memories, playdates, social connections, and AI-powered insights in one unified app.

**Current Version:** 1.0.0  
**Build:** 58 (iOS)  
**Architecture:** Fully modularized feature-driven architecture  
**TypeScript:** 0 errors (`npx tsc --noEmit`)

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ (verified with `node -v`)
- **npm** 9+ (included with Node)
- **Xcode** 16+ (for iOS development/testing)
- **CocoaPods** (comes with Xcode; verify: `pod --version`)
- **Git**
- **Expo CLI** (`npm install -g expo-cli`)

### Installation

```bash
# Clone repository
git clone <repo-url>
cd FamilyCubeApp

# Install dependencies
npm install

# Install iOS pods (required for native modules)
cd ios && pod install && cd ..

# Create .env from template
cp .env.example .env

# Edit .env with your credentials (see Configuration below)
```

### Development Server

```bash
# Start Metro bundler
npm start

# Then in the Expo CLI menu:
# - Press 'i' to open in iOS Simulator
# - Press 'd' to open in Android emulator
# - Press 'w' to open in web browser
# - Scan QR code with Expo Go app (physical device)
```

### Run on Physical Device (Recommended for Full Features)

```bash
# iOS device (requires native build, not Expo Go)
npm run ios -- --device

# Android device
npm run android -- --device

# Time to first compile: 5–10 minutes
# Subsequent hot reloads: < 1 second
```

---

## ⚙️ Configuration

### Environment Variables

Create `.env` in the project root:

```bash
# Supabase (database + auth + realtime)
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...

# RevenueCat (subscriptions)
# iOS
EXPO_PUBLIC_RC_API_KEY_IOS=appl_dHLbADUD...
# Android
EXPO_PUBLIC_RC_API_KEY_ANDROID=goog_SekCAVk...

# Google Sign-In
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# OpenAI (PetDoc AI chat)
EXPO_PUBLIC_OPENAI_API_KEY=sk-...

# Optional: Feature flags
EXPO_PUBLIC_LOG_LEVEL=warn  # debug, warn, error
```

All keys prefixed with `EXPO_PUBLIC_` are embedded in the client bundle (safe for public keys only).

### App Configuration

Edit `app.config.js` for:
- Bundle ID / package name
- App name and splash screen
- Deep linking schemes
- Permissions
- Plugins

Critical settings:
- `usesAppleSignIn: true` — required for App Store submission
- `icon`, `splash` — must match app branding
- `scheme: "familycube"` — deep linking prefix

---

## 📁 Project Structure

```
FamilyCubeApp/
├── app/                              ← Expo Router (thin shells only)
│   ├── (auth)/                       ← Auth routes (login, signup, lock)
│   ├── (tabs)/                       ← Bottom tab navigation
│   ├── admin/                        ← Admin panel (not in feature/ yet)
│   ├── _layout.tsx                   ← Root layout + providers
│   └── splash.tsx                    ← Splash screen handler
│
├── features/                         ← ALL business logic lives here
│   ├── ai/                           ← Mood camera, symptom scan, vet chat
│   ├── auth/                         ← Login, signup, biometrics, Apple sign-in
│   ├── care/                         ← Daily care log (journal/quick log)
│   ├── health/                       ← Records, vaccines, meds, appointments, expenses, insurance
│   ├── home/                         ← Home feed + today dashboard
│   ├── memories/                     ← Photo timeline, AI video gen, pet milestones
│   ├── nearby/                       ← Nearby pet discovery, vet clinics
│   ├── onboarding/                   ← Welcome flow, pet creation, consent
│   ├── pet/                          ← Pet profile, details, edit, followers, timeline
│   ├── playdates/                    ← Playdate scheduling, chat, history (decomposed)
│   ├── profile/                      ← User profile, settings, notifications, privacy
│   ├── social/                       ← Posts, events, notifications, comments (decomposed)
│   └── sos/                          ← Emergency contacts, quick help
│
├── shared/                           ← Cross-feature utilities
│   ├── components/                   ← Atoms/molecules (UI kit)
│   ├── hooks/                        ← Shared hooks (usePaywall, useTheme, etc.)
│   ├── services/                     ← Supabase client, notifications, realtime
│   ├── store/                        ← Zustand state slices (split from monolith)
│   └── types/                        ← Shared TypeScript types
│
├── components/                       ← Legacy shared components (being migrated)
├── lib/                              ← Legacy utilities, db queries, services
├── constants/                        ← Theme, colors, layout constants
├── assets/                           ← Icons, images, splash screens, fonts
│
├── ARCHITECTURE.md                   ← Full architecture blueprint
├── DEVELOPER_GUIDE.md                ← Detailed development guide
├── app.config.js                     ← Expo configuration
├── tsconfig.json                     ← TypeScript config (@/ alias points to .)
├── eas.json                          ← EAS build config (profiles + secrets)
├── package.json                      ← Dependencies + scripts
└── babel.config.js                   ← Babel setup for JSX transform
```

### The Architecture Rule

**Every `app/` file is a 1-line re-export:**

```typescript
// app/(tabs)/health.tsx
export { default } from '@/features/health/screens/HealthScreen';
```

All logic lives in `features/`. Expo Router handles routing only.

---

## 🎨 Feature Overview

| Feature | Screens | Key Tech | Status |
|---------|---------|----------|--------|
| **Health** | Records, vaccines, meds, appointments, expenses, insurance | Realtime DB, PDF export, receipt scanning | ✅ Production |
| **Memories** | Timeline, video generation, milestones, photo gallery | ML Kit OCR, Expo Video, Ken Burns effect | ✅ Production |
| **Social** | Posts, events, comments, notifications | Realtime subscriptions, push notifications | ✅ Production |
| **AI** | Mood camera, symptom scanner, vet chat | OpenAI API, text recognition, photo analysis | ✅ Production |
| **Playdates** | Scheduling, chat, history, attendee management | Realtime chat, proposal flow, messaging | ✅ Decomposed |
| **Care** | Daily quick log, journal entries, mood tracking | Form state, calendar views, filters | ✅ Production |
| **Pet** | Profile, details, edit, followers, timeline | QR code sharing, follower list, timeline | ✅ Production |
| **Auth** | Email/password, biometric lock, Google, Apple, Supabase recovery | Face ID, local auth, session persistence | ✅ Apple sign-in added |
| **Profile** | User settings, pet management, privacy, notifications | Zustand slices, permission system | ✅ Production |
| **Onboarding** | Welcome flow, pet creation, consent, handle picker | Multi-step form, async validation | ✅ Production |
| **Nearby** | Pet discovery, vet clinic finder | Geolocation, Maps integration | ✅ Production |
| **SOS** | Emergency contacts, quick help | Phone/SMS integration | ✅ Production |

---

## 📦 Tech Stack

| Layer | Tech | Version | Purpose |
|-------|------|---------|---------|
| **App Framework** | Expo | ~54.0.0 | React Native + EAS builds |
| **Router** | Expo Router | ~6.0.24 | File-based routing, deep linking |
| **UI Framework** | React Native | 0.81.5 | Cross-platform UI |
| **State Management** | Zustand | ^5.0.3 | Split into feature slices (no monolith) |
| **Backend** | Supabase | ^2.108.2 | PostgreSQL + Auth + Realtime + Storage |
| **Database** | PostgreSQL | (via Supabase) | Fully relational schema |
| **Auth Providers** | Google, Apple | expo-* modules | Social login + biometric |
| **Subscriptions** | RevenueCat | ^10.4.4 | IAP, entitlements, paywall |
| **Notifications** | Expo Notifications | ~0.32.17 | Push + local + dedup by 24h |
| **Analytics** | None yet | — | Ready for Mixpanel/Amplitude |
| **Language** | TypeScript | ~5.9.2 | Full type safety, 0 errors |
| **Testing** | None yet | — | Ready for Jest + Detox |

---

## 🛠️ Development Scripts

```bash
# Start development server
npm start

# Run on iOS Simulator / device
npm run ios
npm run ios -- --device

# Run on Android Emulator / device
npm run android
npm run android -- --device

# Run on web
npm run web

# Type check (must pass before commit)
npx tsc --noEmit

# Lint code
npm run lint

# Build debug APK (Android)
npm run android -- --configuration debug

# Build production iOS build locally (requires signing)
# (Use EAS for production builds instead)
```

---

## 🚢 Deployment

### Local Development Build (On-Device Testing)

```bash
# iOS — builds locally, installs on physical device via Xcode
npm run ios -- --device

# Includes all native modules (expo-apple-authentication, etc.)
# Perfect for testing StoreKit, Face ID, notifications
```

### Production Builds (EAS)

#### Prerequisites
- Expo account: `npx eas login`
- Apple Developer account (paid)
- Android signing key (if releasing to Android)
- EAS credits (free tier: 60 minutes / month)

#### iOS Submission Flow

```bash
# 1. Build for App Store / TestFlight
npx eas build --platform ios --profile preview

# 2. Upload to App Store Connect
# (EAS prompts to submit automatically after build)

# 3. Apple review (24–48 hours typically)

# 4. Release to App Store
# (In App Store Connect, click "Release this version")
```

#### Android Submission Flow

```bash
# 1. Build for Google Play
npx eas build --platform android --profile release

# 2. Upload to Google Play Console
# (Requires signing key — auto-generated on first EAS build)

# 3. Google review (24 hours typically)
```

#### Build Profiles (`eas.json`)

```json
{
  "build": {
    "preview": {
      "ios": { "simulator": false },
      "env": { "EAS_BUILD": "true" }
    },
    "production": {
      "autoIncrement": true,
      "env": { "EAS_BUILD": "true", "NODE_ENV": "production" }
    }
  }
}
```

#### Free Tier Limits

- **60 minutes/month** of build time
- Resets on the 1st of each month UTC
- Current limit reset: **Aug 1, 2026**
- Overage: $0.15 per additional minute

---

## 🐛 Debugging

### Metro Bundler Issues

```bash
# Clear cache and restart
npm start -- --clear

# If stuck on "Waiting for tunnel connection":
npx expo-cli@latest

# If modules not found:
npm install
cd ios && pod install && cd ..
npm start
```

### TypeScript Errors

```bash
# Check all files (run before commit)
npx tsc --noEmit

# Check specific file
npx tsc --noEmit features/health/screens/HealthScreen.tsx

# Restart TypeScript server in editor if errors persist
```

### Supabase Connection Issues

```bash
# Verify credentials in .env
cat .env | grep SUPABASE

# Test connection in browser
curl -H "Authorization: Bearer YOUR_ANON_KEY" \
  https://YOUR_PROJECT.supabase.co/rest/v1/pets?limit=1
```

### Push Notifications Not Working

- **iOS**: Requires development provisioning profile (not Simulator)
- **Android**: Requires Google Play Services
- Check `shared/services/notifications.service.ts` for dedup logic
- Quiet hours suppress push only; in-app alerts always show

### Biometric / Face ID Not Appearing

- Requires native dev build (`npm run ios -- --device`), not Expo Go
- Check `expo-local-authentication` in capabilities
- Test: Settings → Biometric → Enable

### Apple Sign-In Button Not Showing

- **Expo Go**: `AppleAuthentication.isAvailableAsync()` returns false → button hidden
- **Native build**: Appears correctly (module available)
- **Fallback**: Google sign-in always available

### StoreKit Transactions Failing

- **iOS 26 beta bug**: `storefront: nil` in RevenueCat
- **Workaround**: Use Simulator for testing, wait for stable iOS
- **Dev fallback**: `lib/subscription.ts` has mock offerings for `__DEV__`
- **Real testing**: TestFlight only (not Simulator)

---

## 📋 App Store Submission Checklist

### Current Status
- ✅ Guideline 4.8: Sign in with Apple — **FIXED** (added to login + signup)
- ❌ Guideline 2.1(b): IAP completeness — **PENDING** (test flow on TestFlight after Aug 1 EAS build)
- ❌ Guideline 2.3.10: Screenshots — **PENDING** (replace with iOS-native 1440×2560 screenshots)

### Before Submitting
- [ ] Update app version in `app.config.js` (`version` + `ios.buildNumber`)
- [ ] Update screenshots (2–5, in English, no third-party graphics)
- [ ] Write concise app description (<170 chars)
- [ ] Write release notes for this version (50+ chars)
- [ ] Ensure all permissions are declared in `app.config.js`
- [ ] Test on real device: login, purchase, notifications, biometric
- [ ] Run `npx tsc --noEmit` — must pass
- [ ] Test in Simulator and on device before building
- [ ] Build via EAS: `eas build --platform ios`

### After Submission
- Apple reviews → 24–48 hours
- Fix any rejections → resubmit (no limit on submissions)
- Once approved, release via App Store Connect

---

## 🔐 Security & Privacy

### Sensitive Data

- **API Keys**: All `EXPO_PUBLIC_*` are embedded in bundle (public keys only)
- **User Data**: Stored in Supabase PostgreSQL (encrypted at rest)
- **Session Tokens**: Stored in secure storage via `expo-secure-store`
- **Biometric Fallback**: `exp_secure_auth_token` is the session backup
- **Notifications**: Deduped in DB, optionally suppressed in quiet hours

### Permissions

Required (declared in `app.config.js`):
- **Camera**: Mood photos, receipt scanning, pet photos
- **Photo Library**: Timeline, post media
- **Biometric**: Face ID login
- **Location**: Nearby vet clinics, playdate discovery
- **Contacts**: Emergency SOS
- **Calendar**: Vet appointment sync
- **Health**: (iOS) Pedometer for pet activity (prep)
- **Microphone**: (future) Voice memo support

### Data Residency

- Supabase: **AWS US-East** (default)
- RevenueCat: **AWS multi-region**
- Custom backups: None yet (ready for Supabase native backup)

---

## 🧪 Testing

### Manual Testing Checklist

```markdown
## Login & Auth
- [ ] Email/password login works
- [ ] Google sign-in works
- [ ] Apple sign-in works (native build only)
- [ ] Biometric login appears + works (native build)
- [ ] Forgot password flow works
- [ ] Session persists after app restart

## Pet Management
- [ ] Create pet (all fields)
- [ ] Edit pet info
- [ ] Upload pet photo
- [ ] View pet profile
- [ ] Share pet (QR code)

## Health Tracking
- [ ] Log weight entry
- [ ] Add health record (type picker)
- [ ] View expense history (6-month trend)
- [ ] Add appointment
- [ ] Upload vaccine doc

## Social
- [ ] Create post (text + photo)
- [ ] Like/comment on post
- [ ] Create event
- [ ] RSVP to event
- [ ] Send playdate proposal
- [ ] Chat in playdate

## Notifications
- [ ] Push notification arrives
- [ ] In-app alert shows (always)
- [ ] Quiet hours suppress push (not in-app)
- [ ] Read state persists

## Subscription
- [ ] View paywall
- [ ] Restore purchases works
- [ ] Trial period shows
- [ ] Entitlements sync after purchase
```

---

## 💳 Subscriptions & Feature Limits

Family Cube uses a **freemium model** with three tiers: **Free**, **Pro**, and **Ultimate**. All tiers include core family management; premium tiers unlock advanced AI, analytics, and social features.

### Subscription Tiers

| Feature | Free | Pro | Ultimate |
|---------|------|-----|----------|
| **Price** | Free | $9.99/mo or $79.99/yr | $14.99/mo or $119.99/yr |
| **Trial** | 7 days | 7 days | 7 days |
| **Billing** | N/A | Auto-renew | Auto-renew |

### Feature Limits by Tier

#### Pet Management
| Limit | Free | Pro | Ultimate |
|-------|------|-----|----------|
| Max pets | 1 | 5 | 5 |
| Family sharing | ❌ | ✅ | ✅ |
| Pet profile editing | ✅ | ✅ | ✅ |

#### AI & Scans
| Limit | Free | Pro | Ultimate |
|-------|------|-----|----------|
| **Mood scans/day** | 4 | 10 | 10 |
| **Real AI scans/day** | 2 | 10 | 10 |
| **Symptom scanner/day** | ❌ (0) | ❌ (0) | ✅ (3) |
| **PetDoc AI chat/day** | ❌ (0) | ❌ (0) | ✅ (50 msg) |

#### Health Tracking
| Limit | Free | Pro | Ultimate |
|-------|------|-----|----------|
| Health records/month | 3 | Unlimited | Unlimited |
| Vet appointments | ✅ | ✅ | ✅ |
| Medications log | ✅ | ✅ | ✅ |
| Vaccines | ✅ | ✅ | ✅ |
| Insurance docs | ✅ | ✅ | ✅ |
| Expense tracking | ✅ | ✅ | ✅ |

#### Social & Feed
| Limit | Free | Pro | Ultimate |
|-------|------|-----|----------|
| Feed posts/month | 5 | Unlimited | Unlimited |
| Video posts/month | ❌ (0) | Unlimited | Unlimited |
| Comments | ✅ | ✅ | ✅ |
| Likes | ✅ | ✅ | ✅ |
| Stories | ✅ | ✅ | ✅ |

#### Playdates & Events
| Limit | Free | Pro | Ultimate |
|-------|------|-----|----------|
| Playdates/month | 2 | Unlimited | Unlimited |
| Event creation | ✅ | ✅ | ✅ |
| RSVP/attend | ✅ | ✅ | ✅ |
| Chat in events | ✅ | ✅ | ✅ |

#### History & Discovery
| Limit | Free | Pro | Ultimate |
|-------|------|-----|----------|
| **History view** | 14 days | Unlimited | Unlimited |
| Timeline memories | ✅ | ✅ | ✅ |
| Video generation | ✅ | ✅ | ✅ |
| Nearby pet discovery | ✅ | ✅ | ✅ |
| Nearby vet finder | ✅ | ✅ | ✅ |

### Product IDs (RevenueCat)

```typescript
// In lib/subscription.ts
export const PRODUCT_IDS = {
  pro_monthly:       'pb_pro_monthly',      // $9.99/month
  pro_annual:        'pb_pro_annual',       // $79.99/year
  ultimate_monthly:  'pb_ultimate_monthly', // $14.99/month
  ultimate_annual:   'pb_ultimate_annual',  // $119.99/year
};

export const ENTITLEMENTS = {
  pro:      'pro',
  ultimate: 'ultimate',
};
```

### Checking Subscription Status (Code Examples)

#### Check if feature is accessible
```typescript
import { canAccess, getLimit } from '@/lib/subscription';
import { useSubscriptionStore } from '@/store/subscriptionStore';

const tier = useSubscriptionStore(state => state.tier); // 'free' | 'pro' | 'ultimate'

if (canAccess(tier, 'vetChatPerDay')) {
  // Show PetDoc AI chat button
}
```

#### Check usage and remaining quota
```typescript
import { checkUsage } from '@/lib/subscription';

const { allowed, current } = await checkUsage(userId, tier, 'moodScansPerDay');
if (!allowed) {
  showAlert('Limit reached', 'You've used 4 mood scans today. Upgrade to Pro for unlimited.');
}
```

#### Show paywall for locked features
```typescript
import { showUpgradeAlert } from '@/lib/subscription';

// Trigger paywall sheet
showUpgradeAlert({
  title: 'Unlock AI Chat',
  message: 'PetDoc AI is only available with Ultimate.',
  requiredTier: 'ultimate',
  perks: ['24/7 PetDoc AI', '3 symptom scans/day', 'Family sharing'],
});
```

### Paywall Implementation

The **PaywallSheet** component (`features/health/components/PaywallModal.tsx`) displays:

```typescript
<PaywallModal
  visible={showPaywall}
  onClose={() => setShowPaywall(false)}
  accent={accent}
  colors={colors}
/>
```

It shows:
- ✅ Current tier status
- 📦 All tiers side-by-side with pricing
- ⏱️ Trial period (7 days)
- 📋 Feature comparison (what's included in each tier)
- ▶️ "Subscribe" or "Restore Purchases" buttons
- 🔓 "Already purchased? Restore" link

### Usage Tracking

Usage is tracked in the `subscription_usage` table:

```sql
-- Current day's usage
SELECT mood_scans_today, ai_scans_today, feed_posts_month, 
       vet_chat_today, symptom_scans_today 
FROM subscription_usage 
WHERE user_id = $1;
```

Reset schedule:
- **Daily counters** (mood_scans_today, ai_scans_today, vet_chat_today): Reset at 12 AM UTC
- **Monthly counters** (feed_posts_month, health_records_month, playdates_month): Reset on 1st of month UTC

### RevenueCat Configuration

RevenueCat handles:
- **Entitlements**: Maps product purchases to feature access
- **Offerings**: Paywall presentation (products grouped by tier)
- **Restore**: User can restore past purchases
- **Trial tracking**: 7-day free trial for all products
- **Subscription management**: Renewal, cancellation, billing

#### Environment Variables
```bash
# iOS
EXPO_PUBLIC_RC_API_KEY_IOS=appl_dHLbADUD...

# Android
EXPO_PUBLIC_RC_API_KEY_ANDROID=goog_SekCAVk...
```

#### Development Testing

**Mock offerings** (fallback in `__DEV__`):
```typescript
// lib/subscription.ts — DEV_MOCK_OFFERING
// When RevenueCat fails or in Expo Go, shows mock pricing for UI testing
```

**Real testing** (TestFlight/Play Console):
1. Use TestFlight/Play Console account
2. RevenueCat connects to real App Store Connect products
3. Transactions are in sandbox (not real charges)
4. No expiration on sandbox purchases (renew indefinitely)

### Onboarding & Trial

When user signs up:
1. Immediately enrolled in 7-day free trial (Pro tier)
2. Can try all Pro features for 7 days
3. On day 8, downgrades to Free (unless converted to paid)
4. Reminder notification on day 6 ("Your trial ends in 2 days")

### Revenue & Pricing Strategy

- **Free tier**: 1 pet, limited scans, 14-day history (engages users, drives adoption)
- **Pro tier**: 5 pets, 10 scans/day, unlimited feed, family sharing ($9.99/mo or $79.99/yr)
- **Ultimate tier**: All Pro + PetDoc AI (50 msg/day) + symptom scanner ($14.99/mo or $119.99/yr)

**Upsell triggers:**
- Hit usage limit → paywall appears
- Share pet → encourage family upgrade
- Use PetDoc AI → suggest Ultimate

**Retention strategy:**
- 7-day free trial (convert ~30% historically)
- Annual plans: 2-month discount incentive
- No ads in any tier (clean UX)
- Family sharing (Ultimate) → multi-person value

---

### Automated Testing

Currently **not set up**. Ready for:
- **Jest** unit tests
- **Detox** E2E tests (requires native build)
- **React Testing Library** component tests

Priority areas:
- Auth flow (biometric, session)
- Subscription entitlements
- Realtime notifications
- Zustand store slices

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| `ARCHITECTURE.md` | Feature structure, folder anatomy, state management |
| `DEVELOPER_GUIDE.md` | Detailed walkthrough of key features, APIs, patterns |
| `BILLING_AND_AI_SYSTEMS.md` | Revenue model, AI credits, RefreshAI integration |
| `UX_DESIGN_SPECIFICATION.md` | Visual design, animations, dark mode |
| `PLAYDATES_FEATURE_SPEC.md` | Playdate scheduling, proposal flow, contract |

---

## 🐛 Known Issues & Blockers

| Issue | Workaround | Status |
|-------|-----------|--------|
| **iOS 26 beta: RevenueCat `storefront: nil`** | Use Simulator or wait for stable iOS | ⏳ Blocked |
| **EAS free tier exhausted (Aug 1 reset)** | Wait for reset or purchase credits | ⏳ Pending |
| **App Store rejections (4.8, 2.1b, 2.3.10)** | Implementing fixes, resubmit after Aug 1 build | ⏳ In progress |
| **Notifications not showing in Simulator** | Test on physical device only | ⏳ Expected |
| **Realtime chat lag on slow network** | Will add message queue in future | ⏳ Backlog |

---

## 🤝 Contributing

### Branch Workflow

```bash
# Feature branch off main
git checkout -b feat/feature-name

# Work locally, test thoroughly
npm start
npx tsc --noEmit  # Pass before commit

# Commit with conventional message
git commit -m "feat: add feature description"
# or
git commit -m "fix: resolve bug description"
# or
git commit -m "refactor: improve code structure"

# Push and create PR on GitHub
git push -u origin feat/feature-name
```

### Code Style

- **TypeScript**: No `any` except in JSX `as any` for React.memo type quirks
- **Naming**: camelCase for files/functions, PascalCase for components
- **Imports**: Use `@/` aliases (mapped in `tsconfig.json`)
- **Exports**: Default export for screens, named export for utilities
- **Comments**: Only when WHY is non-obvious, never WHAT
- **Props**: Use destructuring + type annotations
- **Hooks**: Extract to custom hooks if 50+ lines
- **Components**: Use `React.memo` for all extracted components
- **State**: Use Zustand slices (never monolith), colocate in `shared/store/slices/`

### File Naming

```
Screens: PascalCase + "Screen" suffix
  ✅ features/health/screens/HealthScreen.tsx
  ✅ features/health/screens/WeightsScreen.tsx

Components: PascalCase, no suffix
  ✅ features/health/components/WeightWidget.tsx
  ✅ features/social/components/PostCard.tsx

Utils: camelCase.ts
  ✅ features/memories/utils.ts
  ✅ lib/biometrics.ts

Styles: camelCase + "Styles" suffix (if standalone)
  ✅ features/health/components/healthStyles.ts

Types: PascalCase.ts or inline in file
  ✅ features/social/types.ts
  ✅ features/playdates/components/playdateDetailTypes.ts
```

### Commit Message Format

```
feat: add Apple sign-in to login + signup screens
fix: hide Apple button in Expo Go via isAvailableAsync()
refactor: split PlaydateDetailScreen into 8 components
chore: update dependencies
docs: add README for developers
test: add Jest suite for auth flow
```

---

## 🚑 Troubleshooting

### App Won't Start

```bash
# 1. Clear all caches
npm start -- --clear

# 2. Reinstall modules
rm -rf node_modules package-lock.json
npm install

# 3. Reinstall pods
cd ios && rm -rf Pods Podfile.lock && pod install && cd ..

# 4. Restart Xcode and metro
npm start
```

### "Module not found: @/features/..."

- Ensure `tsconfig.json` has `"paths": { "@/*": ["./*"] }`
- Verify file exists at that path
- Restart TypeScript server in editor
- `npm start -- --clear`

### "Unimplemented component: ViewManagerAdapter_ExpoAppleAuthentication"

- You're in **Expo Go** — needs native dev build
- Run: `npm run ios -- --device` on physical iPhone
- Check `isAvailableAsync()` guard is in place (should be)

### Biometric Not Working

- **Simulator**: Doesn't support Face ID/Touch ID
- **Physical device**: Requires native build (`npm run ios -- --device`)
- **Fallback**: Email/password or Google sign-in always available

### Notifications Not Arriving

- **Simulator**: Doesn't receive push (notification disabled)
- **Physical device**: Check quiet hours aren't active
- **Android**: Ensure Google Play Services installed
- **iOS**: Ensure notification permission granted in Settings
- Check `shared/services/notifications.service.ts` for dedup (24h per event)

### "Cannot find module '@supabase/supabase-js'"

```bash
npm install @supabase/supabase-js@latest
npm start -- --clear
```

### Dark Mode Not Toggling

- Verify `useTheme()` hook imported from `@/lib/ThemeContext`
- Check `app.config.js` has `userInterfaceStyle: "automatic"`
- Test in Settings → Display & Brightness → Dark Mode
- App should sync automatically (no user toggle added yet)

---

## 📞 Support & Resources

### Quick Links

- **Supabase Docs**: https://supabase.com/docs
- **Expo Docs**: https://docs.expo.dev/versions/v54.0.0/
- **React Native**: https://reactnative.dev
- **Zustand**: https://github.com/pmndrs/zustand
- **RevenueCat**: https://www.revenuecat.com/docs

### Contact

- **Primary Dev**: Praveena (git user: "Praveena")
- **Designer**: UX Design Spec in repo
- **Product**: Feature specs in repo (`PLAYDATES_FEATURE_SPEC.md`, etc.)

### Issue Reporting

When reporting a bug, include:
1. Device model + iOS/Android version
2. Steps to reproduce
3. Expected vs. actual behavior
4. `npm start -- --clear` output (if bundler issue)
5. `npx tsc --noEmit` output (if TS issue)
6. Screenshot or video (for UI issues)

---

## 📝 License & Compliance

- **App License**: Proprietary (not open source)
- **Dependencies**: MIT, Apache 2.0 (see `package.json`)
- **Privacy Policy**: [Link to privacy policy]
- **Terms of Service**: [Link to terms]
- **GDPR**: Supabase handles data residency + deletion
- **CCPA**: Privacy settings in `/profile/settings`

---

## Version History

| Version | Build | Date | Changes |
|---------|-------|------|---------|
| 1.0.0 | 3 | 2026-07-27 | Full architecture refactor, Apple sign-in, component decomposition |
| 0.9.0 | 2 | 2026-06-20 | Chandelier exit logic, screener optimizations |
| 0.8.0 | 1 | 2026-06-01 | Feature modularization, Zustand split |

---

**Last Updated:** July 27, 2026  
**Maintained By:** Claude Code + Development Team  
**Next Review:** Post-App Store approval (Aug 2026)
