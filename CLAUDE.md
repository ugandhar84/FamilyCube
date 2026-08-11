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

### Brand palette (defined in `constants/colors.ts`):

| Token | Light | Dark | Meaning |
|-------|-------|------|---------|
| `colors.primary` | `#9261C7` | `#B98EDB` | Purple — main brand (GROW cube face) |
| `colors.teal` | `#00BBA4` | `#2DD4BF` | Teal — CONNECT (parent role accent) |
| `colors.amber` | `#F5A623` | `#FCD34D` | Amber — ORGANIZE (kid role accent) |
| `colors.pink` | `#F04E98` | `#F472B6` | Pink — CARE (accent) |
| `colors.navy` | `#1E2D6B` | `#A5B4FC` | Navy — wordmark / text primary |
| `colors.parent` | `#00BBA4` | `#2DD4BF` | Teal — used for parent role UI |
| `colors.kid` | `#F5A623` | `#FCD34D` | Amber — used for kid role UI |
| `colors.accent` | `#F04E98` | `#F472B6` | Pink — highlights, FABs |
| `colors.textPrimary` | `#1E2D6B` | `#F8FAFC` | Main text |
| `colors.textSecondary` | `#64748B` | `#94A3B8` | Secondary text |
| `colors.textTertiary` | `#94A3B8` | `#64748B` | Timestamps, captions |
| `colors.card` | `#FFFFFF` | `#1E2640` | Card backgrounds |
| `colors.surface` | `#F1F5F9` | `#161C2D` | Surface / input backgrounds |
| `colors.background` | `#F8FAFC` | `#0B0F1A` | Screen background |
| `colors.border` | purple/15% | purple/15% | Dividers, card borders |
| `colors.danger` | `#EF4444` | `#F87171` | Errors, destructive |
| `colors.success` | `#00BBA4` | `#2DD4BF` | Success states |
| `colors.primaryLight` | `#F0E8FA` | rgba purple | Light tint of primary |
| `colors.tealLight` | `#D6F5F1` | rgba teal | Light tint of teal |
| `colors.amberLight` | `#FEF0D3` | rgba amber | Light tint of amber |

### Role color mapping:
- **Parent** → `colors.parent` (teal) / `colors.parentLight`
- **Kid** → `colors.kid` (amber) / `colors.kidLight`
- **Active member highlight** → `colors.primary` (purple)

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
- Widget target: `com.familycube.ios.widget` (no App Group entitlement — not registered in portal)
- Physical device UDID: `00008120-00110DE634BB601E`

---

**Last Updated:** 2026-08-09
**Maintained by:** Claude Code
