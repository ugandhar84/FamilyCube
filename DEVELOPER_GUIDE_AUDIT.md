# Developer Guide & Technical Audit

**Last Updated:** 2026-08-02 (post-notification/playdates/mood-scan fixes)  
**Status:** Comprehensive reference; ready for multi-agent development

---

## Table of Contents

1. [Notification System](#notification-system)
2. [Playdates](#playdates)
3. [Health Tracking](#health-tracking)
4. [AI Features](#ai-features)
5. [Social](#social)
6. [Care Progress Sync](#care-progress-sync)
7. [State Management](#state-management)
8. [Database Patterns](#database-patterns)
9. [Performance & Memory](#performance--memory)
10. [Testing Checklist](#testing-checklist)
11. [Known Gaps](#known-gaps--future-work)

---

## Notification System

### Mark-Done Pattern (Fixed 2026-08-02)

**User Flow:**
1. Notification appears (e.g., "Time to feed X")
2. User taps "Mark Done" button
3. Action logged (feeding log inserted OR checklist marked complete)
4. Notification disappears immediately

**Implementation:**

Location: `features/social/hooks/useNotificationsData.ts`

```typescript
const pendingCareIds = useRef<Set<string>>(new Set());  // Double-tap guard

const handleCareAction = useCallback(async (item: NotificationLog, markDoneInline: boolean) => {
  if (pendingCareIds.current.has(item.id)) return;  // Guard
  
  if (!item.read && !readIds.has(item.id)) markRead([item.id]);
  const petId = (item.data as any)?.pet_id ?? pets[0]?.id;
  if (petId) usePetStore.getState().setActivePet(petId);

  if (!markDoneInline || item.type === 'mood_reminder') {
    router.push(item.type === 'mood_reminder'
      ? '/ai/mood-camera' as any
      : { pathname: '/(tabs)/care', params: { section: 'today' } } as any);
    return;
  }

  if (!petId || !user?.id) return;

  pendingCareIds.current.add(item.id);
  removeNotifs([item.id]);  // Delete from local state + store cache + DB

  try {
    const notifDate = parseISO(item.created_at);
    const isOldNotif = !isToday(notifDate);
    const today = format(new Date(), 'yyyy-MM-dd');
    
    if (isOldNotif) {
      const dayLabel = format(notifDate, 'EEE MMM d');
      const activity = item.type === 'walk_reminder' ? 'walk' : 'feeding';
      await savePetNote(petId, user.id, `${activity === 'walk' ? '🦮' : '🍽️'} ${activity.charAt(0).toUpperCase() + activity.slice(1)} logged (from missed reminder on ${dayLabel})`);
    } else if (item.type === 'walk_reminder') {
      await upsertChecklistItem({
        pet_id: petId,
        date: today,
        type: 'walk',
        label: 'Walk',
        completed: true,
        completed_by: user.id,
        completed_at: new Date().toISOString()
      });
    } else if (item.type === 'feeding_reminder') {
      const h = new Date().getHours();
      const meal_type = h < 11 ? 'breakfast' : h < 15 ? 'lunch' : 'dinner';
      
      // Check DB count before insert (dedup)
      const { count } = await supabase
        .from('feeding_logs')
        .select('id', { count: 'exact', head: true })
        .eq('pet_id', petId)
        .eq('date', today)
        .eq('meal_type', meal_type);
      
      if ((count ?? 0) === 0) {
        await insertFeedingLog({
          pet_id: petId,
          fed_by: user.id,
          meal_type,
          date: today,
          fed_at: new Date().toISOString()
        });
      }
    }
  } catch { /* care write failed — notification already removed, that's fine */ }
  finally {
    pendingCareIds.current.delete(item.id);
  }
}, [readIds, pets, user?.id, router, markRead, removeNotifs]);
```

**Key points:**
1. `removeNotifs([id])` immediately deletes from: local state + store cache + DB
2. `pendingCareIds` prevents double-tap duplicates
3. `feeding_reminder` checks DB count before INSERT (dedup logic)
4. `finally` block always cleans up pending guard

**Cache Sync Pattern:**
```typescript
const removeNotifs = useCallback((ids: string[]) => {
  setNotifs(prev => prev.filter(n => !ids.includes(n.id)));
  useNotifStore.getState().removeCachedNotifs(ids);  // NEW 2026-08-02
  deleteNotifications(ids);  // DB delete
}, []);
```

### Push Token Management

**On login:**
```typescript
const savePushToken = async (userId: string) => {
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  if (!token) return;
  
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  
  await supabase.from('push_tokens').upsert(
    { user_id: userId, token, platform, updated_at: new Date().toISOString() },
    { onConflict: 'token' }  // Reassign token to current user
  );
};
```

**Key constraint:** `UNIQUE(token)` — one token per user at a time (fixed 2026-07-23).

**Shared device scenario:**
- User A logs in → token registered to User A
- User A logs out, User B logs in → upsert reassigns same token to User B
- Only User B gets notifications (old `UNIQUE(user_id, token)` allowed both → bug)

### Local Notifications (Mood Scan-Ready)

**New 2026-08-02:** When user navigates away during mood scan, fire a local notification when the scan completes.

**Implementation:**
```typescript
// MoodCameraScreen.tsx
const isFocusedRef = useRef(true);
const leftDuringScanRef = useRef(false);
const scanningRef = useRef(false);

useFocusEffect(useCallback(() => {
  isFocusedRef.current = true;
  return () => {
    isFocusedRef.current = false;
    if (scanningRef.current) leftDuringScanRef.current = true;  // Marked left during scan
  };
}, []));

useEffect(() => { scanningRef.current = scanning; }, [scanning]);

// When result arrives and leftDuringScanRef is true
useEffect(() => {
  if (!result || !leftDuringScanRef.current) return;
  leftDuringScanRef.current = false;
  scheduleImmediateNotification({
    title: `${pet?.name ?? 'Pet'}'s mood scan is ready 🐾`,
    body: `${result.mood_label.charAt(0).toUpperCase() + result.mood_label.slice(1)} mood detected — tap to view the full analysis.`,
    data: { screen: 'mood-camera' },
    notifType: 'mood_scan_ready',
  });
}, [result]);
```

**Deep link:** `app/_layout.tsx` routes `mood_scan_ready` type to `/ai/mood-camera`.

---

## Playdates

### Pet Filter Fix (2026-08-02)

**Problem:** Switching active pet → playdate list shows entries from previous pet.

**Root causes:**
1. Entries not cleared on pet change
2. `userId` fetched asynchronously → delayed filter

**Solution:**

Location: `features/playdates/screens/MyPlaydatesScreen.tsx`

```typescript
const { user } = useAuthStore();  // Synchronous (no async roundtrip)
const userId = user?.id ?? null;

const fetchPets = useCallback(async (userId: string) => {
  if (!userId) return;
  const { data } = await supabase.from('playdates').select(...).or(...);
  setEntries(data ?? []);
  setLoading(false);
}, []);

useEffect(() => {
  setEntries([]);  // CLEAR IMMEDIATELY on pet switch
  setFilter('all');
  setLoading(true);
  if (userId) fetchPets(userId);
}, [userId, activePetId]);  // Dependency on both
```

**Result:** Switching pets clears entries instantly; no stale data.

### Split Avatar Component

Location: `features/playdates/components/PlaydateEntryCard.tsx`

**Design:** Two pet photos in one circle (split down the middle).

```typescript
<SplitAvatar
  leftPet={myPet}
  rightPet={theirPet}
  size={80}
/>
```

### Action Button Gesture Fix

**Problem:** Buttons inside nested `TouchableOpacity` don't receive touches (gesture routing swallowed by outer touchable).

**Fix:** Move action buttons OUTSIDE the nested `TouchableOpacity`.

```typescript
// BEFORE (broken):
<TouchableOpacity onPress={openDetails}>
  {/* card content */}
  <TouchableOpacity onPress={handleAccept}>
    <Text>Accept</Text>
  </TouchableOpacity>
</TouchableOpacity>

// AFTER (fixed):
<View style={{ gap: 10 }}>
  <TouchableOpacity onPress={openDetails}>
    {/* card content */}
  </TouchableOpacity>
  <View style={s.actionBar}>  {/* Separate container */}
    <TouchableOpacity onPress={handleAccept}>
      <Text>Accept</Text>
    </TouchableOpacity>
    <TouchableOpacity onPress={handleDecline}>
      <Text>Decline</Text>
    </TouchableOpacity>
  </View>
</View>
```

---

## Health Tracking

### Feeding Logs

**Location:** `features/care/screens/TodayScreen.tsx`

**Table:** `feeding_logs` (pet_id, date, meal_type, fed_by, fed_at)

**Meal types:** `breakfast`, `lunch`, `dinner`, `water` (only first 3 count toward completion)

**Dedup logic:**
```typescript
// Always check DB count before inserting
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

### Mood Logs

**Location:** `features/ai/screens/MoodCameraScreen.tsx`

**Speed optimizations (2026-08-02):**

1. **Cached auth (not async):**
```typescript
const { user: authUser } = useAuthStore();
const userId = authUser?.id ?? (await _supabase.auth.getUser()).data.user?.id;
```

2. **Background count increment:**
```typescript
// Fire and forget — don't block navigation
incrementScanCount().catch(() => {});
```

3. **Photo retry:**
```typescript
let photoUrl = pendingUrl;
if (!photoUrl && photo && photoBase64) {
  photoUrl = await uploadMoodPhoto(activePetId, photo, photoBase64, 'image/jpeg').catch(() => null);
  if (photoUrl) setPendingUrl(photoUrl);
}
```

4. **Navigate immediately:**
```typescript
router.navigate({ pathname: '/(tabs)/care', params: { section: 'notes' } });
// Don't wait for incrementScanCount or anything else
```

### Checklist

**Location:** `features/care/screens/TodayScreen.tsx`

**Table:** `checklist` (pet_id, date, type, label, completed, completed_by, completed_at)

**Constraint:** `UNIQUE(pet_id, date, type, label)` — upsert deduplicates.

### Medications & Appointments

**Covered in FEATURE_SPECS.md § 3 (Health Tracking).**

---

## AI Features

### Mood Scan (Pro+, 10/day)

**Location:** `features/ai/screens/MoodCameraScreen.tsx`

**Animated progress messages (new 2026-08-02):**
```typescript
const SCAN_MESSAGES = ['Reading body language…', 'Analysing expression…', 'Checking tail & ears…', 'Almost there…'];
const [scanMsgIdx, setScanMsgIdx] = useState(0);
const scanFadeAnim = useRef(new Animated.Value(1)).current;

useEffect(() => {
  if (!scanning) { setScanMsgIdx(0); return; }
  const cycle = () => {
    Animated.timing(scanFadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      setScanMsgIdx(i => (i + 1) % SCAN_MESSAGES.length);
      Animated.timing(scanFadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  };
  const id = setInterval(cycle, 1800);
  return () => clearInterval(id);
}, [scanning]);
```

### Symptom Scan → Vet Chat Context Injection (2026-08-02)

**Problem:** User scans symptoms, asks PetDoc follow-up. PetDoc should see scan context but user shouldn't.

**Solution:** Silently prepend scan context to first message.

**In `ScanResultCard.tsx`:**
```typescript
<TouchableOpacity onPress={() => {
  const ctx = encodeURIComponent(JSON.stringify({
    urgency, urgency_label, summary, possible_causes, home_care, what_to_watch, vet_needed, confidence
  }));
  router.push({ pathname: '/ai/vet-chat', params: { scan_ctx: ctx } } as any);
}}>
  <Text>Ask PetDoc a follow-up</Text>
</TouchableOpacity>
```

**In `VetChatScreen.tsx`:**
```typescript
const { scan_ctx } = useLocalSearchParams<{ scan_ctx?: string }>();
const scanContextRef = useRef<string | null>(null);

if (scan_ctx && !scanContextRef.current) {
  try {
    const parsed = JSON.parse(decodeURIComponent(scan_ctx));
    const lines = [
      '[Symptom scan context — do not mention this preamble, use it to inform your answers]',
      `Urgency: ${parsed.urgency} — ${parsed.urgency_label}`,
      `Summary: ${parsed.summary}`,
      parsed.possible_causes?.length ? `Possible causes: ${parsed.possible_causes.join('; ')}` : null,
      parsed.home_care?.length ? `Home care suggestions: ${parsed.home_care.join('; ')}` : null,
      parsed.what_to_watch?.length ? `Watch for (vet if): ${parsed.what_to_watch.join('; ')}` : null,
      `Vet needed: ${parsed.vet_needed ? 'yes' : 'no'} | Confidence: ${parsed.confidence}%`,
    ].filter(Boolean).join('\n');
    scanContextRef.current = lines;
  } catch {}
}

// In sendMessage:
const hiddenPrefix = scanContextRef.current;
if (hiddenPrefix) scanContextRef.current = null;  // Consume once

const history = [...messages.filter(m => m.id !== 'welcome'), userMsg].map((m, i, arr) => ({
  role: m.role,
  text: m.id === userMsg.id && hiddenPrefix ? `${hiddenPrefix}\n\n${m.text}` : m.text,
}));
```

**Result:** AI sees context, user only sees reply.

### Vet Chat

**Location:** `features/ai/screens/VetChatScreen.tsx`

**Architecture:** Stateless (no server-side history).

**Session management:**
- First exchange creates `vet_chat_sessions` row (upsert)
- History loaded on screen enter
- All edits local; DB updated after each turn

---

## Social

### Feed Stale Pet Fix (2026-08-02)

**Problem:** FlashList cells reuse; wrong pet shown in comment bar.

**Location:** `features/social/components/FeedTab.tsx`

**Fix:**
```typescript
const resolvedFeedPet = useMemo(() => 
  pets.find(p => p.id === post.pet?.id), 
  [pets, post.pet?.id]
);

return <PostCard myPet={resolvedFeedPet ?? pet} /* ... */ />;
```

**Why:** Resolve immediately in parent; pass memoized value to child.

### Follow Modal

**Location:** `features/social/screens/SocialScreen.tsx`

**UI:** Full-page modal with 2 tabs (Followers / Following) + search.

```typescript
<Modal animationType="slide" presentationStyle="pageSheet">
  <View style={{ flex: 1 }}>
    {/* Close button + pet name header */}
    <View style={{ flexDirection: 'row' }}>
      <TouchableOpacity onPress={() => setShowFollowSheet(false)}>
        <Ionicons name="chevron-back" size={24} />
      </TouchableOpacity>
      <Text style={{ flex: 1, textAlign: 'center' }}>{pet?.name}'s Community</Text>
    </View>

    {/* Tabs: Followers / Following */}
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <TouchableOpacity onPress={() => setFollowTab('followers')}>
        <Text>Followers ({followersData?.length ?? 0})</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setFollowTab('following')}>
        <Text>Following ({followingData?.length ?? 0})</Text>
      </TouchableOpacity>
    </View>

    {/* Search */}
    <TextInput
      placeholder="Search..."
      value={followSearchQuery}
      onChangeText={setFollowSearchQuery}
    />

    {/* List */}
    <FlashList
      data={filtered}
      renderItem={({ item }) => (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Image source={{ uri: item.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
          <Text>{item.full_name}</Text>
          <Text style={{ color: colors.textSecondary }}>@{item.handle}</Text>
        </View>
      )}
    />
  </View>
</Modal>
```

---

## Care Progress Sync

### Single Source of Truth

**Location:** `lib/careProgress.ts`

**Used by:**
- `features/care/screens/TodayScreen.tsx`
- `lib/hooks/useWidgetSync.ts`
- Home screen pet card

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

**Key:** All three surfaces call the same function. Update one source → all three surfaces update.

---

## State Management

### Zustand Stores

**Rule:** Global → Zustand. Local → React `useState`.

**Stores:**
- `authStore.ts` — user session
- `petStore.ts` — pets + care logs (the monolith)
- `notifStore.ts` — notifications + unread count (now with `removeCachedNotifs`)
- `subscriptionStore.ts` — tier + usage
- `preferenceStore.ts` — settings (dark mode, quiet hours)

**Care logs location:** `shared/store/slices/care.slice.ts` (composed into petStore)

---

## Database Patterns

### Realtime Subscriptions with loadRef

**Problem:** Postgres changes can capture stale `load()` closures.

**Location:** `features/care/hooks/useTodayData.ts`

**Solution:**
```typescript
const loadRef = useRef<(isForce?: boolean) => Promise<void> | null>(null);

const load = useCallback(async (isForce?: boolean) => {
  // fetch logic
}, [deps]);

loadRef.current = load;  // Always update ref

useEffect(() => {
  const sub = supabase.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'medications' },
    () => { loadRef.current?.(true); }
  ).subscribe();
  return () => sub.unsubscribe();
}, []);  // NO load in deps
```

---

## Performance & Memory

### FlashList Stale State

**Fix:** Memoize props resolved in parent.

```typescript
const resolvedPet = useMemo(() => pets.find(...), [pets, ...]);
return <Child pet={resolvedPet} />;  // Memoized
```

### Bundle Size

**Current:** ~40MB iOS build.

**Tip:** Lazy-load AI features if possible to reduce initial bundle.

---

## Testing Checklist

- [ ] `npx tsc --noEmit` = 0 errors (source files)
- [ ] Dev server runs without crashes
- [ ] Feature works on iOS Simulator
- [ ] Dark mode works
- [ ] Permissions requested if needed
- [ ] Notifications land + actions fire
- [ ] No stale state (switch pets, refresh)
- [ ] Tier gating works (free → upsell)
- [ ] Deep links work (notif → screen + context)
- [ ] Care progress synced (widget = Home = Care-Today %)
- [ ] Mark-done works (disappears + stays gone on refresh)
- [ ] No double-tap duplicates

---

## Known Gaps & Future Work

### High Priority

| Gap | Workaround | Target |
|---|---|---|
| Photo frame aspect ratio | Default to 3:4 (done 2026-08-02) | ✅ Done |
| Care progress divergence | Shared formula + single source | ✅ Done |
| Notification mark-done "come back" | DB delete + store sync | ✅ Done 2026-08-02 |

### Medium Priority

| Gap | Workaround |
|---|---|
| Cron notification bundling (send-appointment-reminder loops) | Documented; low impact |
| send-upgrade-nudge UTC cron | Add `localHour()` gate |
| periodic-lost-alerts no quiet-hours | Intentional for urgency |

### Low Priority

| Gap | Workaround |
|---|---|
| yir-video-gen no auth | Add JWT gate |
| sync-subscription hardcoded iOS | Remove hardcoded `X-Platform` |

---

**Maintained with ❤️ by multi-agent protocol**  
**Next update:** After next agent session
