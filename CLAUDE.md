# Family Cube — Claude Agent Instructions

**READ THIS FIRST** before starting any task. This is the source of truth for all agent sessions.

---

## App Overview

**Family Cube** is a React Native / Expo SDK 56 family management app.
- **Bundle ID:** `com.familycube.ios`
- **Tech stack:** Expo 56 · Expo Router v6 · Zustand v5 · AsyncStorage · TypeScript
- **Brand tagline:** CONNECT. ORGANIZE. CARE. GROW.

---

## Pre-Task Checklist

Every session, in this order:

1. ✅ **Read this file** — source of truth for architecture, colors, state, rules
2. ✅ **Run `git status`** — verify working tree is clean
3. ✅ **Run `npx tsc --noEmit`** — baseline TypeScript health (0 errors on source files)
4. ✅ **Ask the user** — clarify exact scope before starting multi-part tasks
5. ✅ **Branch from main** — `git checkout -b feat/[task-name]` or `fix/[task-name]`

---

## Brand Colors — ALWAYS use `colors.*` from `useTheme()`

**NEVER hardcode hex values in components.** Always pull from `useTheme()`:

```tsx
const { colors, isDark } = useTheme();
// Then use: colors.primary, colors.teal, colors.amber, etc.
```

### Brand palette (defined in `constants/colors.ts`) — "Kinfolk" palette

Warm editorial terracotta/sage/lavender/amber on cashmere neutrals. Token
*names* still map to the original brand roles (primary/teal/amber/pink/
parent/kid/accent) — only the hex values changed when the palette moved
from the original cool purple/teal/pink cube colors to this warmer set.
`components/FamilyCubeLogo.tsx`'s `BRAND` constant mirrors these same
values for the handful of call sites that can't use `useTheme()` (plain
functions, no hooks) — keep both in sync if this table changes.

| Token | Light | Dark | Meaning |
|-------|-------|------|---------|
| `colors.primary` | `#DF613C` | `#EE8058` | Terracotta — main brand, primary actions |
| `colors.teal` | `#3D7A5A` | `#5FA37D` | Sage — CONNECT (parent role accent) |
| `colors.amber` | `#D97706` | `#F5A85A` | Amber — ORGANIZE (kid role accent) |
| `colors.pink` | `#7B5EA7` | `#A78BC9` | Lavender — CARE (third accent) |
| `colors.navy` | `#2C2722` | `#EDE7DE` | Warm near-black — wordmark / text primary |
| `colors.parent` | `#3D7A5A` | `#5FA37D` | Sage — used for parent role UI |
| `colors.kid` | `#D97706` | `#F5A85A` | Amber — used for kid role UI |
| `colors.accent` | `#7B5EA7` | `#A78BC9` | Lavender — highlights, FABs |
| `colors.textPrimary` | `#2C2722` | `#FDFCF9` | Main text |
| `colors.textSecondary` | `#6B5F52` | `#B8AC9C` | Secondary text |
| `colors.textTertiary` | `#A69A8A` | `#7A6E60` | Timestamps, captions |
| `colors.card` | `#FFFFFF` | `#1D1A24` | Card backgrounds |
| `colors.surface` | `#F2ECE1` | `#17151D` | Surface / input backgrounds |
| `colors.background` | `#FAF8F4` | `#0E0C13` | Screen background (warm cashmere) |
| `colors.border` | terracotta/15% | terracotta/15% | Dividers, card borders |
| `colors.danger` | `#C54A27` | `#EE8058` | Errors, destructive |
| `colors.success` | `#3D7A5A` | `#5FA37D` | Success states |
| `colors.primaryLight` | `#FBEADF` | rgba terracotta | Light tint of primary |
| `colors.tealLight` | `#E1EFE7` | rgba sage | Light tint of teal |
| `colors.amberLight` | `#FDF1D6` | rgba amber | Light tint of amber |
| `colors.pinkLight` | `#EFE8F8` | rgba lavender | Light tint of pink/accent |

### Role color mapping:
- **Parent** → `colors.parent` (sage) / `colors.parentLight`
- **Kid** → `colors.kid` (amber) / `colors.kidLight`
- **Active member highlight** → `colors.primary` (terracotta)

---

## App Architecture

### 7 Tabs (in order):
| Tab | File | Feature Screen | Purpose |
|-----|------|----------------|---------|
| Hub | `app/(tabs)/index.tsx` | `features/hub/HubScreen.tsx` | Avatar switcher + parent dashboard + kid gamified home |
| Quests | `app/(tabs)/quests.tsx` | `features/quests/QuestsScreen.tsx` | Chore engine — assign, claim, approve |
| Schedule | `app/(tabs)/calendar.tsx` | `features/calendar/CalendarScreen.tsx` | 7-day strip + timeline events |
| Chat | `app/(tabs)/chat.tsx` | `features/chat/ChatScreen.tsx` | Family group messaging + reactions |
| GPS | `app/(tabs)/gps.tsx` | `features/gps/GpsScreen.tsx` | Family location map + bottom drawer |
| Store | `app/(tabs)/store.tsx` | `features/store/StoreScreen.tsx` | Coin-based reward store + redemption |
| Profile | `app/(tabs)/profile.tsx` | `features/profile/screens/ProfileScreen.tsx` | Member management, PIN, settings |

### File structure:
```
app/(tabs)/         — Tab entry points (thin re-exports to features/)
features/
  hub/              — HubScreen.tsx
  quests/           — QuestsScreen.tsx
  calendar/         — CalendarScreen.tsx
  chat/             — ChatScreen.tsx
  gps/              — GpsScreen.tsx
  store/            — StoreScreen.tsx
  profile/screens/  — ProfileScreen.tsx
store/              — Zustand stores (one file per domain)
components/         — Shared UI (PinEntryModal, etc.)
constants/          — colors.ts, theme.ts
lib/                — ThemeContext, biometrics, supabase
```

### Zustand Stores:
| Store | File | Owns |
|-------|------|------|
| `useFamilyStore` | `store/familyStore.ts` | members, activeMemberId, setActiveMember, setMemberPin |
| `useQuestStore` | `store/questStore.ts` | quests, addQuest, claimQuest, submitQuest, approveQuest |
| `useEventStore` | `store/eventStore.ts` | events, addEvent, updateEvent, deleteEvent |
| `useChatStore` | `store/chatStore.ts` | messages, sendMessage, addReaction, deleteMessage |
| `useRewardStore` | `store/rewardStore.ts` | rewards, redemptions, redeemReward, approveRedemption |
| `useNotifStore` | `store/notifStore.ts` | unreadCount (badge on Chat tab) |
| `useAuthStore` | `store/authStore.ts` | auth session |

---

## Member Roles & PIN Flow

- `FamilyMember.role` = `'parent'` | `'kid'`
- `FamilyMember.pin` = 4-digit string (optional)
- `FamilyMember.pinEnabled` = boolean
- When switching profiles: if `member.pinEnabled && member.pin` → show `PinEntryModal` → on success `setActiveMember(id)`
- `PinEntryModal` lives in `components/PinEntryModal.tsx`: shake animation, 5-attempt lockout, 30s countdown

---

## Core Rules

### 1. Use `colors.*` — never hardcode hex
```tsx
// ✅ Correct
style={{ backgroundColor: colors.primary, color: colors.textPrimary }}
// ❌ Wrong
style={{ backgroundColor: '#9261C7', color: '#1E2D6B' }}
```
Exception: event color pickers and color-swatch arrays where the user is explicitly choosing a brand color.

### 2. TypeScript must pass
`npx tsc --noEmit` must pass with 0 errors on source files before claiming done.

### 3. One branch per task
`feat/[name]` or `fix/[name]` — never commit directly to main.

### 4. Commit format
```
feat: [short title]

[2-3 sentences on why + context]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

### 5. Test before claiming done
If UI change: start dev server, verify, share screenshot.
If type/logic only: run `npx tsc --noEmit`.

---

## Dark Mode

- Every component must work in both light and dark mode.
- Use `useTheme()` for all colors — never assume light or dark.
- Use `isDark` boolean only for non-color differences (e.g. shadow opacity).

---

## Theme constants (`constants/theme.ts`)

```typescript
TYPO.heading   = 20   // screen/section titles
TYPO.body      = 15   // primary text, buttons
TYPO.caption   = 13   // secondary info, timestamps
TYPO.small     = 11   // badges, tiny labels

RADIUS.sm  = 8
RADIUS.md  = 12
RADIUS.lg  = 16
RADIUS.xl  = 20
RADIUS.xxl = 28
```

---

## Navigation (Expo Router v6)

- Routes in `app/` — file-based routing
- Modals use `presentationStyle="pageSheet"`
- No `react-navigation` directly — use `expo-router`

---

## Build Commands

```bash
# Run on physical device
npx expo run:ios --device 00008120-00110DE634BB601E

# Full clean build sequence
rm -rf ios
npx expo prebuild --clean --platform ios
cd ios && pod install && cd ..
npx expo run:ios --device 00008120-00110DE634BB601E

# TypeScript check
npx tsc --noEmit
```

---

## Known Build Quirks

- `ENABLE_USER_SCRIPT_SANDBOXING = NO` in pbxproj (sandbox deny fix)
- `SKIP_BUNDLING_METRO_IP=1` in `ios/.xcode.env.local`
- Widget target: `com.familycube.ios.widget`, App Group `group.com.familycube.ios` — confirmed live and receiving real data as of 2026-08-26
- Physical device UDID: `00008120-00110DE634BB601E`

---

## Push / VoIP-Call / Notification Rules

**Read this before touching `supabase/functions/call-reminder-sweeper/`, `lib/callAlert.ts`, `plugins/AppDelegate.canonical.swift`, `voip_push_tokens`, `member_device_tokens`, or anything that sends a push/call to a specific member.** These rules exist because every one of them was a real, live production bug found during the 2026-09-24 CallKit investigation — not hypothetical hardening.

1. **A send-attempt is not a delivery, and a delivery is not a ring.** APNs/FCM returning HTTP 200 only means the provider accepted the payload — it does NOT mean the OS displayed anything. Confirmed live: a push can be accepted by APNs and still never trigger `reportNewIncomingCall` if the native `CXProvider` isn't initialized yet (cold/killed-app launch race in `react-native-callkeep`). Never treat "APNs said 200" as "the user was notified" in logs, UI, or retry logic — only a client-side ack (e.g. `RNCallKeepDidDisplayIncomingCall`, or the existing answered/`mark-call-reminder-answered` flow) proves the UI actually showed.
2. **Every push/call send path MUST persist its outcome somewhere durable, not just return it in the HTTP response.** `call_reminder_log.delivery_result` (added 2026-09-24) is the pattern: write `{sent, failed, skipped, errors}` onto the same row that claimed the send, so a failure is queryable after the fact instead of visible only in a live response nobody was watching. Any new push-sending code (chat, reward redemption alerts, etc.) must do the same — add a `delivery_result`-style column, don't rely on `console.log`.
3. **Never send to every stored token for a member unconditionally, forever.** `BadDeviceToken` (APNs) and `NotRegistered`/`UNREGISTERED` (FCM) mean the token is permanently dead — delete that row immediately (see `isStaleTokenError` in `supabase/functions/call-reminder-sweeper/apns.ts`). A member accumulating stale tokens dilutes signal when debugging ("why didn't it ring" becomes "which of these 9 tokens was even live") and wastes a request every single cron tick.
4. **A device's own identity/session state (grant tokens, push tokens, "who am I on this device") must be scoped PER-DEVICE, never as a single global column on the member row.** Confirmed live bug: `members.active_grant_token` (PIN-switch grant) is one column per member — PIN-switching into the same member from a second device silently invalidates the first device's grant, breaking that device's own actions with a generic "could not update" error. `voip_push_tokens` already does this correctly (`member_id` + `platform` + `token`, one row per install). Any new per-member client state — grant tokens, push tokens, "last active device," notification preferences-per-device — goes in its own table keyed by `(member_id, device_id)`, using the existing `getDeviceId()` helper (`lib/chatCrypto.ts`) as the device key. Do not add a new device-identifier scheme; reuse that one.
5. **Self-assignment is always auto-confirmed, in every category, with no exceptions.** If a member assigns themselves as driver/helper/owner of anything (a ride, a chore, an event), the resulting status is `'confirmed'` immediately — never `'pending'`. There is no "confirm your own assignment" step anywhere in this app. When adding a new assignment/role RPC or client patch, copy the pattern from `reassign_event` (`supabase/migrations/20260940060000_reassign_event_study_keeps_tutor.sql`): `status := case when new_member_id = actor_id then 'confirmed' else 'pending' end`. Before shipping any new self-assign path, grep for other RPCs with the OLD hardcoded-`'pending'` pattern (e.g. `assign_event_role` has one, unused today but a landmine) and fix or delete them — don't leave a second implementation of the same rule to drift.
6. **A generic "couldn't update / please try again" toast is not an acceptable terminal state for an RPC failure.** If an RPC throws because of an identity/auth check (e.g. `resolve_active_member_id()` mismatch), the failure reason is knowable server-side — surface something the user or a future debugging session can act on, not just a retry prompt that will fail identically every time for the same underlying reason (see rule 4's grant-token bug: every retry failed the same way until the actual cause — a second device's PIN-switch — was found).
7. **Before declaring a push/call "fixed," verify with the phone locked/backgrounded, not just foregrounded.** A foreground manual test (app already running, native modules already initialized) can succeed while the exact same code fails on a real killed-app/background wake — this is precisely how the CallKit bug regressed silently multiple times. Foreground success is necessary but not sufficient evidence.

---

**Last Updated:** 2026-09-24
**Maintained by:** Claude Code
