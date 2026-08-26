# Family Cube Architecture & Technical Deep-Dive

**Last Updated:** 2026-08-02 (post-notification dedup + playdates + mood scan fixes)

---

## Table of Contents

1. [Edge Functions Reference](#edge-functions-reference)
2. [Database Schema & Constraints](#database-schema--constraints)
3. [State Management (Zustand Patterns)](#state-management-zustand-patterns)
4. [Notification System](#notification-system)
5. [Client-Side Patterns](#client-side-patterns)
6. [AI Feature Architecture](#ai-feature-architecture)
7. [Care Progress Calculation](#care-progress-calculation)
8. [Known Issues & Workarounds](#known-issues--workarounds)

---

## Edge Functions Reference

Complete inventory of all 40+ edge functions, their AI model chains, tier gates, and error handling.

### Key integrations by function

| Function | API Keys / Services | AI Model Chain | Notes |
|---|---|---|---|
| send-mood-reminder | Expo Push | None | Text-only templated push; hourly cron |
| send-feeding-reminder | Expo Push | None | Text-only templated push; hourly cron |
| send-walk-reminder | Expo Push | None | Text-only templated push; hourly cron |
| send-vaccine-reminder | Expo Push | None | Text-only templated push |
| send-appointment-reminder | Expo Push | None | Text-only templated push; **KNOWN ISSUE:** loops per-appointment instead of bundling per-user |
| med-compliance-check | Expo Push | None | Text-only templated push; checks medication logs |
| send-birthday-memorial | Expo Push | None | **KNOWN ISSUE:** sends per-pet instead of bundled; fetches random photo from `pet_photos` |
| send-daily-tip | Expo Push | DeepSeek → Gemini 2.5 Flash → Gemini 2.0 Flash → Gemini 1.5 Flash | System prompt includes pet species, breed, age, meds, appointments, activity, weight |
| send-streak-recovery | Expo Push | None | Text-only templated push |
| send-reengagement | Expo Push | None | Text-only templated push |
| send-upgrade-nudge | Expo Push | None | **KNOWN ISSUE:** UTC cron without `localHour()` gate — unpredictable local times |
| send-lost-alert | Expo Push | None | User-initiated; immediate push |
| periodic-lost-alerts | Expo Push | None | Cron: every 15 min; **KNOWN ISSUE:** no quiet-hours check (intentional for urgency) |
| send-lost-owner-checkin | Expo Push | None | Templated push to pet owner on missing pet |
| send-found-alert | Expo Push | None | Templated push to subscribers of lost alert |
| mention-notify | Expo Push | None | Fires when user is @mentioned in post/comment |
| notify-event-rsvp | Expo Push | None | Fires on event RSVP changes |
| notify-admin-feedback | Expo Push | None | Admin-only; no in-app inbox entry |
| send-broadcast | Expo Push | None | Admin-only; bypasses user notification prefs |
| playdates | Expo Push | None | State machine: request→accept/decline→confirm; sends notif per state change |
| send-family-invite | Resend (email), Expo Push | None | Email template via Resend + optional push if invitee has app |
| accept-family-invite | Expo Push | None | Push to pet owner on family accept |
| analyze-pet-mood | Gemini Vision | Gemini 2.5 Flash (vision) → 2.0 Flash → 1.5 Flash | Pro+ tier; free users get 2 scans/day; logs to `api_usage_logs` |
| symptom-scan | DeepSeek, Gemini Vision, OpenAI | Text: DeepSeek → Gemini 2.5 Flash; Image: Gemini Vision → Gemini Vision | Ultimate tier; moderation via `text-moderation-007` on input |
| vet-chat | DeepSeek, Gemini Text, OpenAI | DeepSeek → Gemini 2.5 Flash → Gemini 2.0 Flash → Gemini 1.5 Flash; moderation per turn | Ultimate tier; **stateless**: app stores all history, context injected per message |
| parse-health-record | Gemini Vision, GPT-4o-mini, DeepSeek Vision | Text: Gemini 2.5 Flash → DeepSeek Vision; Image: Gemini → GPT-4o-mini → DeepSeek Vision | Pro+ tier; extracted to `health_records.extracted_data` JSON |
| parse-appointment-voice | Gemini Text | Gemini 2.5 Flash → 2.0 Flash → 1.5 Flash | Stateless; normalizes type aliases, corrects past years; **client-side min 10s** enforced |
| parse-insurance-doc | Gemini Vision | Gemini 2.5 Flash (vision) → 2.0 Flash → flash-latest → 2.5-lite | No tier gate; extracts policy fields; image not persisted |
| parse-receipt | DeepSeek Vision | Gemini 2.5 Flash (vision) → DeepSeek Vision | Ultimate tier; category + amount + confidence per line item |
| generate-milestones | DeepSeek Text | DeepSeek `deepseek-chat` (JSON mode) | Reads 1 year activity; quota: once per 7 days on-demand, none on cron |
| milestone-cron | None | None | Inserts day-count milestones; fires HTTP to `generate-milestones` (fire-and-forget) |
| generate-pet-timeline | DeepSeek Text, Gemini Text | DeepSeek → Gemini 2.5 Flash → 2.0 Flash → 1.5 Flash | Pro+ tier; max 4 generations/year; calls `get_pet_journal` RPC |
| yir-video-gen | Gemini Vision | Gemini 2.5 Flash (vision, interleaved images+text) | **⚠️ No JWT auth** — any caller can invoke; picks best 6–8 photos, writes captions |
| nearby-places | Yelp Fusion, Overpass/OSM, DeepSeek | Yelp (places) → Overpass/OSM; DeepSeek for captions | No tier gate; Yelp 500/day shared quota; rate-limit returns stale cache |
| search-users | None | None | Uses service-role to bypass RLS; `ilike` search on `full_name` |
| delete-account | Expo Push | None | Soft-delete; user has 30 days to restore |
| purge-deleted-accounts | None | None | Hard-delete via `auth.admin.deleteUser()`; cascades all rows; no per-run cap |
| media-retention-cleanup | None | None | Deletes storage objects + nulls DB columns per `media_retention_config`; 500/run cap |
| revenuecat-webhook | RevenueCat (webhook bearer auth) | None | Webhook auth via `REVENUECAT_WEBHOOK_SECRET` |
| sync-subscription | RevenueCat REST API | None | **⚠️ Hardcoded `X-Platform: ios`** — Android uses wrong platform |

### API Keys & Environment Variables

| Key | Service | Used by | Notes |
|---|---|---|---|
| `SUPABASE_URL` | Supabase | Every function | Base URL for DB + storage |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Most functions | For DB queries + auth.admin calls |
| `EXPO_PUBLIC_PROJECT_ID` | Expo | Functions that send push | Required to fetch device push token |
| `DEEPSEEK_API_KEY` | DeepSeek | send-daily-tip, symptom-scan, vet-chat, parse-health-record, generate-milestones, generate-pet-timeline, nearby-places, parse-receipt | Primary AI model for text + vision |
| `GEMINI_API_KEY` | Google Gemini | Most AI functions | Fallback for DeepSeek or primary for vision |
| `OPENAI_API_KEY` | OpenAI | symptom-scan, vet-chat, parse-health-record (moderation) | Moderation via `text-moderation-007` |
| `REVENUECAT_WEBHOOK_SECRET` | RevenueCat | revenuecat-webhook | Bearer token verification |
| `REVENUECAT_SECRET_KEY` | RevenueCat | sync-subscription | REST API auth |
| `YELP_API_KEY` | Yelp Fusion | nearby-places | 500 calls/day free tier (shared) |
| `RESEND_API_KEY` | Resend | send-family-invite | HTML email service |

### AI Model Fallback Chains

**Text-only** (most reminders, tips, vet chat):
```
DeepSeek deepseek-chat → Gemini 2.5 Flash → Gemini 2.0 Flash → Gemini 1.5 Flash
```

**Vision** (mood, health records, receipts):
```
Gemini 2.5 Flash (vision) → Gemini 2.0 Flash (vision) → Gemini 1.5 Flash (vision)
(DeepSeek Vision used as fallback in: health-record image pages, receipt parsing)
```

**Health records** (mixed mode):
- Text pages: DeepSeek → DeepSeek Vision
- Image pages: Gemini → GPT-4o-mini → DeepSeek Vision

**Error handling:**
- Most functions swallow timeouts and fall through the chain
- If all AI models fail, return partial data or error gracefully
- No retry loops; just sequential fallback

---

## Database Schema & Constraints

### Core Tables (Audited 2026-08-02)

#### `notification_logs` — In-app inbox
```sql
id | user_id | type | title | body | data | read | created_at | deleted_at
-- Constraints:
-- UNIQUE(user_id, dedup_key) — prevents duplicate reminders within 24h
-- CHECK (type IN (...)) — all valid types listed in latest migration
```

**Type CHECK constraint (updated 2026-08-02):**
All valid types: `lost_alert`, `pet_found`, `appointment_reminder`, `appointment_complete_prompt`, `vaccine_reminder`, `medication_reminder`, `health_alert`, `feeding_reminder`, `walk_reminder`, `mood_reminder`, `mood_scan_ready`, `med_missed_dose`, `med_monthly_nudge`, `med_monthly_followup`, `symptom_scan_ready`, `invite`, `invite_accepted`, `family_invite`, `family_invite_sent`, `family_update`, `post_like`, `post_comment`, `follow`, `mention`, `new_post`, `playdate_request`, `playdate_resend`, `playdate_accepted`, `playdate_declined`, `playdate_withdrawal`, `playdate_proposal`, `playdate_counter_proposal`, `playdate_confirmed`, `playdate_cancelled`, `playdate_rescheduled`, `playdate_expired`, `playdate_completion`, `playdate_reminder`, `playdate_proposal_declined`, `playdate_proposal_cancelled`, `chat_message`, `playdate_message`, `playdate_chat_message`, `event_rsvp`, `event_update`, `birthday_notif`, `memorial_notif`, `daily_tip`, `daily_care`, `upgrade_nudge`, `lost_owner_checkin`, `broadcast`, `system`.

#### `push_tokens` — Device push subscriptions
```sql
id | user_id | token | platform | device_name | created_at | updated_at
-- Constraint: UNIQUE(token) — one token per user at a time (fixed 2026-07-23)
-- On login: upsert reassigns token to current user (handles shared devices)
-- On logout: delete
```

#### `pets` — Pet profiles
```sql
id | owner_id | name | species | breed | birthday | weight_kg | accent_color | created_at | updated_at
-- Roles managed separately in pet_roles table
```

#### Daily Care Logs (part of `petStore` via `shared/store/slices/care.slice.ts`)
```sql
-- feeding_logs:
id | pet_id | date | meal_type (breakfast/lunch/dinner/water) | fed_by | fed_at | created_at

-- mood_logs:
id | pet_id | date | mood_label | mood_score | happy_pct | playful_pct | tired_pct | anxious_pct
    photo_url | notes | advice | situation | created_at | updated_at

-- checklist:
id | pet_id | date | type | label | completed | completed_by | completed_at
-- Constraint: UNIQUE(pet_id, date, type, label) — upsert deduplicates
```

#### `vet_chat_sessions` — Vet chat history
```sql
id | user_id | pet_id | messages (JSON array) | summary | updated_at
-- messages format: [{ role: 'user'|'model', text: string }]
-- summary: first user message (120 chars) for history list display
-- no server-side AI history; app stores everything locally
```

---

## State Management (Zustand Patterns)

### Global Stores (one file per store)

**`store/authStore.ts`** — User session
```typescript
user: { id, email, aud }
setUser() — called on login
logout() — clears user
```

**`store/petStore.ts`** — Pet data + care logs (THE monolith)
```typescript
pets: Pet[]
activePetId: string
petRoles: Record<petId, role>
checklist: Record<petId, ChecklistItem[]>
feedingLogs: Record<`${petId}:${date}`, FeedingLog[]>
moodLogs: Record<petId, MoodLog[]>
setActivePet(petId) — switches active context
addMoodLog() — upserts mood + updates store
```

**`store/notifStore.ts`** — Notification cache
```typescript
unreadCount: number
notifications: NotificationLog[] | null  // cached inbox rows
markCachedRead(ids) — optimistic update
prependNotification(row) — realtime INSERT
removeCachedNotifs(ids) — sync deletions (NEW 2026-08-02)
```

**`store/preferenceStore.ts`** — User settings
```typescript
darkMode: boolean
quietHoursStart, quietHoursEnd: time
```

**`store/subscriptionStore.ts`** — Billing
```typescript
tier: 'free' | 'pro' | 'ultimate'
usedToday: Record<quotaKey, number>
refreshUsage(userId, quotaKey) — syncs with DB
```

### Store Slices (composed into petStore)

**`shared/store/slices/care.slice.ts`** — Feeding, mood, checklist
```typescript
// Composed as petStore properties:
checklist, feedingLogs, moodLogs
```

### Local React State (NOT in Zustand)

Use `useState` for:
- Form inputs
- Modal open/close
- Expanded sections
- Temporary UI state
- Anything used by one component only

**Pattern:** Never store in Zustand if it's local to one screen/component.

### Cache Coherency (2026-08-02 Fix)

**Problem:** Local state + store cache could diverge (e.g., notification deleted locally but still in store).

**Solution:** Sync deletions to store immediately.

```typescript
// In useNotificationsData hook:
const removeNotifs = useCallback((ids: string[]) => {
  setNotifs(prev => prev.filter(n => !ids.includes(n.id)));
  useNotifStore.getState().removeCachedNotifs(ids);  // SYNC
  deleteNotifications(ids);  // DB delete
}, []);
```

---

## Notification System

### Push Tokens

**Flow:**
1. On login: `savePushToken()` → upserts to `push_tokens` with `onConflict: 'token'`
2. Shared device: token gets reassigned from user A to user B (unique constraint enforces this)
3. On logout: `removePushToken()` → deletes token from DB
4. On notification: edge function queries `push_tokens` by user_id, sends to all tokens

**Key constraint (2026-07-23 fix):**
- **Old:** `UNIQUE(user_id, token)` — same token could belong to multiple users
- **New:** `UNIQUE(token)` — one token per user at a time

### In-App Notifications (notification_logs)

**Write path:**
1. Edge function inserts row into `notification_logs` table
2. Realtime subscription fires in app (if user is online)
3. New notification appears in inbox + badge count updates

**Dedup strategies:**

**For cron notifications** (feeding reminder, mood reminder):
- Insert uses `UNIQUE(user_id, dedup_key)` constraint
- Same `dedup_key` within 24h doesn't insert twice
- Example: `dedup_key = 'feeding-reminder:${petId}:${date}'`

**For user actions** (mark-done on care reminders):
- `pendingCareIds` ref (Set) prevents double-tap
- `removeNotifs([id])` immediately deletes from: local state + store cache + DB
- Item never "comes back" on refresh because it's gone from DB

**For feeding logs:**
- Before inserting a feeding log, check if one already exists for `pet_id:date:meal_type`
- Only insert if count is 0 (prevents duplicates on double-tap)

### Local Notifications (Expo Notifications)

**Use case:** When user navigates away during mood scan.

**Flow:**
1. Mood scan starts → `scanningRef.current = true`
2. User navigates away → `useFocusEffect` blur handler sees `scanningRef.current === true` → `leftDuringScanRef = true`
3. Scan finishes (background) → result arrives
4. `useEffect` on `[result]` sees `leftDuringScanRef === true` → fires `scheduleImmediateNotification()`
5. User sees push notification: "Pet's mood scan is ready 🐾"
6. Tap notification → deep link to `/ai/mood-camera` → result displays

**Helper:**
```typescript
export async function scheduleImmediateNotification({
  title, body, data, notifType
}: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  notifType?: string;
}): Promise<void> {
  if (!Notifications) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { ...data, type: notifType }, sound: true },
    trigger: null,  // fires immediately
  });
}
```

---

## Client-Side Patterns

### Pattern 1: Realtime Subscriptions with loadRef

**Problem:** Postgres changes can capture stale closures of `load()`, causing crashes.

**Solution:** Use `loadRef` to store the function, call it from the cleanup handler.

```typescript
const loadRef = useRef<(isForce?: boolean) => Promise<void> | null>(null);

const load = useCallback(async (isForce?: boolean) => {
  // fetch logic
}, [deps]);

loadRef.current = load;

useEffect(() => {
  const sub = supabase.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'table_name' },
    () => { loadRef.current?.(true); }
  ).subscribe();
  return () => sub.unsubscribe();
}, []);  // NO load in deps — prevent infinite rerenders
```

**Used in:** `features/care/hooks/useTodayData.ts` for medication realtime subscription.

### Pattern 2: Prevent Double-Tap Duplicates

**Problem:** User double-taps "Mark Done" button → logs action twice.

**Solution:** Guard with a ref Set, add on start, delete in finally.

```typescript
const pendingIds = useRef<Set<string>>(new Set());

const handleAction = useCallback(async (id: string) => {
  if (pendingIds.current.has(id)) return;  // GUARD
  pendingIds.current.add(id);
  try {
    // action: insert feeding log, update checklist, etc.
  } finally {
    pendingIds.current.delete(id);
  }
}, []);
```

**Used in:** Notification mark-done, playdates accept/decline buttons.

### Pattern 3: Dedup Before Insert

**Problem:** Feeding log inserted twice if user double-taps and both calls race.

**Solution:** Query DB count before INSERT; only insert if count === 0.

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

**Used in:** `useNotificationsData` when logging feeding from notification mark-done.

### Pattern 4: Pet Context Always Guarded

**Pattern:** Every screen checks `activePet` exists before proceeding.

```typescript
const { activePetId, activePet } = usePetStore(...);
const pet = activePet();
if (!pet?.id) return null;  // Guard
```

**Why:** Prevents undefined crashes; user can't always guarantee pet context exists.

### Pattern 5: FlashList Virtualization (Stale State)

**Problem:** FlashList cells reuse; if props from external hooks update, cells render stale data.

**Solution:** Resolve props immediately in parent, pass memoized values to child.

```typescript
// FeedTab.tsx
const resolvedFeedPet = useMemo(() => pets.find(p => p.id === post.pet?.id), [pets, post.pet?.id]);

return <PostCard myPet={resolvedFeedPet ?? pet} /* other props */ />;
```

**Used in:** `features/social/components/PostCard.tsx` (comment bar shows wrong pet).

---

## AI Feature Architecture

### Mood Scan (Pro+ tier, 10/day)

**Flow:**
1. User opens AI → Mood Camera
2. Takes photo
3. Photo + base64 sent to `analyze-pet-mood` edge function
4. AI returns: mood_label, scores, advice, situation
5. Result displayed on MoodResultCard
6. User can adjust mood or save

**Speed optimizations (2026-08-02):**
- `authUser` cached from store (not async `getUser()`)
- `incrementScanCount()` fires in background (don't block navigation)
- Photo upload retried if failed during analysis
- Navigate immediately after `addMoodLog()` (don't wait for count)

**Key code:**
- `features/ai/screens/MoodCameraScreen.tsx` — camera, analysis UI, save
- `features/ai/components/MoodResultCard.tsx` — result display + mood adjustment

**Scan-ready push (new 2026-08-02):**
- User navigates away mid-scan → `leftDuringScanRef = true`
- Scan finishes → fires `scheduleImmediateNotification()`
- User gets push: "X's mood scan is ready 🐾"

### Symptom Scan → Vet Chat (Ultimate tier, unlimited)

**Flow:**
1. User opens AI → Symptom Scan
2. Takes photo + describes symptoms
3. Photo + text sent to `symptom-scan` edge function
4. AI returns: urgency, summary, possible_causes, home_care, what_to_watch, confidence
5. Result displayed on ScanResultCard
6. User taps **"Ask PetDoc a follow-up"**
7. **Context silently injected** into VetChat (new 2026-08-02)
8. User types question → AI responds with scan context awareness

**Context Injection Pattern (2026-08-02):**

```typescript
// ScanResultCard.tsx — builds URL param
const ctx = encodeURIComponent(JSON.stringify({
  urgency, summary, possible_causes, home_care, what_to_watch, vet_needed, confidence
}));
router.push({ pathname: '/ai/vet-chat', params: { scan_ctx: ctx } });

// VetChatScreen.tsx — reads and injects on first send
const { scan_ctx } = useLocalSearchParams();
const scanContextRef = useRef<string | null>(null);
if (scan_ctx && !scanContextRef.current) {
  scanContextRef.current = buildHiddenPreamble(JSON.parse(decodeURIComponent(scan_ctx)));
}

// In sendMessage:
const hiddenPrefix = scanContextRef.current;
if (hiddenPrefix) scanContextRef.current = null;  // consume once
const history = [...messages, { role: 'user', text: hiddenPrefix ? `${hiddenPrefix}\n\n${text}` : text }];
```

**Result:** AI sees scan context; user only sees AI's reply (never sees hidden preamble).

### Vet Chat (Ultimate tier)

**Architecture:** Stateless, no server-side history.

**Flow:**
1. User sends message
2. App builds message history from local state (NOT from DB)
3. History + new message sent to `vet-chat` edge function
4. AI responds with full conversation context
5. Response added to local messages array

**Why stateless:**
- Simpler (no need for chat session table, just vet_chat_sessions for history display)
- Privacy (conversation never persisted on server)
- No latency fetching history on each message

**Session management:**
- First exchange creates `vet_chat_sessions` row (upsert)
- History loaded on screen enter (for this pet)
- All edits happen locally; DB row updated after each exchange

---

## Care Progress Calculation

**Problem:** Widget, Home pet card, and Care-Today all show % progress. Must be same number or users get confused.

**Solution:** Shared formula in `lib/careProgress.ts`.

```typescript
export function computeCareProgress(opts: {
  petId: string; today: string;
  checklist: Record<string, ChecklistItem[]>;
  feedingLogs: Record<string, FeedingLog[]>;
  moodLogs: Record<string, MoodLog[]>;
}): number {
  const feeds = feedingLogs[`${petId}:${today}`] ?? [];
  const items = checklist[petId] ?? [];
  const mood = moodLogs[petId]?.filter(l => l.date === today) ?? [];
  const mealFeeds = feeds.filter(f => f.meal_type !== 'water');

  let done = 0, total = 0;

  // 3 meal slots
  total += 3;
  if (mealFeeds.some(f => f.meal_type === 'breakfast' || f.meal_type === 'meal')) done++;
  if (mealFeeds.some(f => f.meal_type === 'lunch')) done++;
  if (mealFeeds.some(f => f.meal_type === 'dinner')) done++;

  // 1 mood slot
  total++;
  if (mood.length > 0) done++;

  // Checklist items
  if (items.length > 0) {
    total += items.length;
    done += items.filter(i => i.completed).length;
  }

  return done / total;
}
```

**Used by:**
- `features/care/screens/TodayScreen.tsx` — Care-Today progress ring
- `lib/hooks/useWidgetSync.ts` — Home widget progress display
- Home screen pet card — progress ring display

**Key:** If one source (feedingLogs, moodLogs, checklist) changes, ALL three surfaces update because they call the same function.

---

## Playdates Architecture

### State Machine

| State | Triggered By | Notifications |
|---|---|---|
| `request` | User A requests playdate with User B | "X wants to schedule a playdate with Y" → B |
| `accepted` | User B taps Accept | "Playdate confirmed on DATE" → both |
| `declined` | User B taps Decline | "X declined" → A |
| `proposed` | User B counter-proposes date | "X suggested DATE" → A |
| `counter_proposal` | User A counter-proposes | "X suggested DATE" → B |
| `confirmed` | Mutual acceptance | Notification to both |
| `cancelled` | Either user cancels | Notification to both |
| `rescheduled` | Date changed | Notification to both |
| `expired` | Date passed | Notification to both |
| `completed` | Cron marks as done | Notification to both |

### Pet Filter Fix (2026-08-02)

**Problem:** Switch active pet → playdate list shows entries from previous pet.

**Solution:** Clear entries + filter on pet switch.

```typescript
// MyPlaydatesScreen.tsx
useEffect(() => {
  setEntries([]);  // Clear immediately
  setFilter('all');
  if (userId) fetchPets(userId);  // Load for new pet
}, [userId, activePetId]);
```

**Also fixed:** Use cached userId (not async `getUser()`) so filter applies instantly.

---

## Known Issues & Workarounds

### Pre-Existing TypeScript Errors (Don't Fix Without Asking)

| File | Line | Error | Severity | Workaround |
|---|---|---|---|---|
| `VetChatScreen.tsx` | 298 | `.catch` does not exist on `PromiseLike<void>` | Low | No-op; non-blocking |
| `useJournalData.ts` | 31 | Expected 1 argument, got 0 | Low | No-op |
| `useHealthData.ts` | 35 | Expected 1 argument, got 0 | Low | No-op |
| `SocialScreen.tsx` | 336, 353 | `.catch` does not exist on `PromiseLike<void>` | Low | No-op |

### Cron Notification Bundling Gaps (Documented for Future Fix)

| Function | Gap | Impact | Priority |
|---|---|---|---|
| `send-appointment-reminder` | Loops per-appointment; doesn't bundle by user | User with 3 pets each having a visit gets 3 pushes (should be 1) | Medium |
| `send-birthday-memorial` | Processes per-pet; doesn't bundle | 2 birthday pets on same day = 2 pushes (should be 1) | Medium |
| `send-upgrade-nudge` | UTC cron without `localHour()` gate | Unpredictable local times (should be 10 AM local) | Medium |
| `periodic-lost-alerts` | No quiet-hours check | Fires at 3 AM if user has lost pet alert (intentional for urgency) | Low (intentional) |

### Platform-Specific Issues

| Issue | Location | Impact | Workaround |
|---|---|---|---|
| RevenueCat hardcoded to iOS | `sync-subscription` edge function | Android users sync with wrong platform | None yet; low priority |
| Yelp 500/day quota is shared | `nearby-places` edge function | If quota exhausted, all users see stale cache | None; rate-limit is global |

---

## Migration Files & Schema History

Recent migrations (in order):

1. `20260723000003_notification_fixes.sql` — Push token `UNIQUE(token)`, `notification_logs` type constraint
2. `20260729000001_notif_type_check_complete.sql` — Added missing types (family_invite_sent, appointment_complete_prompt, etc.)
3. `20260802000001_add_mood_scan_ready_type.sql` — Added `mood_scan_ready` type to constraint

---

## Summary

**Key takeaways for the next architect/reviewer:**

1. **Notifications:** Dedup via DB unique constraint + app-side guard + store cache sync
2. **Playdates:** Pet filter requires immediate clear + cached userId
3. **Mood scan:** Use cached auth + background incrementScanCount
4. **AI context:** Silently injected into first message (symptom → vet chat)
5. **Care progress:** Single formula shared across all surfaces
6. **Realtime:** Always use `loadRef` pattern to avoid stale closures
7. **State:** Zustand for global, React state for local; sync cache on mutations

All patterns documented in `FEATURE_SPECS.md` (one-page per feature) and `CLAUDE.md` (agent instructions).

---

**Maintained with ❤️ by multi-agent protocol**  
**Next update:** After next agent session
