# Family Cube — Detailed Implementation Specifics

**Last Updated:** 2026-08-27  
**Purpose:** Deep-dive into every implementation detail, code patterns, state flows, and minute technical decisions  
**Scope:** Complements ARCHITECTURE.md with line-by-line specifics

---

## Table of Contents

1. [Root Layout & Initialization](#root-layout--initialization)
2. [PIN Entry Modal & Profile Switching](#pin-entry-modal--profile-switching)
3. [Zustand Stores (Complete Interfaces)](#zustand-stores-complete-interfaces)
4. [Edge Functions (Implementation Details)](#edge-functions-implementation-details)
5. [Real-Time Subscription Patterns](#real-time-subscription-patterns)
6. [Notification & Background Processing](#notification--background-processing)
7. [Authentication Flows (Minute Details)](#authentication-flows-minute-details)
8. [Storage & Media Upload Patterns](#storage--media-upload-patterns)
9. [Theme & Color Usage](#theme--color-usage)
10. [Error Handling & Fallbacks](#error-handling--fallbacks)
11. [Database Queries & RLS](#database-queries--rls)
12. [Performance Optimizations](#performance-optimizations)

---

## Root Layout & Initialization

### `app/_layout.tsx` (956 lines)

#### Boot Sequence (Lines 1-100)

**1. Module Load (Lines 1-72)**
- Imports all global context providers, stores, and initialization functions
- Suppresses console.log in production (`!__DEV__`)
- Ignores known non-critical warnings via `LogBox.ignoreLogs()`:
  - `react-native-compressor` NativeEventEmitter warning (dev builds without this package linked)
  - RevenueCat offering fetch errors (network-dependent, handled via fallback)
  - Network errors (shown via `OfflineBanner` instead)

**2. RootNavigator Component (Lines 75-150)**

```typescript
function RootNavigator() {
  // State guards (refs, not state — persists across re-renders):
  const navigated = useRef(false);           // Prevents router.replace firing >1x
  const bootCompleted = useRef(false);       // Blocks onAuthStateChange during initial boot
  const pendingWidgetTap = useRef(false);    // Widget deeplink tracking
  const bootTime = useRef(Date.now()).current;
  const profileCheckSeq = useRef(0);         // Monotonic guard against racing profile checks

  // State (updates trigger re-renders):
  const [checked, setChecked] = useState(false);  // Splash screen → home transition trigger

  const { setSession } = useAuthStore();
  const { colors, isDark } = useTheme();
}
```

**Why Refs Instead of State for Navigation Guards:**
- `useRef` persists across renders without triggering re-renders (avoids effect loops)
- Navigation decisions must fire exactly once per scenario (boot, auth change)
- State would cause effect re-runs, potentially firing multiple `router.replace()`

#### Session Restore (Lines 150-250)

```typescript
// On mount: restore session from Supabase real-time listener
useEffect(() => {
  const bootSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        setSession(session);
        bootCompleted.current = true;
        // Fetch family → determine if onboarding or tabs
      } else {
        // No session → redirect to auth stack
        navigated.current = true;
        router.replace('/(auth)/login');
      }
    } catch (err) {
      dbgError(TAG, 'Session restore failed', err);
    } finally {
      setChecked(true);  // Splash → home
    }
  };
  bootSession();
}, []);

// Monitor real-time auth state changes (separate from boot)
supabase.auth.onAuthStateChange((event, session) => {
  if (!bootCompleted.current) return;  // Block during initial boot
  if (event === 'SIGNED_IN' && session) {
    setSession(session);
    if (!navigated.current) {
      navigated.current = true;
      router.replace('/(tabs)');
    }
  } else if (event === 'SIGNED_OUT') {
    setSession(null);
    if (!navigated.current) {
      navigated.current = true;
      router.replace('/(auth)/login');
    }
  }
});
```

#### Family Load Check (Lines 250-350)

```typescript
// After session exists, check if family data is loaded
useEffect(() => {
  if (!checked || !setSession.session?.user?.id) return;

  const checkFamily = async () => {
    const { data: familyData } = await supabase
      .from('members')
      .select('family_id')
      .eq('auth_user_id', setSession.session.user.id)
      .maybeSingle();

    if (!familyData?.family_id) {
      // No family yet → onboarding (create new or join via code)
      router.replace('/onboarding');
    } else {
      // Family exists → load tabs
      router.replace('/(tabs)');
    }
  };
  checkFamily();
}, [checked]);
```

#### AppState Listener (Background to Foreground)

```typescript
const appState = useRef(AppState.currentState);

useEffect(() => {
  const sub = AppState.addEventListener('change', handleAppState);
  return () => sub.remove();
}, []);

const handleAppState = async (nextAppState: string) => {
  if (appState.current === 'background' && nextAppState === 'active') {
    // App came to foreground
    // → Refresh subscription state (RevenueCat)
    // → Re-sync real-time channels (connection may have dropped)
    // → Poll for new notifications
    const customerInfo = await Purchases.getCustomerInfo();
    useSubscriptionStore.setState({
      isSubscribed: !!customerInfo.entitlements.active['premium'],
    });
  }
  appState.current = nextAppState;
};
```

#### Widget Integration

```typescript
useWidgetSync();  // Syncs app state to iOS widget (Live Activity, Lock Screen widget)
// Real-time subscription to family data → widget displays live info
```

#### Initialization Order Summary

```
Module Load
  ↓
App Boot (RootNavigator mounts)
  ↓
Restore Session from Supabase
  ↓
Initialize RevenueCat (subscription state)
  ↓
Listen for Real-Time Auth Changes
  ↓
Check Family Exists
  ↓
Route to /(auth)/login OR /onboarding OR /(tabs)
  ↓
Mount Bottom Tabs (if in tabs)
  ↓
Initialize Real-Time Subscriptions (members, quests, messages, etc.)
  ↓
Enable AppState Listener (background/foreground transitions)
  ↓
Splash screen hidden, app ready
```

---

## PIN Entry Modal & Profile Switching

### `components/PinEntryModal.tsx` (303 lines)

#### Constants & Configuration

```typescript
const PIN_LENGTH = 4;                   // Fixed 4-digit PIN
const MAX_ATTEMPTS = 5;                 // Lockout after 5 wrong tries
const LOCKOUT_SECONDS = 30;             // 30-second lockout timer

const KEYS = [
  ['1','2','3'],
  ['4','5','6'],
  ['7','8','9'],
  ['','0','⌫'],  // Empty string for spacing, ⌫ for backspace
];
```

#### State Management

```typescript
interface PinEntryModalProps {
  visible: boolean;
  member: FamilyMember | null;          // Target member (role, PIN, emoji)
  onSuccess: (member: FamilyMember) => void;  // Callback after correct PIN
  onCancel: () => void;                 // Dismiss modal
}

// Local state:
const [entered, setEntered] = useState('');              // Current digits (0-4 chars)
const [attempts, setAttempts] = useState(0);             // Failed attempts (0-5)
const [locked, setLocked] = useState(false);             // Locked after MAX_ATTEMPTS
const [lockRemaining, setLockRemaining] = useState(0);   // Countdown timer (30 → 0)
const [errorMsg, setErrorMsg] = useState('');            // Error display text

// Animated refs:
const shakeAnim = useRef(new Animated.Value(0)).current; // Shake animation value
const lockInterval = useRef<ReturnType<typeof setInterval> | null>(null);  // Lockout timer
```

#### PIN Verification Flow

```typescript
// Auto-verify when 4 digits entered (useEffect)
useEffect(() => {
  if (entered.length < PIN_LENGTH || !member) return;
  
  const correct = member.pin === entered;
  if (correct) {
    onSuccess(member);           // Call parent callback → setActiveMember(memberId)
    setEntered('');              // Clear for next use
    setAttempts(0);
    setErrorMsg('');
  } else {
    const next = attempts + 1;
    setAttempts(next);
    
    // Update error message with remaining attempts
    const errorMsg = next >= MAX_ATTEMPTS
      ? `Too many attempts. Try again in ${LOCKOUT_SECONDS}s`
      : `Wrong PIN · ${MAX_ATTEMPTS - next} attempt${MAX_ATTEMPTS - next === 1 ? '' : 's'} left`;
    
    shakeAndClear(errorMsg);      // Shake + vibrate + clear input
    
    if (next >= MAX_ATTEMPTS) {
      setLocked(true);            // Trigger lockout
    }
  }
}, [entered]);  // Re-run when entered changes
```

#### Lockout Countdown (useEffect)

```typescript
useEffect(() => {
  if (!locked) return;
  
  setLockRemaining(LOCKOUT_SECONDS);
  lockInterval.current = setInterval(() => {
    setLockRemaining(prev => {
      if (prev <= 1) {
        clearInterval(lockInterval.current!);
        setLocked(false);        // Unlock
        setAttempts(0);          // Reset attempts
        setEntered('');          // Clear input
        setErrorMsg('');
        return 0;
      }
      return prev - 1;
    });
  }, 1000);  // Decrement every second
  
  return () => {
    if (lockInterval.current) clearInterval(lockInterval.current);
  };
}, [locked]);
```

#### Shake Animation

```typescript
const shakeAndClear = (msg: string) => {
  Vibration.vibrate(400);  // Device haptic feedback
  setErrorMsg(msg);
  
  // Sequence of tiny left/right movements (12px → -12px → 8px → -8px → 0)
  Animated.sequence([
    Animated.timing(shakeAnim, { toValue: 12,  duration: 60, useNativeDriver: true }),
    Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
    Animated.timing(shakeAnim, { toValue: 8,   duration: 60, useNativeDriver: true }),
    Animated.timing(shakeAnim, { toValue: -8,  duration: 60, useNativeDriver: true }),
    Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
  ]).start(() => setEntered(''));  // After shake completes, clear input
};
```

#### UI Rendering

```typescript
// PIN dots (filled = entered, empty = remaining)
<PinDots 
  entered={entered.length}   // 0-4
  shaking={shakeAnim}        // Animated.Value
  color={member.role === 'parent' ? colors.parent : colors.kid}
/>

// Error message (shown below dots)
{errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

// Numeric keypad (4 rows × 3 keys)
{KEYS.map((row, ri) => (
  <View key={ri} style={styles.padRow}>
    {row.map((key, ki) => (
      <Key
        key={ki}
        label={key}
        onPress={() => handleKey(key)}
        disabled={locked || entered.length >= PIN_LENGTH}  // Disable if locked or full
      />
    ))}
  </View>
))}

// Hint (static, always visible)
<Text>Forgot PIN? Ask a parent to reset it in Settings.</Text>
```

#### Key Press Handler

```typescript
const handleKey = (key: string) => {
  if (locked) return;  // Ignore all presses if locked
  
  if (key === '⌫') {
    setEntered(p => p.slice(0, -1));  // Remove last digit
    if (errorMsg) setErrorMsg('');     // Clear error message on edit
  } else if (entered.length < PIN_LENGTH) {
    setEntered(p => p + key);          // Add digit
  }
};
```

#### Modal Lifecycle

```typescript
// Reset state when modal opens (new member targeted)
useEffect(() => {
  if (visible) {
    setEntered('');
    setAttempts(0);
    setLocked(false);
    setLockRemaining(0);
    setErrorMsg('');
    if (lockInterval.current) clearInterval(lockInterval.current);
  }
}, [visible, member?.id]);  // Triggers on open OR member change
```

#### Presentation

```tsx
<Modal
  visible={visible}
  animationType="slide"           // Slide up from bottom
  presentationStyle="pageSheet"   // iOS: sheet style (partial height initially, expandable)
  onRequestClose={onCancel}       // Android back button
>
  <View style={[styles.sheet, { backgroundColor: isDark ? colors.surface : colors.background }]}>
    {/* Header with Cancel button */}
    {/* Member avatar + name + role */}
    {/* PIN dots */}
    {/* Error message */}
    {/* Numeric keypad */}
    {/* Forgot PIN hint */}
  </View>
</Modal>
```

---

## Zustand Stores (Complete Interfaces)

### `store/familyStore.ts`

#### FamilyMember Full Interface

```typescript
export interface FamilyMember {
  id: string;
  name: string;
  role: 'parent' | 'kid' | 'teen' | 'senior';    // RBAC role
  subRole?: string;                              // Display label ('Dad', 'Mom')
  relationship?: string;                         // Descriptive ('Mother', 'Stepson')
  emoji?: string;                                // Avatar (if emoji)
  avatarUrl?: string;                            // Avatar (if photo URL)
  coins: number;                                 // Kid reward balance
  mainCoins: number;                             // Parent wallet (Perks Store)
  gpCoins: number;                               // Grandparent sub-wallet
  xp: number;                                    // Total experience points
  streak: number;                                // Consecutive days active
  level: number;                                 // Gamification level (1-100?)
  questsCompleted: number;                       // Lifetime quests approved
  questsPending: number;                         // Active assignments
  
  // Device-level switching
  pin?: string;                                  // 4-digit (plain text, no hash)
  pinEnabled?: boolean;                          // Is PIN required for this member?
  
  // Family context
  familyId?: string;
  
  // Teen-specific (ride/gig economy)
  hasCar?: boolean;                              // Can this teen take requests?
  rideEarningsPerRun?: number;                   // Coins per pickup run
  groceryEarningsPerRun?: number;                // Coins per grocery run
  
  // Senior/Grandparent preferences (persisted)
  gpCheerleaderMode?: boolean;                   // Hide driving requests
  gpDriveWindowDays?: number[];                  // 0=Sun, 1=Mon, ... 6=Sat
  gpDriveWindowStart?: string;                   // 'HH:MM' 24-hour
  gpDriveWindowEnd?: string;                     // 'HH:MM' 24-hour
  gpWeeklyRideCap?: number;                      // Max rides per calendar week
  linkedParentId?: string;                       // Which parent this GP belongs to
  
  // Feature flags per member
  storeProximityRemindersEnabled?: boolean;      // Geofenced "near store" reminder
  
  // Savings goal (Perks Store)
  goalRewardId?: string;                         // Chosen Reward they're saving for
  
  // Profile completeness
  dateOfBirth?: string;                          // 'YYYY-MM-DD' (optional)
  
  // UI state
  lastCelebrationSeenAt?: string;                // Watermark for celebration animations
  pillOrder?: string[];                          // Quick-access pill row order (Hub)
  
  // Auth state
  authUserId?: string;                           // If they have independent auth
}
```

#### Store State & Methods

```typescript
interface FamilyState {
  members: FamilyMember[];
  activeMemberId: string | null;
  familyId: string | null;
  
  // Sync from DB
  init: () => Promise<void>;
  
  // Profile switching
  setActiveMember: (id: string) => void;
  
  // Member updates
  setMemberPin: (id: string, pin: string, enabled: boolean) => Promise<void>;
  addMember: (member: FamilyMember) => void;
  updateMember: (id: string, updates: Partial<FamilyMember>) => void;
  deleteMember: (id: string) => void;
  
  // On logout
  reset: () => void;
}
```

#### Init Function Flow

```typescript
const init = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  
  // Fetch all members this user can see (scoped by family_id)
  const { data: members } = await supabase
    .from('members')
    .select('*')
    .eq('family_id', user.user_metadata.family_id);  // RLS enforces this
  
  if (members) {
    const parsed = members.map(m => fromRow(m));  // DB row → FamilyMember interface
    setState({
      members: dedupeMembers(parsed),
      familyId: members[0]?.family_id,
    });
    
    // Set first parent as active (or first member if no parents)
    const firstParent = parsed.find(m => m.role === 'parent');
    setState({ activeMemberId: firstParent?.id ?? parsed[0]?.id });
  }
  
  // Start real-time subscription
  ensureRealtime(familyId, setState, getState);
};
```

#### Real-Time Subscription Pattern

```typescript
let _rtChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtFamilyId = '';

function ensureRealtime(
  familyId: string,
  setState: (s: Partial<FamilyState>) => void,
  getState: () => FamilyState,
) {
  if (_rtFamilyId === familyId && _rtChannel) return; // Already subscribed
  
  // Clean up stale channel from dev hot-reload
  if (_rtChannel) supabase.removeChannel(_rtChannel);
  const staleTopic = `realtime:members:${familyId}`;
  supabase.getChannels()
    .filter(c => c.topic === staleTopic)
    .forEach(c => supabase.removeChannel(c));
  
  _rtFamilyId = familyId;
  _rtChannel = supabase
    .channel(`members:${familyId}`)
    .on('postgres_changes', {
      event: '*',                              // INSERT | UPDATE | DELETE
      schema: 'public',
      table: 'members',
      filter: `family_id=eq.${familyId}`,      // RLS filters further
    }, ({ eventType, new: newRow, old: oldRow }) => {
      const state = getState();
      if (eventType === 'INSERT') {
        const member = fromRow(newRow);
        setState({ members: [...state.members, member] });
      } else if (eventType === 'UPDATE') {
        setState({
          members: state.members.map(m =>
            m.id === newRow.id ? fromRow(newRow) : m
          ),
        });
      } else if (eventType === 'DELETE') {
        setState({
          members: state.members.filter(m => m.id !== oldRow.id),
        });
      }
    })
    .subscribe((status) => {
      console.log(`realtime members:${familyId} = ${status}`);
    });
}
```

### `store/choreStore.ts` (Quests/Chores)

#### Chore Interface

```typescript
export interface Chore {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  assignedTo: string;        // member_id (who does this chore)
  createdBy: string;         // member_id (parent who assigned it)
  status: 'assigned' | 'claimed' | 'submitted' | 'approved' | 'rejected';
  dueDate?: string;          // 'YYYY-MM-DD'
  dueTime?: string;          // 'HH:MM' 24-hour
  reward: number;            // Coins awarded on approval
  repeatPattern: 'once' | 'daily' | 'weekly' | 'monthly';
  repeatsEvery?: number;     // Interval (e.g., 'every 2 weeks')
  customNotes?: string;      // Parent notes on approval/rejection
  createdAt: string;         // ISO 8601
  updatedAt: string;
  deletedAt?: string;        // Soft-delete
  
  // Computed locally (not from DB)
  displayDueDate?: Date;     // Parsed dueDate + dueTime into Date object
  isOverdue?: boolean;       // dueDate < today && status != 'approved'
  isToday?: boolean;         // dueDate === today
}
```

#### Store Methods

```typescript
interface ChoreStore {
  chores: Chore[];
  
  // CRUD
  addChore: (chore: Chore) => Promise<void>;
  updateChore: (id: string, updates: Partial<Chore>) => Promise<void>;
  deleteChore: (id: string) => Promise<void>;  // Soft-delete
  
  // Status transitions
  claimChore: (id: string) => Promise<void>;       // assigned → claimed
  submitChore: (id: string) => Promise<void>;      // claimed → submitted
  approveChore: (id: string) => Promise<void>;     // submitted → approved + award coins
  rejectChore: (id: string, reason?: string) => Promise<void>;  // submitted → assigned + note reason
  
  // Filters (computed)
  getChoresForMember: (memberId: string) => Chore[];
  getChoresForToday: () => Chore[];
  getOverdueChores: () => Chore[];
  getPendingApprovals: () => Chore[];  // status === 'submitted'
}
```

#### Approve Chore Flow

```typescript
const approveChore = async (choreId: string) => {
  const chore = getState().chores.find(c => c.id === choreId);
  if (!chore) throw new Error('Chore not found');
  
  // 1. Update chore status
  await supabase
    .from('chores')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', choreId);
  
  // 2. Award coins (insert into point_transactions)
  await supabase
    .from('point_transactions')
    .insert({
      member_id: chore.assignedTo,
      family_id: chore.familyId,
      type: 'chore_approved',
      points: chore.reward,
      reference_id: choreId,
    });
  
  // 3. Update local state
  setState({
    chores: state.chores.map(c =>
      c.id === choreId ? { ...c, status: 'approved' } : c
    ),
  });
  
  // Real-time subscription auto-syncs to kid's device
};
```

### `store/eventStore.ts` (Calendar)

#### Event Interface

```typescript
export interface CalendarEvent {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  eventType: 'appointment' | 'birthday' | 'holiday' | 'school' | 'trip' | 'family';
  color: string;                                // Hex from brand palette
  startAt: string;                              // ISO 8601 with timezone
  endAt: string;
  reminder: {
    type: 'none' | 'notification' | 'call';    // Delivery mechanism
    minutesBefore?: number;                     // When to send (e.g., 30 min before)
  };
  repeatPattern: 'never' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  attendees: string[];                          // member_id[]
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  
  // Computed
  isAllDay?: boolean;                           // No start/end time
  isUpcoming?: boolean;                         // startAt > now
  isPast?: boolean;                             // endAt < now
  daysUntil?: number;                           // Days from today
}
```

#### Store Methods

```typescript
interface EventStore {
  events: CalendarEvent[];
  selectedDate: Date | null;
  
  addEvent: (event: CalendarEvent) => Promise<void>;
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  
  // Filters
  getEventsForDay: (date: Date) => CalendarEvent[];
  getEventsForWeek: (weekStart: Date) => CalendarEvent[];
  getUpcomingEvents: (days?: number) => CalendarEvent[];
  getBirthdays: () => CalendarEvent[];
  
  setSelectedDate: (date: Date | null) => void;
}
```

#### VoIP Call Reminder Implementation

```typescript
// Reminder dispatch flow (background job runs periodically)
async function dispatchReminders() {
  const now = new Date();
  
  // Find events with call reminders due in next 5 minutes
  const dueSoon = events.filter(e => {
    const triggerTime = new Date(e.startAt);
    triggerTime.setMinutes(triggerTime.getMinutes() - e.reminder.minutesBefore);
    return Math.abs(now - triggerTime) < 5 * 60 * 1000;  // Within 5 min window
  });
  
  for (const event of dueSoon) {
    // Initiate VoIP call via native module
    const callPayload = {
      eventId: event.id,
      title: event.title,
      type: event.eventType,
      notes: event.description,
      startTime: event.startAt,
    };
    
    await RNCallKeep.displayIncomingCall(
      event.id,  // callUUID
      `${event.title} Reminder`,  // caller name
      true,      // hasVideo
      callPayload
    );
  }
}

// App-side: when user picks up the call
const handleCallConnected = async (callUUID: string) => {
  const event = events.find(e => e.id === callUUID);
  if (!event) return;
  
  // Speak reminder via native AVSpeechSynthesizer
  const dayPart = getDayPartPhrase(new Date(event.startAt));
  const greeting = `Get ready for ${event.title}, ${dayPart}`;
  
  // Build full utterance
  const utterances = [
    greeting,
    ...(event.description ? [`One more thing — ${event.description}`] : []),
  ];
  
  for (const msg of utterances) {
    await speakMessage(msg, 0.5);  // 0.5 sec pause between utterances
  }
  
  // After speaking, hang up automatically (user can also dismiss)
  setTimeout(() => RNCallKeep.endCall(callUUID), 5000);
};

// dayPartPhrase utility
function getDayPartPhrase(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'this morning';
  if (hour >= 12 && hour < 17) return 'this afternoon';
  if (hour >= 17 && hour < 21) return 'tonight';
  return 'today';
}
```

---

## Edge Functions (Implementation Details)

### `generate-invite-code`

**Purpose**: Parent creates a joinable invite code for a pending member.

**Auth**: Authenticated (parent role only)

**Request** (from client):
```typescript
{
  familyId: string;
  memberId: string;
}
```

**Response**:
```typescript
{
  code: string;     // 8 chars: 3-letter prefix + 5 random
  expiresAt: string;  // ISO 8601 (7 days from now)
}
```

**Implementation**:

```typescript
export const run = async (req: Request) => {
  const { familyId, memberId } = await req.json();
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  
  // Verify caller is authenticated
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return new Response('Unauthorized', { status: 401 });
  
  // Verify caller is a parent in this family
  const { data: caller } = await admin
    .from('members')
    .select('role')
    .eq('auth_user_id', user.id)
    .eq('family_id', familyId)
    .maybeSingle();
  
  if (!caller || caller.role !== 'parent') {
    return new Response('Only parents can create invite codes', { status: 403 });
  }
  
  // Verify target member exists and is pending
  const { data: target } = await admin
    .from('members')
    .select('invite_status, auth_user_id')
    .eq('id', memberId)
    .eq('family_id', familyId)
    .maybeSingle();
  
  if (!target) return new Response('Member not found', { status: 404 });
  if (target.invite_status !== 'pending') {
    return new Response('Member must be pending to generate code', { status: 400 });
  }
  if (target.auth_user_id) {
    return new Response('Member already has auth; cannot regenerate code', { status: 400 });
  }
  
  // Generate 8-char code (3 letters + 5 digits, ambiguous-free alphabet)
  const ALPHABET = 'BCDFGHJKLMNPQRSTVWXYZ';  // No I, O, U, etc. to avoid confusion
  const NUMBERS = '23456789';                 // No 0, 1 to avoid confusion
  
  let code = '';
  for (let i = 0; i < 3; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  for (let i = 0; i < 5; i++) {
    code += NUMBERS[Math.floor(Math.random() * NUMBERS.length)];
  }
  
  // Check uniqueness (edge case: collision)
  let attempts = 0;
  while (attempts < 10) {
    const { data: existing } = await admin
      .from('family_invites')
      .select('code')
      .eq('code', code)
      .eq('status', 'pending')
      .maybeSingle();
    
    if (!existing) break;  // Unique, use it
    attempts++;
    // Regenerate if collision
  }
  
  if (attempts >= 10) {
    return new Response('Failed to generate unique code', { status: 500 });
  }
  
  // Insert invite code (7-day expiry)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  
  const { error: insertErr } = await admin
    .from('family_invites')
    .insert({
      family_id: familyId,
      member_id: memberId,
      code,
      status: 'pending',
      created_by: user.id,
      expires_at: expiresAt.toISOString(),
    });
  
  if (insertErr) {
    return new Response(`Insert failed: ${insertErr.message}`, { status: 500 });
  }
  
  return new Response(JSON.stringify({
    code,
    expiresAt: expiresAt.toISOString(),
  }), { headers: { 'Content-Type': 'application/json' } });
};
```

### `join-family`

**Purpose**: Claim an invite code and become an active member with anonymous auth.

**Auth**: None (public)

**Request**:
```typescript
{
  code: string;      // 8-char invite code
  pin: string;       // 4-digit PIN to set
}
```

**Response**:
```typescript
{
  accessToken: string;
  refreshToken: string;
  memberId: string;
  familyId: string;
}
```

**Implementation**:

```typescript
export const run = async (req: Request) => {
  const { code, pin } = await req.json();
  
  // 1. Look up invite code
  const { data: invite, error: inviteErr } = await admin
    .from('family_invites')
    .select('member_id, family_id, status, expires_at')
    .eq('code', code)
    .maybeSingle();
  
  if (inviteErr || !invite) {
    return new Response('Invalid code', { status: 404 });
  }
  
  // Check expiry
  if (new Date(invite.expires_at) < new Date()) {
    return new Response('Code expired', { status: 410 });
  }
  
  if (invite.status !== 'pending') {
    return new Response('Code already used or revoked', { status: 410 });
  }
  
  // 2. Verify member is still pending
  const { data: member } = await admin
    .from('members')
    .select('id, family_id, invite_status, auth_user_id')
    .eq('id', invite.member_id)
    .maybeSingle();
  
  if (!member || member.invite_status !== 'pending') {
    return new Response('Member is no longer pending', { status: 400 });
  }
  
  if (member.auth_user_id) {
    return new Response('Member already claimed; cannot re-claim', { status: 400 });
  }
  
  // 3. Create anonymous auth user
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: `anon-${invite.member_id}@familycube.app`,
    password: crypto.randomUUID(),
    user_metadata: {
      anon: true,
      member_id: invite.member_id,
    },
  });
  
  if (authErr || !authData) {
    return new Response(`Auth creation failed: ${authErr.message}`, { status: 500 });
  }
  
  // 4. Update member: set auth_user_id, pin, mark active
  const { error: updateErr } = await admin
    .from('members')
    .update({
      auth_user_id: authData.user.id,
      pin,
      pin_enabled: true,
      invite_status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', invite.member_id);
  
  if (updateErr) {
    // Rollback: delete the auth user we just created
    await admin.auth.admin.deleteUser(authData.user.id);
    return new Response(`Member update failed: ${updateErr.message}`, { status: 500 });
  }
  
  // 5. Mark invite code as used
  await admin
    .from('family_invites')
    .update({
      status: 'used',
      used_at: new Date().toISOString(),
    })
    .eq('code', code);
  
  // 6. Generate session tokens
  const { data: sessionData, error: sessionErr } = await admin.auth.createSession({
    userId: authData.user.id,
  });
  
  if (sessionErr || !sessionData?.session) {
    return new Response('Session creation failed', { status: 500 });
  }
  
  return new Response(JSON.stringify({
    accessToken: sessionData.session.access_token,
    refreshToken: sessionData.session.refresh_token,
    memberId: invite.member_id,
    familyId: invite.family_id,
  }), { headers: { 'Content-Type': 'application/json' } });
};
```

### `recover-device` (Planned)

**Purpose**: Recover an existing anonymous user on a new device (no new account).

**Auth**: None (public)

**Request**:
```typescript
{
  code: string;      // 8-char recovery code
  pin: string;       // 4-digit PIN (verification)
}
```

**Response**:
```typescript
{
  accessToken: string;
  refreshToken: string;
  memberId: string;
  familyId: string;
}
```

**Implementation** (prototype):

```typescript
export const run = async (req: Request) => {
  const { code, pin } = await req.json();
  
  // 1. Validate recovery code
  const { data: recovery } = await admin
    .from('device_recovery_codes')
    .select('member_id, family_id, status, expires_at')
    .eq('code', code)
    .eq('status', 'pending')
    .maybeSingle();
  
  if (!recovery || new Date(recovery.expires_at) < new Date()) {
    return new Response('Invalid or expired recovery code', { status: 410 });
  }
  
  // 2. Load member and verify PIN
  const { data: member } = await admin
    .from('members')
    .select('id, auth_user_id, pin, family_id')
    .eq('id', recovery.member_id)
    .maybeSingle();
  
  if (!member || member.pin !== pin) {
    return new Response('Invalid PIN', { status: 403 });
  }
  
  if (!member.auth_user_id) {
    return new Response('Member has no auth user to recover', { status: 400 });
  }
  
  // 3. Mint session for EXISTING anonymous user
  // (This is the novel part — re-auth as the same user, not create new)
  
  // Step 1: Assign synthetic email if not set
  const { data: user } = await admin.auth.admin.getUserById(member.auth_user_id);
  const synthEmail = user?.email || `member-${member.id}@recovery.internal`;
  
  if (!user?.email) {
    // Set synthetic email (one-time)
    await admin.auth.admin.updateUserById(member.auth_user_id, {
      email: synthEmail,
      email_confirm: true,
    });
  }
  
  // Step 2: Generate magic link
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: synthEmail,
  });
  
  if (linkErr || !linkData) {
    return new Response('Failed to generate recovery link', { status: 500 });
  }
  
  // Step 3: Exchange hashed token for session (server-side)
  const { data: sessionData, error: sessionErr } = await admin.auth.verifyOtp({
    type: 'magiclink',
    email: synthEmail,
    token_hash: linkData.hashed_token,
  });
  
  if (sessionErr || !sessionData?.session) {
    return new Response('Session creation failed', { status: 500 });
  }
  
  // 4. Mark recovery code as used
  await admin
    .from('device_recovery_codes')
    .update({
      status: 'used',
      used_at: new Date().toISOString(),
    })
    .eq('code', code);
  
  // 5. Return session to client
  return new Response(JSON.stringify({
    accessToken: sessionData.session.access_token,
    refreshToken: sessionData.session.refresh_token,
    memberId: member.id,
    familyId: member.family_id,
  }), { headers: { 'Content-Type': 'application/json' } });
};
```

---

## Real-Time Subscription Patterns

### Channel Naming & Lifecycle

```typescript
// Channel name MUST include family context to avoid cross-family data leaks:
const channel = supabase
  .channel(`members:${familyId}`)  // Good: family-scoped
  .on('postgres_changes', { ... });

// Anti-pattern (would leak data):
const channel = supabase
  .channel('members')  // Bad: shared name, cross-family collision
  .on('postgres_changes', { ... });
```

### Hot-Reload Stale Channel Cleanup

```typescript
// During dev hot-reload, module state resets but Supabase socket persists
// This leaves a subscribed channel under the old topic name
// → Next time ensureRealtime() runs, it can't subscribe again
// → Solution: sweep & remove stale channels before subscribing

const staleTopic = `realtime:members:${familyId}`;
const stale = supabase.getChannels().filter(c => c.topic === staleTopic);
if (stale.length > 0) {
  stale.forEach(c => supabase.removeChannel(c));
}

// Now it's safe to subscribe
_rtChannel = supabase.channel(`members:${familyId}`).on(...).subscribe();
```

### Event Deduplication

```typescript
// Real-time can fire the same event twice (network retry, etc.)
// → Dedupe by checking if row already exists

if (eventType === 'INSERT') {
  const member = fromRow(newRow);
  
  // Only add if not already in state (by id)
  if (state.members.some(m => m.id === member.id)) {
    return;  // Already present, skip
  }
  
  setState({ members: [...state.members, member] });
}
```

### Subscription Subscription Status Callback

```typescript
.subscribe((status) => {
  console.log(`[familyStore] realtime members:${familyId} = ${status}`);
  // status values:
  // 'SUBSCRIBED' — connection established, listening
  // 'SUBSCRIBING' — initial handshake
  // 'UNSUBSCRIBED' — disconnected (manual or network failure)
  // 'CHANNEL_ERROR' — error on this channel
});
```

---

## Notification & Background Processing

### Push Notification Setup

#### Token Handling (Firebase + Supabase)

```typescript
// On app boot, get the device's FCM token and save to member's profile
const initNotifications = async () => {
  const token = await messaging().getToken();  // Firebase Cloud Messaging
  
  // Save to this member's record
  const { error } = await supabase
    .from('members')
    .update({ fcm_token: token })
    .eq('id', activeMemberId);
  
  if (error) {
    console.error('Failed to save push token:', error);
  }
};

// Listen for new tokens (if old one expires/revokes)
messaging().onTokenRefresh((newToken) => {
  supabase
    .from('members')
    .update({ fcm_token: newToken })
    .eq('id', activeMemberId);
});
```

#### Notification Response Handler

```typescript
// When user taps a notification (from tray or lock screen)
const handleNotificationResponse = (response: FirebaseMessagingTypes.RemoteMessage) => {
  const { data } = response;
  
  // Route based on notification type
  switch (data.type) {
    case 'chore_approved':
      router.push(`/(tabs)/quests?choreId=${data.choreId}`);
      break;
    case 'new_message':
      router.push(`/(tabs)/chat?channelId=${data.channelId}`);
      break;
    case 'event_reminder':
      router.push(`/(tabs)/calendar?eventId=${data.eventId}`);
      break;
  }
};

// Set up listeners
messaging().onNotificationOpenedApp(handleNotificationResponse);
messaging().getInitialNotification().then(handleNotificationResponse);
```

### Background Jobs (Supabase Cron)

#### `call-reminder-sweeper`

**Trigger**: Every 5 minutes (cron: `*/5 * * * *`)

**Purpose**: Check for calendar events with call reminders due soon.

```typescript
export const run = async () => {
  const now = new Date();
  const soonWindow = new Date(now.getTime() + 10 * 60 * 1000);  // Next 10 min
  
  // Find events due in the next window
  const { data: dueSoon } = await admin
    .from('calendar_events')
    .select('id, family_id, title, description, start_at, reminder')
    .eq('reminder->>type', 'call')
    .gte('start_at', now.toISOString())
    .lte('start_at', soonWindow.toISOString());
  
  for (const event of dueSoon || []) {
    // Trigger VoIP call via CallKit
    const memberIds = event.attendees || [];
    for (const memberId of memberIds) {
      // Get device's VoIP token
      const { data: member } = await admin
        .from('members')
        .select('voip_token')
        .eq('id', memberId)
        .maybeSingle();
      
      if (!member?.voip_token) continue;
      
      // Send VoIP push to device
      await sendVoipPush(member.voip_token, {
        eventId: event.id,
        title: event.title,
        description: event.description,
      });
    }
  }
};

async function sendVoipPush(voipToken: string, payload: any) {
  // Use APNs to send VoIP push (wakes app in background)
  // App receives this via PKPushRegistry and initiates CallKit call
  const apns = new APNs({
    cert: process.env.APNS_CERT,
    key: process.env.APNS_KEY,
  });
  
  await apns.send({
    deviceToken: voipToken,
    alert: { title: payload.title },
    payload: JSON.stringify(payload),
    pushType: 'voip',  // VoIP push (not regular notification)
  });
}
```

#### `quest-sweep-cron`

**Trigger**: Daily at 2 AM UTC

**Purpose**: Auto-clear completed quests, generate recurring quests.

```typescript
export const run = async () => {
  // 1. For each recurring quest with status='approved', create next instance
  const { data: recurring } = await admin
    .from('chores')
    .select('*')
    .neq('repeat_pattern', 'once')
    .eq('status', 'approved');
  
  for (const chore of recurring || []) {
    const nextDueDate = getNextRecurDate(chore.due_date, chore.repeat_pattern);
    
    if (nextDueDate > new Date()) {  // Only generate if future
      await admin.from('chores').insert({
        ...chore,
        id: crypto.randomUUID(),
        due_date: nextDueDate,
        status: 'assigned',  // Reset to assigned
        created_at: new Date().toISOString(),
      });
    }
  }
  
  // 2. Soft-delete stale completed quests (>30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  await admin
    .from('chores')
    .update({ deleted_at: new Date().toISOString() })
    .eq('status', 'approved')
    .lt('updated_at', thirtyDaysAgo.toISOString())
    .is('deleted_at', null);
  
  // 3. Auto-fail stale unfinished quests (>7 days overdue)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  await admin
    .from('chores')
    .update({
      status: 'rejected',
      custom_notes: 'Auto-rejected: past due date',
      deleted_at: new Date().toISOString(),
    })
    .in('status', ['assigned', 'claimed', 'submitted'])
    .lt('due_date', sevenDaysAgo.toISOString());
};

function getNextRecurDate(dueDate: string, pattern: string): Date {
  const date = new Date(dueDate);
  switch (pattern) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
  }
  return date;
}
```

---

## Authentication Flows (Minute Details)

### Biometric Auth (Face ID/Touch ID)

#### Setup Biometric Session

```typescript
const setupBiometric = async (memberId: string) => {
  // 1. Prompt for biometric
  const { success } = await LocalAuthentication.authenticateAsync({
    disableDeviceFallback: false,  // Allow PIN fallback if biometric unavailable
  });
  
  if (!success) return;  // User canceled or failed
  
  // 2. Get current auth session
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return;
  
  // 3. Encrypt and save to device Keychain
  const encryptedToken = await encryptToken(session.access_token, memberId);
  
  await AsyncStorage.setItem(
    `@biometric_token:${memberId}`,
    encryptedToken,
  );
  
  // Mark as enabled
  await supabase
    .from('members')
    .update({ biometric_enabled: true })
    .eq('id', memberId);
};

// Decrypt token for use
async function encryptToken(token: string, salt: string): Promise<string> {
  // Use native iOS Keychain (managed by Expo)
  // AES-256-GCM encryption with device-specific key derivation
  return encrypt(token, salt);
}
```

#### Restore Session via Biometric

```typescript
const restoreBiometricSession = async (memberId: string) => {
  // 1. Check if biometric token exists
  const encryptedToken = await AsyncStorage.getItem(
    `@biometric_token:${memberId}`,
  );
  
  if (!encryptedToken) {
    return null;  // No saved biometric for this member
  }
  
  // 2. Prompt for biometric (without fallback to sign-in)
  const { success } = await LocalAuthentication.authenticateAsync({
    disableDeviceFallback: true,  // Force biometric (no PIN fallback)
    reason: `Unlock ${memberName}`,
  });
  
  if (!success) {
    return null;  // Failed or canceled
  }
  
  // 3. Decrypt token
  const accessToken = await decryptToken(encryptedToken, memberId);
  
  // 4. Restore session
  const { data: { session }, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: null,  // Use silent refresh if needed
  });
  
  if (error) {
    // Token may have expired → clear it
    await AsyncStorage.removeItem(`@biometric_token:${memberId}`);
    return null;
  }
  
  return session;
};
```

#### Biometric Token Lifecycle

```
Session Created
  ↓
User enables biometric on ProfileSettingsScreen
  ↓
Prompt biometric (with PIN fallback)
  ↓ Success
Store encrypted token in Keychain + flag in DB
  ↓
Next app launch
  ↓
Check if member has biometric token
  ↓ Yes
Prompt biometric (no fallback)
  ↓ Success
Decrypt token + restore session
  ↓
App unlocked for this member (no sign-in prompt)
  ↓
User signs out
  ↓
Biometric token cleared (can't restore)
  ↓
Next launch → sign-in screen
```

### Session Recovery (Device Loss)

#### Pre-Recovery State

```
Kid uses app on Device A (anonymous auth)
  ↓
Loses Device A (stolen/broken)
  ↓
Device A's session persisted in Keychain/AsyncStorage is now inaccessible
  ↓
Parent realizes kid needs app on Device B
  ↓
Option 1 (Old): Create NEW invite code → kid joins as new anonymous user → old data lost
Option 2 (New): Create recovery code → kid enters PIN → restored to SAME user + data
```

#### Recovery Code Flow

```typescript
// Parent: generate recovery code for kid
const parentGeneratesRecoveryCode = async (kidMemberId: string) => {
  const { data, error } = await supabase
    .rpc('generate_recovery_code', {
      p_member_id: kidMemberId,
      p_family_id: activeFamilyId,
    });
  
  if (error) {
    Alert.alert('Failed', error.message);
    return;
  }
  
  // Show code to parent (e.g., in a modal)
  Alert.alert(
    'Recovery Code',
    `${data.code}\n\nShare this with ${kidName}. Expires in 1 hour.`,
  );
};

// Kid: on new device, use recovery code
const kidRecoversDevice = async (code: string, pin: string) => {
  const { data, error } = await supabase
    .functions.invoke('recover-device', {
      body: { code, pin },
    });
  
  if (error) {
    Alert.alert('Recovery Failed', error.message);
    return;
  }
  
  // data: { accessToken, refreshToken, memberId, familyId }
  
  // Set session (restore SAME user)
  const { error: setErr } = await supabase.auth.setSession({
    access_token: data.accessToken,
    refresh_token: data.refreshToken,
  });
  
  if (setErr) {
    Alert.alert('Session Error', setErr.message);
    return;
  }
  
  // App is now logged in as the SAME kid → all data restored
  router.replace('/(tabs)');
};
```

---

## Storage & Media Upload Patterns

### Family Photo Frame Upload

#### Upload Flow (Upsert Strategy)

```typescript
async function uploadFamilyFramePhoto(
  familyId: string,
  memberId: string,
  localUri: string,
) {
  // 1. Read file from device
  const fileContent = await FileSystem.readAsStringAsync(
    localUri,
    { encoding: FileSystem.EncodingType.Base64 }
  );
  const fileBlob = new Blob(
    [Uint8Array.from(atob(fileContent), c => c.charCodeAt(0))],
    { type: 'image/jpeg' },
  );
  
  // 2. Deterministic path (fixed filename = easy replacement)
  const storagePath = `${auth.user.id}/${familyId}/photo-frame/${memberId}/current.jpg`;
  
  // 3. Upload with upsert: true (replaces if exists)
  const { data, error } = await supabase.storage
    .from('family-photos')
    .upload(storagePath, fileBlob, {
      cacheControl: '3600',
      upsert: true,  // KEY: overwrites old file
    });
  
  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
  
  // 4. Generate signed URL (1 week expiry)
  const { data: signedData, error: signErr } = await supabase.storage
    .from('family-photos')
    .createSignedUrl(storagePath, 7 * 24 * 60 * 60);  // 7 days
  
  if (signErr) {
    throw new Error(`Signed URL failed: ${signErr.message}`);
  }
  
  // 5. Save metadata to DB
  const { error: dbErr } = await supabase
    .from('family_photo_frame')
    .upsert({
      family_id: familyId,
      member_id: memberId,
      photo_url: signedData.signedUrl,
      storage_path: storagePath,
      updated_by: memberId,
      updated_at: new Date().toISOString(),
    });
  
  if (dbErr) {
    throw new Error(`DB upsert failed: ${dbErr.message}`);
  }
  
  return { signedUrl: signedData.signedUrl, path: storagePath };
}
```

#### Delete Flow (Atomic)

```typescript
async function deleteFamilyFramePhoto(
  familyId: string,
  memberId: string,
  storagePath: string,
) {
  // 1. Delete from storage
  const { error: storageErr } = await supabase.storage
    .from('family-photos')
    .remove([storagePath]);
  
  if (storageErr) {
    throw new Error(`Storage delete failed: ${storageErr.message}`);
  }
  
  // 2. Delete DB row
  const { error: dbErr } = await supabase
    .from('family_photo_frame')
    .delete()
    .eq('family_id', familyId)
    .eq('member_id', memberId);
  
  if (dbErr) {
    // Storage deleted but DB failed — log for manual cleanup
    console.error('[Photo Delete] DB failed after storage delete:', dbErr);
    // Don't throw — photo is gone; DB will eventually be cleaned
  }
}
```

#### Component Load & Cache

```typescript
const [photoUrl, setPhotoUrl] = useState<string | null>(null);
const [storagePath, setStoragePath] = useState<string | null>(null);
const [photoFailed, setPhotoFailed] = useState(false);

// Load on mount
useEffect(() => {
  const load = async () => {
    const { data } = await supabase
      .from('family_photo_frame')
      .select('photo_url, storage_path')
      .eq('family_id', familyId)
      .eq('member_id', memberId)
      .maybeSingle();
    
    setPhotoUrl(data?.photo_url ?? null);
    setStoragePath(data?.storage_path ?? null);
  };
  
  load();
}, [familyId, memberId]);

// Render
<ExpoImage
  source={{ uri: photoUrl }}
  style={{ flex: 1 }}
  contentFit="cover"
  cachePolicy="memory-disk"  // Cache both in memory + disk
  transition={180}            // Fade-in animation (180ms)
  onError={() => setPhotoFailed(true)}  // Fallback to empty state if URL expires
/>

// Long-press menu
const onLongPress = () => {
  if (!photoUrl || photoFailed) {
    // No photo or failed load → straight to picker
    uploadFromGallery();
  } else {
    // Existing photo → show menu
    Alert.alert('Frame Photo', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Choose New Photo', onPress: uploadFromGallery },
      { text: 'Remove Photo', style: 'destructive', onPress: removePhoto },
    ]);
  }
};

const removePhoto = async () => {
  if (!storagePath) return;
  
  await deleteFamilyFramePhoto(familyId, memberId, storagePath);
  setPhotoUrl(null);
  setStoragePath(null);
  setPhotoFailed(false);
};
```

---

## Theme & Color Usage

### Color Constants (`constants/colors.ts`)

```typescript
const COLORS_LIGHT = {
  primary: '#DF613C',          // Terracotta
  teal: '#3D7A5A',             // Sage (parent)
  amber: '#D97706',            // Amber (kid)
  pink: '#7B5EA7',             // Lavender
  navy: '#2C2722',             // Warm black
  
  textPrimary: '#2C2722',
  textSecondary: '#6B5F52',
  textTertiary: '#A69A8A',
  
  card: '#FFFFFF',
  surface: '#F2ECE1',
  background: '#FAF8F4',
  
  border: 'rgba(223, 97, 60, 0.15)',  // Primary @ 15%
  
  danger: '#C54A27',
  success: '#3D7A5A',
  
  // Light tints (for backgrounds)
  primaryLight: '#FBEADF',
  tealLight: '#E1EFE7',
  amberLight: '#FDF1D6',
  pinkLight: '#EFE8F8',
};

const COLORS_DARK = {
  primary: '#EE8058',           // Lighter terracotta
  teal: '#5FA37D',              // Lighter sage
  amber: '#F5A85A',             // Lighter amber
  pink: '#A78BC9',              // Lighter lavender
  navy: '#EDE7DE',              // Warm off-white
  
  textPrimary: '#FDFCF9',       // Near-white
  textSecondary: '#B8AC9C',     // Warm gray
  textTertiary: '#7A6E60',      // Darker warm gray
  
  card: '#1D1A24',              // Very dark purple-gray
  surface: '#17151D',           // Even darker
  background: '#0E0C13',        // Near black
  
  border: 'rgba(238, 128, 88, 0.15)',  // Primary @ 15%
  
  danger: '#EE8058',
  success: '#5FA37D',
  
  // Light tints (dark mode)
  primaryLight: 'rgba(238, 128, 88, 0.15)',
  tealLight: 'rgba(95, 163, 125, 0.15)',
  amberLight: 'rgba(245, 168, 90, 0.15)',
  pinkLight: 'rgba(167, 139, 201, 0.15)',
};
```

### Theme Hook Usage

```typescript
import { useTheme } from '@/lib/ThemeContext';

function MyComponent() {
  const { colors, isDark } = useTheme();
  
  return (
    <View style={{
      backgroundColor: colors.card,              // Uses light/dark color
      borderColor: colors.border,
    }}>
      <Text style={{
        color: colors.textPrimary,               // Always from colors.*
        fontSize: TYPO.body,
      }}>
        {text}
      </Text>
      
      {/* isDark used ONLY for non-color changes */}
      <View style={{
        shadowOpacity: isDark ? 0.4 : 0.1,       // Darker shadows in dark mode
      }} />
    </View>
  );
}
```

### Role-Based Coloring

```typescript
// Parent-specific
const accentColor = colors.parent;      // Sage
const bgLight = colors.parentLight;     // Light sage tint

// Kid-specific
const accentColor = colors.kid;         // Amber
const bgLight = colors.kidLight;        // Light amber tint

// Example: member badge
<View style={{
  backgroundColor: member.role === 'parent' ? colors.parentLight : colors.kidLight,
  borderColor: member.role === 'parent' ? colors.parent : colors.kid,
}}>
  <Text>{member.name}</Text>
</View>
```

---

## Error Handling & Fallbacks

### API Error Patterns

```typescript
// 1. Network Error
try {
  const { data, error } = await supabase
    .from('members')
    .select('*');
} catch (err: any) {
  // Network completely down
  showOfflineBanner();
  return;
}

// 2. RLS/Auth Error
if (error?.code === 'PGRST116') {
  // Row not found (RLS filtered it out)
  return null;
}

if (error?.code === '42501') {
  // Permission denied (RLS blocked)
  showAlert('Access Denied', 'You do not have permission to view this.');
}

// 3. Business Logic Error
if (error?.message.includes('already claimed')) {
  showAlert('Already Claimed', 'This invite code has been used.');
}
```

### Component Error Boundaries

```typescript
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      setError(event.error);
    };
    
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);
  
  if (error) {
    return (
      fallback || (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>{error.message}</Text>
          <Button onPress={() => setError(null)} title="Try Again" />
        </View>
      )
    );
  }
  
  return <>{children}</>;
}
```

### Fallback UI States

```typescript
// Loading state
{loading ? (
  <CubeSpinner size={40} />
) : error ? (
  <ErrorPlaceholder message={error} onRetry={refetch} />
) : data ? (
  <DataView data={data} />
) : (
  <EmptyState message="No data yet" />
)}
```

---

## Database Queries & RLS

### Row-Level Security (RLS)

#### Member Access

```sql
-- Members can see other members in their family
CREATE POLICY "Members see own family"
  ON members FOR SELECT
  TO authenticated
  USING (family_id = current_user_family_id());

-- Only that member (or a parent) can update their own PIN
CREATE POLICY "Members update own PIN"
  ON members FOR UPDATE
  TO authenticated
  USING (
    (id = current_user_id()) OR  -- Own member row
    (role = 'parent' AND family_id = current_user_family_id())  -- Or parent in same family
  );
```

#### Message Access

```sql
-- Family messages (all members in family can see)
-- dm_<id1>_<id2> messages (only those two members can see)
CREATE POLICY "Messages visible to family members"
  ON messages FOR SELECT
  TO authenticated
  USING (
    (channel_id = 'family' AND family_id = current_user_family_id()) OR
    (channel_id LIKE 'dm\_%' AND family_id = current_user_family_id())
  );
```

#### Storage Access

```sql
-- Only members of a family can upload/view/delete their family's photos
CREATE POLICY "Family members manage own photos"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'family-photos'
    AND current_user_family_id()::text = (storage.foldername(name))[2]
  );
```

### Query Patterns

#### Simple Select (with RLS auto-filtering)

```typescript
const { data, error } = await supabase
  .from('members')
  .select('id, name, role')
  .eq('family_id', familyId);  // Optional; RLS enforces regardless

// RLS automatically filters to current_user_family_id()
// So if auth user is not in this family, returns empty []
```

#### Upsert (Insert if Not Exists, Update if Exists)

```typescript
const { data, error } = await supabase
  .from('family_photo_frame')
  .upsert({
    family_id: familyId,
    member_id: memberId,
    photo_url: signedUrl,
    storage_path: storagePath,
    updated_at: new Date().toISOString(),
  });

// Composite primary key: (family_id, member_id)
// If row exists → UPDATE
// If row doesn't exist → INSERT
```

#### Join Query (Real-Time with Reactions)

```typescript
const { data, error } = await supabase
  .from('messages')
  .select(`
    id,
    text,
    created_at,
    sender_id,
    message_reactions(emoji, member_id)
  `)
  .eq('channel_id', 'family')
  .order('created_at', { ascending: false });

// Embedded reaction objects:
// {
//   id: "...",
//   text: "Hello!",
//   message_reactions: [
//     { emoji: "😀", member_id: "..." },
//     { emoji: "❤️", member_id: "..." },
//   ]
// }
```

---

## Performance Optimizations

### Caching Strategy (AsyncStorage)

```typescript
// Store → Cache → AsyncStorage → DB

// On init, restore from AsyncStorage
const init = async () => {
  // 1. Restore from cache (instant)
  const cached = await AsyncStorage.getItem('@members_cache');
  if (cached) {
    setState({ members: JSON.parse(cached) });
  }
  
  // 2. Fetch fresh from DB in background
  const { data } = await supabase.from('members').select('*');
  if (data) {
    setState({ members: data });
    // Update cache for next boot
    await AsyncStorage.setItem('@members_cache', JSON.stringify(data));
  }
};
```

### Query Optimization (Pagination)

```typescript
// Instead of fetching 1000 rows, paginate
let offset = 0;
const pageSize = 50;

const fetchPage = async (page: number) => {
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('channel_id', 'family')
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);
  
  return data;
};

// Infinite scroll: load more when near bottom
const handleScroll = (offset: number) => {
  if (offset > messages.length - 100) {
    // Near bottom, fetch next page
    fetchPage(Math.ceil(messages.length / pageSize));
  }
};
```

### Image Optimization

```typescript
// Compress before upload
const compressImage = async (uri: string): Promise<string> => {
  const manipResult = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1200, height: 1600 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );
  
  return manipResult.uri;
};

// Use appropriate cache policy
<Image
  source={{ uri: photoUrl }}
  cachePolicy="memory-disk"  // Keep in RAM + disk
  transition={180}            // Fade in
  contentFit="cover"
/>
```

### Real-Time Subscription Throttling

```typescript
// Rapid changes (e.g., location updates) can spam subscribers
// Throttle to once per 5 seconds

let lastUpdate = 0;
const THROTTLE_MS = 5000;

.on('postgres_changes', {
  event: 'UPDATE',
  schema: 'public',
  table: 'member_locations',
}, (payload) => {
  const now = Date.now();
  if (now - lastUpdate < THROTTLE_MS) return;  // Skip update
  lastUpdate = now;
  
  setState({ locations: payload.new });  // Emit update
});
```

---

**Document Version:** 1.0  
**Last Updated:** 2026-08-27  
**Maintained by:** Claude Code

---

For further details, cross-reference `docs/ARCHITECTURE.md`, `docs/test_plans/`, and individual component/function source files.
