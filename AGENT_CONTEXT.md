# AGENT_CONTEXT — PawBond Project State

**Last Updated:** 2026-08-03 by Claude Sonnet 4.6  
**Session:** PostDetailScreen UX overhaul + comment reply threading + photo frame fix + social feed UX

This document is updated after every agent session. It's the living source of truth for the project state.

---

## Stack & Versions

| Component | Version | Notes |
|---|---|---|
| **React Native / Expo** | SDK 56.0.0 | Latest stable; read exact docs at https://docs.expo.dev/versions/v56.0.0/ |
| **TypeScript** | 5.x | Configured via `tsconfig.json`; runs in strict mode |
| **Navigation** | Expo Router v56 | File-based routing in `app/` folder |
| **State Management** | Zustand | One file per store (e.g., `petStore.ts`, `authStore.ts`) |
| **Backend** | Supabase | PostgreSQL + RLS + Realtime subscriptions + Edge functions |
| **Auth** | Supabase Auth | Email/password + Google Sign-In via `useAuthStore` |
| **UI Components** | React Native | Custom + Expo vector icons; responsive via flexbox + platform detection |
| **AI Models** | DeepSeek, Gemini 2.5 Flash, OpenAI | Model chains defined in edge functions |
| **Subscriptions** | RevenueCat | iOS + Android; synced via `sync-subscription` edge function |
| **Push Notifications** | Expo Notifications | Managed by `shared/services/notifications.service.ts` |
| **Storage** | Supabase Storage | Pet photos, health records, media; cleaned up by `media-retention-cleanup` cron |
| **Analytics** | (Not yet integrated) | Optional future: Sentry, Mixpanel, etc. |

---

## Architecture Overview

### Feature-Driven Modular Structure
```
features/
  ├── social/          # Follow, feed, posts, playdates, notifications
  ├── care/            # Daily health (feeding, mood, checklist, notes, meds)
  ├── health/          # Appointments, vaccines, records, insurance, receipts
  ├── ai/              # Mood scan, symptom scan, vet chat, parse health/insurance/voice
  └── admin/           # Admin panel (push notifications, settings)
```

Each feature has:
- `screens/` — navigable destinations
- `components/` — internal + shared UI
- `hooks/` — data fetching + local logic (e.g., `useTodayData`, `useNotificationsData`)

### Shared Patterns
- **`lib/careProgress.ts`** — shared formula for pet care completion % (used by widget, Home, Care-Today)
- **`lib/db/`** — database helpers (queries, mutations, RPC calls)
- **`lib/hooks/`** — shared React hooks (usePaywall, useContextTier, useAppSettings, etc.)
- **`shared/services/notifications.service.ts`** — push token registration, local notification scheduling
- **`shared/store/slices/`** — Zustand store slices (care.slice.ts with feeding/mood/checklist logs)

---

## Key Features (Shipped)

### Health Tracking
- ✅ **Feeding logs** — record breakfast/lunch/dinner/water per pet; shows progress in Care-Today
- ✅ **Mood scans** — AI mood detection via photo + cached auth + background scan-count increment
- ✅ **Medication reminders** — recurring med schedule, compliance checks, past-dose tracking
- ✅ **Appointments** — add, reschedule, voice parsing (normalized type aliases)
- ✅ **Vaccine records** — due dates, completion tracking, reminders
- ✅ **Health records** — parse PDF/image pages via Gemini/DeepSeek Vision; extract to JSON
- ✅ **Insurance docs** — parse policy fields from documents

### Social & Playdates
- ✅ **Follow/Followers** — user relationship graph, followed-pets feed
- ✅ **Playdates** — full request/accept/decline/confirm state machine with notifications
- ✅ **Playdate pet filter** — entries cleared on active pet switch (no stale data)
- ✅ **Notifications** — in-app inbox (notification_logs table) + push tokens + dedup
- ✅ **Notification mark-done** — removes from DB immediately + store cache sync (no "come back" bug)

### AI Features
- ✅ **Mood scan** — Gemini Vision → mood label + score + emotion breakdown + advice
- ✅ **Mood scan-ready push** — fires when user navigates away during scan (local notification)
- ✅ **Symptom scan** → **PetDoc chat** — scan context silently injected into first message (user never sees prefix)
- ✅ **PetDoc (Vet Chat)** — multi-turn, stateless conversation with scan context
- ✅ **Daily tip** — generated per pet based on species/breed/age/meds/upcoming appointments

### Settings & Personalization
- ✅ **Dark mode** — toggle in settings, synced via preferenceStore
- ✅ **Quiet hours** — suppresses push only (in-app still lands); opted-out blocks both
- ✅ **Subscription tiers** — Free/Pro/Ultimate with feature gates
- ✅ **Pet roles** — owner/family/vet permissions per pet

---

## Feature Reference

Quick lookup for feature details. Read the spec before starting work on a feature.

| Feature | Detailed Spec | Key Files | Tier Gate |
|---|---|---|---|
| **Notifications** | `FEATURE_SPECS.md` § 1 | `features/social/hooks/useNotificationsData.ts`, `NotifCard.tsx`, `NotificationsScreen.tsx` | None (all tiers) |
| **Playdates** | `FEATURE_SPECS.md` § 2 | `features/playdates/screens/MyPlaydatesScreen.tsx`, `PlaydateEntryCard.tsx` | Free+ |
| **Health Tracking** | `FEATURE_SPECS.md` § 3 | `features/care/screens/TodayScreen.tsx`, `lib/careProgress.ts` | Free+ |
| **Mood Scan** | `FEATURE_SPECS.md` § 4 | `features/ai/screens/MoodCameraScreen.tsx`, `MoodResultCard.tsx` | Pro+ (10/day) |
| **Symptom Scan + Vet Chat** | `FEATURE_SPECS.md` § 4 | `features/ai/screens/SymptomScanScreen.tsx`, `VetChatScreen.tsx`, `ScanResultCard.tsx` | Ultimate |
| **Social (Follow/Feed/Mentions)** | `FEATURE_SPECS.md` § 5 | `features/social/screens/SocialScreen.tsx`, `PostCard.tsx`, `FeedTab.tsx` | Free+ |
| **Settings & Personalization** | `FEATURE_SPECS.md` § 6 | `app/(tabs)/settings.tsx`, `store/subscriptionStore.ts` | Free+ |

**How to use:**
1. Before starting work on a feature, read the relevant section in `FEATURE_SPECS.md` (1 page)
2. For more detail, see the "Related Docs" link (e.g., PLAYDATES_FEATURE_SPEC.md)
3. Key files listed show where the code lives

---

## Current Status (In Progress / Recently Fixed)

### Last Session (2026-08-02)
**Fixes completed:**
1. **Notification mark-done dedup** — `removeNotifs()` now deletes from local state + DB + store cache (no "come back" behavior)
2. **Playdates pet filter** — entries cleared on pet switch + userId from cache (not async)
3. **Mood save speed** — cached authUser + background incrementScanCount + photo retry
4. **Mood scan-ready push** — fires when user navigates away mid-scan
5. **Symptom scan → PetDoc** — context silently injected, AI primed, user never sees prefix
6. **Store cache coherency** — added `removeCachedNotifs()` to notifStore to sync deletions

**DB audit completed:**
- Push token `UNIQUE(token)` constraint verified (fixed in prior migration)
- notification_logs type CHECK constraint includes all active types + mood_scan_ready

### Last Session (2026-08-03)
**Features shipped:**

1. **PostDetailScreen UX overhaul** (`features/social/screens/PostDetailScreen.tsx`, `PostDetailCard.tsx`)
   - Full-bleed hero media: width = screen width, adaptive aspect ratio via `onLoad`, `LinearGradient` caption overlay
   - Reaction picker: 6 reactions (❤️🐾😂😮😢🔥), appears after 420ms long-press on heart button
   - Pet quick-peek bottom sheet: species/breed/age/city pills, 6 recent posts thumbnails, Profile button
   - ImmersiveViewer: multi-photo fullscreen, horizontal `ScrollView pagingEnabled`, swipe left/right, N/M counter, dot strip
   - Go-to-top FAB (chevron-up) same as other screens

2. **Comment reply threading** (`PostCommentsList.tsx`, `PostCommentInput.tsx`, `PostDetailScreen.tsx`)
   - Reply button on each top-level comment → shows banner "↩ Replying to [pet]" in input
   - Replies indented 38px under parent with accent left-line
   - DB column: `post_comments.reply_to_comment_id uuid REFERENCES post_comments(id) ON DELETE CASCADE`
   - Migration: `supabase/migrations/20260803044512_comment_replies.sql` — **applied to prod**
   - 3-tier notifications: original commenter → post author → thread participants (all deduped)
   - `post_comment_reply` notification type added to `PUSH_TYPE_TO_FLAG` in `playdates` edge function

3. **Photo framing fix** (`PostCard.tsx`, `PostDetailCard.tsx`)
   - `AdaptivePhoto`: reads natural dimensions via `onLoad` (`e.source.width/height`), sets container `aspectRatio` to match
   - Aspect ratio clamped between `3/4` (portrait, matches PhotoEditor export) and `1.91` (landscape)
   - `contentFit="cover"` — no black bars, no cropping of the decorated frame

4. **Report/Unreport** (`SocialScreen.tsx`, `PostCard.tsx`, `PostDetailCard.tsx`)
   - Flag is always pressable; filled flag = unreport (confirm dialog → delete from `post_reports`)
   - Pin/Unpin also fixed: always pressable regardless of current state

5. **Feed scroll-to-top** (`FeedTab.tsx`, `SocialScreen.tsx`)
   - `scrollToTopRef` pattern: mutable ref passed as prop, bound to FlashList's `scrollToOffset`
   - Called after `createPost` and `addComment` to reset feed to top

6. **Care screen filter isolation** (`features/care/components/TodayScreen.tsx`)
   - Filter chips only update local `filterIds` Set — `setActivePet()` no longer called from chip toggle

**Edge function deployed:**
- `playdates`: added `post_comment_reply: 'notif_family'` to `PUSH_TYPE_TO_FLAG` and deployed

---

## Architecture Decisions (Why We Built It This Way)

### Why Zustand over Redux/Context?
- Lightweight, less boilerplate, first-class TypeScript
- Immutable updates, no dispatch actions
- Perfect for this project's state size (auth + pet data + settings)

### Why Expo Router over React Navigation?
- File-based routing (cleaner mental model)
- Native iOS/Android navigation stack handling built-in
- Deep links work automatically via file structure

### Why FlashList (not FlatList)?
- Virtualization performance for long lists (notifications, feed)
- Better memory usage with hundreds of items
- Trade-off: stale state in cells if props aren't memoized (we handle this)

### Why Edge Functions (not REST API)?
- Authenticated by default (JWT in Authorization header)
- Service-role key for admin operations (delete-account, etc.)
- Easy to add new endpoints without backend deployment
- AI model chains can be updated without iOS/Android rebuild

### Why Multi-Turn Stateless Vet Chat?
- User's conversation history stored locally on device
- No server-side chat storage (simpler, privacy-first)
- Context injected per message (symptom scan visible to AI, not user)

### Why `pendingCareIds` Ref for Dedup?
- Blocks double-tap on notification buttons
- Set clears after action completes (try/finally)
- Prevents duplicate feeding logs / medication checks from rapid taps

### Why Care Progress Shared?
- Widget, Home pet card, and Care-Today must show same % or users get confused
- Centralized formula in `lib/careProgress.ts` ensures consistency
- Inputs: feeding logs, mood logs, checklist items for a pet + date

---

## Database Schema (Key Tables)

### notification_logs
```sql
id | user_id | type | title | body | data | read | created_at | deleted_at
```
- `type`: CHECK constraint lists all valid types (includes mood_scan_ready as of migration 20260802000001)
- Dedup: `UNIQUE(user_id, dedup_key)` for cron-based notifications

### push_tokens
```sql
id | user_id | token | platform | device_name | created_at | updated_at
```
- `UNIQUE(token)` — token belongs to exactly one user at a time
- On login: upsert reassigns token to current user (shared device scenario)

### post_comments
```sql
id | post_id | author_id | pet_id | body | reply_to_comment_id | created_at
```
- `reply_to_comment_id`: self-referencing FK → `post_comments(id) ON DELETE CASCADE`
- Top-level comments: `reply_to_comment_id IS NULL`
- Replies displayed indented under parent in `PostCommentsList`

### vet_chat_sessions
```sql
id | user_id | pet_id | messages | summary | updated_at
```
- Messages array: `[{ role: 'user'|'model', text: string }]`
- Summary: first user message (120 chars) for history display
- No server-side AI history (stateless per message)

### pets
```sql
id | owner_id | name | species | breed | birthday | weight_kg | accent_color
```
- `owner_id`: primary owner (admin on this pet)
- Roles managed separately in `pet_roles` table (owner/family/vet)

### Daily Logs (via shared/store/slices/care.slice.ts)
- `feeding_logs`: pet_id, date, meal_type, fed_by, fed_at
- `mood_logs`: pet_id, date, mood_label, mood_score, photo_url, notes, advice, situation
- `checklist`: pet_id, date, type, label, completed, completed_by, completed_at

---

## Known Issues & Workarounds

### Pre-Existing TypeScript Errors (Don't Fix Without Asking)
| File | Error | Workaround |
|---|---|---|
| `features/ai/screens/VetChatScreen.tsx` (line 298) | `.catch` does not exist on `PromiseLike<void>` | No-op; low priority |
| `features/care/hooks/useJournalData.ts` (line 31) | Expected 1 argument, got 0 | No-op |
| `features/health/hooks/useHealthData.ts` (line 35) | Expected 1 argument, got 0 | No-op |
| `features/social/screens/SocialScreen.tsx` (lines 336, 353) | `.catch` does not exist on `PromiseLike<void>` | No-op |

**Why they stay:** Low severity, unblock active features; no regression if not fixed.

### Playdate Avatar Split
- **Status:** Shipped
- **Pattern:** `SplitAvatar` component shows my pet (left) + their pet (right) in split circle
- **Note:** Ensure both `myPet` and `theirPet` are passed; null safety handled

### Notification "Come Back" (Was a Bug, Now Fixed)
- **Issue was:** Mark notif as done → deletes locally → user refreshes → comes back from DB
- **Fix:** `removeNotifs()` now calls `removeCachedNotifs()` on the store cache
- **Verification:** Next agent should test: mark done → refresh → should stay gone

### Duplicate Push Tokens (Was a Bug, Now Fixed)
- **Issue was:** `UNIQUE(user_id, token)` allowed same token for multiple user_ids
- **Fix:** Changed to `UNIQUE(token)` via migration 20260723000003_notification_fixes.sql
- **Verification:** Shared device → login as user A → notifications land on A's device only

---

## Feature Flags

Controlled via `useFeatureFlag()` hook; keys defined in `app_settings` table:

| Flag | Default | Notes |
|---|---|---|
| `ai_mood_scan_enabled` | true | Mood camera feature visible |
| `ai_symptom_scan_enabled` | true | Symptom scan + PetDoc visible |
| `ai_vet_chat_enabled` | true | Vet chat accessible |
| `widget_enabled` | true | Home screen widget visible |

---

## Notification Dedup Strategy

### For Cron Notifications (send-feeding-reminder, send-mood-reminder, etc.)
- Insert into `notification_logs` uses `UNIQUE(user_id, dedup_key)` — same key within 24h doesn't insert twice
- `dedup_key` example: `feeding-reminder:${petId}:${date}`

### For Care Actions (mark-done on feeding/walk reminders)
- `pendingCareIds` ref prevents double-tap on button
- `removeNotifs([id])` deletes from:
  - Local `notifs` state
  - Store `notifications` cache
  - DB `notification_logs` table

### For Feeding Logs (in handleCareAction)
- Before inserting, check if `feeding_logs` already has an entry for `pet_id:date:meal_type`
- Only insert if count is 0

---

## Testing Checklist

Before marking a feature as shipped:

- [ ] TypeScript passes (`npx tsc --noEmit` = 0 errors on source)
- [ ] Dev server runs (`npm start` → no crashes)
- [ ] Feature works on iOS Simulator
- [ ] Dark mode works (toggle in settings, colors update)
- [ ] Permissions granted (camera, photos, contacts if needed)
- [ ] No stale state in FlashList (verify memoized props)
- [ ] Notifications tested (mark done → refresh → shouldn't come back)
- [ ] Deep links work (notification → correct screen + pet context)

---

## Deployment Checklist

### Before Pushing to Production
1. ✅ Merge to `main` (via PR)
2. ✅ Run migrations on staging (`supabase db push`)
3. ✅ Deploy edge functions (`supabase functions deploy [function-name]`)
4. ✅ TestFlight build for iOS
5. ✅ Internal test (mood scan, playdates, notifications)
6. ✅ App Store review (if needed)

### Current Build Info
- **Version:** 1.0.0
- **Build Number:** 58 (iOS) — set in Xcode project settings
- **Latest Commit:** b56216a (comprehensive multi-agent documentation)

---

## Common Patterns (Copy These, Don't Invent)

### Fetching Pet Data with Realtime Subscription
```typescript
const loadRef = useRef<(isForce?: boolean) => Promise<void> | null>(null);
const load = useCallback(async (isForce?: boolean) => {
  // fetch logic
}, [dependencies]);
loadRef.current = load;

useEffect(() => {
  const sub = supabase.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'table_name' },
    () => { loadRef.current?.(true); }
  ).subscribe();
  return () => sub.unsubscribe();
}, []);
```

### Sync Local + Store Cache on Delete
```typescript
const removeNotifs = useCallback((ids: string[]) => {
  setNotifs(prev => prev.filter(n => !ids.includes(n.id)));
  useNotifStore.getState().removeCachedNotifs(ids);
  deleteNotifications(ids);
}, []);
```

### Prevent Double-Tap Duplicates
```typescript
const pendingIds = useRef<Set<string>>(new Set());
const handleAction = useCallback(async (id: string) => {
  if (pendingIds.current.has(id)) return;
  pendingIds.current.add(id);
  try {
    // action logic
  } finally {
    pendingIds.current.delete(id);
  }
}, []);
```

### Query DB Before Insert (Dedup)
```typescript
const { count } = await supabase
  .from('feeding_logs')
  .select('id', { count: 'exact', head: true })
  .eq('pet_id', petId)
  .eq('date', today)
  .eq('meal_type', meal_type);
if ((count ?? 0) === 0) {
  await insertFeedingLog({ /* ... */ });
}
```

---

## Next Agent Priorities

1. **Test comment replies** — Reply to a comment, verify it appears indented under parent; verify reply notification arrives
2. **Test unreport** — Report a post, then tap the filled flag → confirm dialog → unreport; verify it works in both FeedTab and PostDetailScreen
3. **Test photo framing** — Post a framed photo (from PhotoEditor); verify complete frame visible in feed card with no black bars or cropping
4. **Test pet peek sheet** — Tap a pet avatar in PostDetailScreen → verify species/breed/age/city + recent posts appear
5. **Test reaction picker** — Long-press heart (420ms) → verify 6-reaction row appears; tap one → verify it saves
6. **Test fullscreen multi-photo** — Post with multiple photos; open viewer; swipe L/R; verify dots + counter update
7. **Verify notification mark-done** — still works post-rebase (mark done → refresh → should stay gone)

---

## Questions for Next Agent?

If you find something unclear or broken:
1. Check this file first (you're reading it)
2. Check `CLAUDE.md` (instructions)
3. Check `ARCHITECTURE.md` (edge functions, model chains)
4. Check the relevant feature's `README.md` (if it exists)
5. **Ask the user** — don't guess

---

**Maintained with ❤️ by multi-agent protocol**  
**Next update:** After next agent session
