# Family Cube — Complete Architecture & Implementation Guide

**Last Updated:** 2026-08-27  
**Version:** 1.0  
**Maintained by:** Claude Code

---

## Table of Contents

1. [App Overview](#app-overview)
2. [Tech Stack & Dependencies](#tech-stack--dependencies)
3. [Navigation & Routing](#navigation--routing)
4. [State Management](#state-management)
5. [Authentication & Identity](#authentication--identity)
6. [Core Features](#core-features)
7. [Database Schema](#database-schema)
8. [Edge Functions & Backend](#edge-functions--backend)
9. [UI Components & Theme](#ui-components--theme)
10. [Real-Time & Subscriptions](#real-time--subscriptions)
11. [Storage & Media](#storage--media)
12. [Monetization (Paywall)](#monetization--paywall)

---

## App Overview

**Family Cube** is a React Native/Expo family management app enabling parents and kids to stay connected, organized, and engaged through shared calendars, chore management, location tracking, messaging, and reward systems.

### Core Statistics
- **Bundle ID:** `com.familycube.ios`
- **Framework:** Expo SDK 56
- **Router:** Expo Router v6
- **Target:** iOS (physical device required for real-time features)
- **Device Testing:** UDID `00008120-00110DE634BB601E`

### Brand Tagline
**CONNECT. ORGANIZE. CARE. GROW.**

### Seven-Tab Structure
| Tab | Route | Feature Screen | Purpose |
|-----|-------|---|---------|
| **Hub** | `app/(tabs)/index.tsx` | `features/hub/HubScreen.tsx` | Avatar switcher + parent dashboard + kid gamified home |
| **Quests** | `app/(tabs)/quests.tsx` | `features/quests/QuestsScreen.tsx` | Chore assignment, claiming, approval workflow |
| **Schedule** | `app/(tabs)/calendar.tsx` | `features/calendar/CalendarScreen.tsx` | 7-day event strip + timeline + repeating events |
| **Chat** | `app/(tabs)/chat.tsx` | `features/chat/ChatScreen.tsx` | Family group messaging + emoji reactions + DM support |
| **GPS** | `app/(tabs)/gps.tsx` | `features/gps/GpsScreen.tsx` | Real-time family location map + bottom drawer |
| **Store** | `app/(tabs)/store.tsx` | `features/store/StoreScreen.tsx` | Coin-based reward redemption + purchase history |
| **Profile** | `app/(tabs)/profile.tsx` | `features/profile/screens/ProfileScreen.tsx` | Member management, PIN, settings, logout |

---

## Tech Stack & Dependencies

### Core Framework
- **expo@56.x** — SDK 56 with native module support
- **expo-router@6.x** — File-based routing (not react-navigation directly)
- **react-native@0.76.x** — Base framework
- **typescript@5.x** — Type-safe development

### State Management
- **zustand@5.x** — Lightweight state stores (one file per domain)

### Backend & Real-Time
- **@supabase/supabase-js@2.x** — PostgreSQL + Auth + Storage + Real-time subscriptions
- **@supabase/ssr@0.x** — Server-side rendering helpers (if applicable)

### UI & Styling
- **expo-image@2.x** — Fast image rendering with caching
- **react-native-svg** — Vector graphics (icons, charts)
- **expo-blur** — Blur effects (modals, overlays)

### Payments & Monetization
- **react-native-purchases@9.x** — RevenueCat SDK integration (subscriptions, in-app purchases)

### Device Features
- **expo-location@17.x** — GPS location tracking + permissions
- **expo-camera@15.x** — Camera access (profile photos, family frame photos)
- **expo-image-picker@15.x** — Photo library access
- **expo-barcode-scanner** — QR code scanning (if used)
- **expo-local-authentication@14.x** — Biometric auth (Face ID, Touch ID)

### Communication & Notifications
- **react-native-callkeep@4.x** — CallKit integration (call reminders via VoIP)
- **expo-notifications@0.x** — Local + push notifications
- **@react-native-async-storage/async-storage@1.x** — Persistent local state (biometric tokens, session cache)

### Development & Testing
- **jest@29.x** — Test runner
- **detox** — E2E testing framework (physical device required)
- **eas-cli@latest** — Expo Application Services (builds, submissions)

### Build Configuration
- **expo-config-plugins@7.x** — Custom native module setup via `withAppDelegate`, `withInfoPlist`, etc.
- **xcode@3.x** — iOS build management (for prebuild)

---

## Navigation & Routing

### File Structure
```
app/
  _layout.tsx              — Root layout, auth state check, navigation redirection
  (auth)/
    _layout.tsx            — Auth stack (no tabs, full screen modals)
    login.tsx              — LoginScreen
    signup.tsx             — SignupScreen
    join-family.tsx        — JoinFamilyScreen (invite code entry)
    recover-device.tsx     — RecoverDeviceScreen (device recovery, planned)
  (tabs)/
    _layout.tsx            — Bottom tab navigation, family load check, onboarding redirect
    index.tsx              — Hub (re-exports HubScreen)
    quests.tsx             — Quests (re-exports QuestsScreen)
    calendar.tsx           — Calendar (re-exports CalendarScreen)
    chat.tsx               — Chat (re-exports ChatScreen)
    gps.tsx                — GPS (re-exports GpsScreen)
    store.tsx              — Store (re-exports StoreScreen)
    profile.tsx            — Profile (re-exports ProfileScreen)
  (modals)/
    _layout.tsx            — Modal-specific layout
    [dynamic-modal].tsx    — Dynamic modal routing (if used)
features/
  hub/
    HubScreen.tsx          — Main entry point
    parent/                — Parent-only components (dashboard, photo frame)
    kid/                   — Kid-only components (gamified home, badges)
  quests/
    QuestsScreen.tsx
    components/
      QuestCard.tsx
      ApprovalCard.tsx
  calendar/
    CalendarScreen.tsx
    components/
      DayStrip.tsx
      EventTimeline.tsx
  chat/
    ChatScreen.tsx
    components/
      MessageList.tsx
      ReactionPicker.tsx
  gps/
    GpsScreen.tsx
    components/
      FamilyMap.tsx
      LocationDrawer.tsx
  store/
    StoreScreen.tsx
    components/
      RewardItem.tsx
  profile/
    screens/
      ProfileScreen.tsx
      ProfileSettingsScreen.tsx
    components/
      PinEntryModal.tsx
      MemberCard.tsx
```

### Navigation Flows

#### Authentication & Onboarding
1. **App Boot** (`app/_layout.tsx`):
   - Check `useAuthStore.session` (stored session or Supabase real-time listener)
   - If no session → redirect to `(auth)/login`
   - If session exists → check family data load status

2. **Family Load Check** (`app/(tabs)/_layout.tsx`):
   - Fetch family members via `useFamilyStore.init()`
   - If no family → show onboarding (guided new-family creation or invite-code join)
   - If family exists → render tabs

3. **Login Flow**:
   - Email + password → `supabase.auth.signInWithPassword()`
   - Or create new account → `supabase.auth.signUp()` + confirm email
   - On success → `authStore.setSession()` + redirect to tabs

4. **Invite Code Flow**:
   - Parent pre-creates member row in `members` table (status = `pending`)
   - Generates code via `generate-invite-code` edge function
   - Invitee enters code in `JoinFamilyScreen` → calls `join-family` edge function
   - On success → creates anonymous `auth.users` row + claims `members` row → redirect to tabs

5. **Device Recovery Flow** (planned):
   - Parent generates recovery code for active member via `generate-recovery-code`
   - Invitee enters code + PIN in `RecoverDeviceScreen` → calls `recover-device` edge function
   - On success → mints session for EXISTING `auth_user_id` (no new anonymous account) → redirect to tabs

#### In-App Navigation
- **Bottom Tabs**: swipe or tap to navigate between Hub, Quests, Schedule, Chat, GPS, Store, Profile
- **Profile Switching**: long-press avatar on Hub → `PinEntryModal` (if PIN enabled) → `setActiveMember()` → refresh all data
- **Deep Links**: support for invite codes and deep-linked onboarding (if configured)

---

## State Management

### Zustand Stores (one file per domain)

#### `store/familyStore.ts`
**Owns:** Member list, active member context, family metadata.

```typescript
interface FamilyMember {
  id: string;
  familyId: string;
  name: string;
  role: 'parent' | 'kid' | 'teen' | 'senior' | 'grandparent';
  pin: string | null;       // 4-digit string if pinEnabled
  pinEnabled: boolean;
  profileImage: string | null;  // URL or local asset
  inviteStatus: 'pending' | 'active';
  authUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FamilyStore {
  members: FamilyMember[];
  activeMemberId: string | null;
  familyId: string | null;
  init(): Promise<void>;          // Load members on app boot
  setActiveMember(id: string): void;
  setMemberPin(id: string, pin: string, enabled: boolean): Promise<void>;
  addMember(member: FamilyMember): void;
  updateMember(id: string, updates: Partial<FamilyMember>): void;
  deleteMember(id: string): void;
  reset(): void;                  // Clear on logout
}
```

**Real-Time Subscription**: listens to `members` table changes (INSERT, UPDATE, DELETE) and syncs to local state instantly.

**Flow Example**:
```
Parent opens app
  → FamilyStore.init() → fetch all members
  → Set activeMemberId to first parent member
  → Subscribe to members table changes
User taps avatar → PinEntryModal
  → User enters PIN
  → Verify PIN vs member.pin
  → setActiveMember(newMemberId)
  → All screens re-render with new member context
```

#### `store/questStore.ts`
**Owns:** Chore/quest list, assignment, claiming, approval workflow.

```typescript
interface Quest {
  id: string;
  familyId: string;
  title: string;
  description: string;
  assignedTo: string;        // member ID
  createdBy: string;         // parent member ID
  status: 'assigned' | 'claimed' | 'submitted' | 'approved' | 'rejected';
  dueDate: string | null;
  dueTime: string | null;
  reward: number | null;     // Coins
  repeatPattern: 'once' | 'daily' | 'weekly' | 'monthly';
  createdAt: string;
  updatedAt: string;
}

interface QuestStore {
  quests: Quest[];
  addQuest(quest: Quest): Promise<void>;
  updateQuestStatus(id: string, newStatus: Quest['status']): Promise<void>;
  deleteQuest(id: string): Promise<void>;
  claimQuest(id: string): Promise<void>;      // Kid marks as started
  submitQuest(id: string): Promise<void>;     // Kid marks as done
  approveQuest(id: string): Promise<void>;    // Parent approves → awards coins
  rejectQuest(id: string, reason?: string): Promise<void>;
}
```

**Status Flow**:
```
assigned → (kid claims) → claimed
claimed → (kid submits) → submitted
submitted → (parent approves) → approved → [auto-award coins]
         OR (parent rejects) → assigned [back to start]
```

**Real-Time**: listens to `quests` table changes; updates UI instantly when another device/member makes changes.

#### `store/eventStore.ts`
**Owns:** Calendar events, reminders, recurring events.

```typescript
interface CalendarEvent {
  id: string;
  familyId: string;
  title: string;
  description: string;
  eventType: 'appointment' | 'birthday' | 'holiday' | 'family-event' | 'school' | 'trip';
  color: string;             // Hex from brand palette
  startAt: string;           // ISO 8601 with timezone
  endAt: string;
  reminder: {
    type: 'none' | 'call' | 'notification';
    minutesBefore: number;
  };
  repeats: 'never' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  attendees: string[];       // Member IDs
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface EventStore {
  events: CalendarEvent[];
  addEvent(event: CalendarEvent): Promise<void>;
  updateEvent(id: string, updates: Partial<CalendarEvent>): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  getEventsForDay(date: Date): CalendarEvent[];
  getEventsForWeek(date: Date): CalendarEvent[];
}
```

**Reminder Types**:
- `none` — no reminder
- `notification` — local device notification (silent if app is open)
- `call` — VoIP call via CallKit (native iOS background call)

#### `store/chatStore.ts`
**Owns:** Messages, reactions, DM routing, unread badge.

```typescript
interface ChatMessage {
  id: string;
  channelId: string;         // 'family' | 'dm_<member1>_<member2>'
  senderId: string;          // Member ID
  text: string;
  reactions: Record<string, string[]>;  // { '😀': [memberId, ...], ... }
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;  // Soft delete
}

interface ChatStore {
  messages: ChatMessage[];
  unreadCount: number;
  sendMessage(channelId: string, text: string): Promise<void>;
  deleteMessage(id: string): Promise<void>;
  addReaction(messageId: string, emoji: string): Promise<void>;
  removeReaction(messageId: string, emoji: string): Promise<void>;
  markChannelRead(channelId: string): Promise<void>;
}
```

**Channel Routing**:
- `family` — group chat for whole family
- `dm_<memberId1>_<memberId2>` — direct message between two members (auto-sorted by ID: `dm_aaa_bbb`, never `dm_bbb_aaa`)

#### `store/rewardStore.ts`
**Owns:** Coin balance, reward items, redemptions, purchase history.

```typescript
interface RewardItem {
  id: string;
  familyId: string;
  title: string;
  description: string;
  coinCost: number;
  imageUrl: string | null;
  createdBy: string;        // Parent member ID
  createdAt: string;
}

interface Redemption {
  id: string;
  familyId: string;
  rewardId: string;
  redeemedBy: string;       // Kid member ID
  status: 'pending' | 'completed' | 'rejected';
  redeemedAt: string;
  completedAt: string | null;
}

interface RewardStore {
  rewards: RewardItem[];
  redemptions: Redemption[];
  memberCoins: Record<string, number>;  // { memberId: coinBalance }
  addReward(reward: RewardItem): Promise<void>;
  redeemReward(rewardId: string, memberId: string): Promise<void>;
  completeRedemption(redemptionId: string): Promise<void>;
  rejectRedemption(redemptionId: string): Promise<void>;
  getMemberBalance(memberId: string): number;
}
```

#### `store/authStore.ts`
**Owns:** Auth session, login/logout, biometric storage.

```typescript
interface AuthStore {
  session: AuthSession | null;
  isLoading: boolean;
  signUp(email: string, password: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(preserveBiometric?: boolean): Promise<void>;
  restoreSession(): Promise<void>;        // On app boot, restore from storage
  setBiometricToken(memberId: string, token: string): Promise<void>;
  reset(): void;                          // Clear on real logout
}
```

**Biometric Flow**:
```
Parent enables biometric auth in settings
  → First PIN entry after enabling → store encrypted auth token in device keychain
Next app launch
  → Check if member has saved biometric token
  → Prompt Face ID/Touch ID
  → If success → restore session without sign-in prompt
  → If fail/cancel → prompt sign-in again
```

#### `store/notifStore.ts`
**Owns:** Unread badge count, notification preferences.

```typescript
interface NotifStore {
  unreadCount: number;
  updateUnreadCount(delta: number): void;
  reset(): void;
}
```

**Updates**: incremented on new message (real-time subscription), decremented when user opens Chat tab.

#### `store/subscriptionStore.ts` (Monetization, planned)
**Owns:** Trial/subscription state, entitlements.

```typescript
interface SubscriptionStore {
  isSubscribed: boolean;
  isInTrial: boolean;
  trialExpiresAt: string | null;
  subscriptionExpiresAt: string | null;
  refresh(): Promise<void>;        // Fetch from RevenueCat
  purchase(packageId: string): Promise<void>;
  restorePurchases(): Promise<void>;
}
```

---

## Authentication & Identity

### Two Auth Models (Coexisting)

#### 1. Real Auth (Parents, Email-Invite Joiners)
- Email + password stored in `auth.users`
- Supabase session tokens (access + refresh)
- Multi-device capable (same email on multiple devices = same identity)
- Persistent across app reinstalls (email recovery)

**Flow**:
```
Parent signs up with email
  → supabase.auth.signUp(email, password)
  → Confirm email link sent to inbox
  → Confirm email → account active
  → signIn(email, password) → session established
  → members row created with role='parent', auth_user_id=session.user.id
```

#### 2. Anonymous Auth (Invite-Code Joiners, Email-less Seniors)
- No email/password
- Supabase anonymous session (`supabase.auth.signInAnonymously()`)
- Tied to one device (no recovery without a new anonymous account OR device-recovery mechanism)
- Lost on app uninstall/reinstall (no email fallback)

**Flow**:
```
Invitee joins with code (JoinFamilyScreen.tsx)
  → supabase.auth.signInAnonymously()
  → join-family edge function claims members row
  → members row updated: auth_user_id=new_anon_id, inviteStatus='active'
  → Session persists in AsyncStorage
  → User stays logged in on this device
```

### PIN System (Device-Level Member Switching)

**Storage**: 4-digit PIN as plain text in DB (no hashing — matches existing app model).

**Flow**:
```
Member A (parent) enables PIN
  → enters 4-digit PIN in ProfileSettingsScreen
  → setMemberPin(memberId, pin, true)
  → stored in members.pin, members.pinEnabled=true

User on same device switches to Member B
  → long-press avatar on Hub
  → if Member B has pinEnabled=true
    → show PinEntryModal
    → user enters 4-digit code
    → verify against members.pin
    → if correct → setActiveMember(Member B id) → UI re-renders
    → if wrong → shake animation + 5 attempts max
    → after 5 fails → 30-second lockout, countdown visible
  → if correct PIN OR no PIN set
    → switch immediate, no prompt
```

**Security Model**: PINs are device-level *convenience* only, not account-recovery. They prevent casual profile switching but don't protect against a determined actor with physical device access who can reinstall the app.

### Biometric Auth (Face ID / Touch ID)

**Storage**: Encrypted auth token in iOS Keychain (managed by `expo-local-authentication`).

**Flow**:
```
User enables biometric in ProfileSettingsScreen
  → First time: prompt biometric (Face ID/Touch ID)
  → On success: store encrypted token in Keychain
  → Next app launch:
    → Check if member has biometric token
    → Prompt Face ID/Touch ID
    → If success: restore session from token (no sign-in needed)
    → If fail/cancel: fall back to sign-in screen

If user changes PIN while biometric enabled
  → Biometric token remains valid (decoupled from PIN)
```

**Edge Case – Sign-Out with Biometric**:
- `authStore.signOut(preserveBiometric=true)` clears session but keeps Keychain token
- Next app launch: biometric still prompts, but on success, session is NOT restored (token is stale)
- User sees login screen instead (intended behavior: signed out on server, biometric token no longer valid)
- If `preserveBiometric=false`: clears session AND Keychain token → full sign-out

---

## Core Features

### 1. Hub (Home Dashboard)

#### Parent View (`ParentView.tsx`)
**Components**:
- **Avatar Switcher**: long-press avatar → PIN modal → switch member context
- **Greeting**: "Hi [ActiveMember], it's [DayOfWeek]"
- **Family Photo Frame** (`FamilyPhotoFrameCard.tsx`): per-parent frame photo
  - Long-press: show menu (Choose new photo / Remove photo / Cancel)
  - Storage scoped by `(family_id, member_id)` + fixed filename (`current.jpg`)
  - Upsert-on-upload to avoid orphaning old photos
  - Delete both storage object + DB row on "Remove"
- **Stats Cards**: family health snapshot (quests due, upcoming events, etc.)
- **Action Buttons**: quick-add quest, view calendar, check-in with GPS

#### Kid View (`KidView.tsx`)
**Gamified home for kids**:
- **Avatar & Coins Display**: current coin balance (earned from quest approvals + store rewards)
- **Quest Status**: "X quests due today"
- **Badges/Achievements**: visual badges for milestones (10 quests completed, first quest, etc.)
- **Daily Streak**: consecutive days with claimed quests
- **Tap-to-Celebrate**: tap avatar to play celebratory animation + sound (with mute toggle)

#### Real-Time Updates
- Subscribes to `members`, `quests`, `calendar_events`, `point_transactions` tables
- On any change (e.g., parent approves a quest, new event added), UI updates instantly

### 2. Quests (Chores)

#### Parent Side (Assign)
**Flow**:
1. **Create Quest**: parent taps "+" button
   - Title (required): "Take out trash"
   - Description (optional): "Green bin on the curb"
   - Assign to: select kid/teen member
   - Due date + time (optional)
   - Reward: coin amount (0+ coins)
   - Repeat pattern: once / daily / weekly / monthly
   - Save → insert into `quests` table with status='assigned'

2. **View Pending**: list all quests grouped by assignee
   - Status badges: assigned (yellow), claimed (blue), submitted (orange), approved (green)
   - Swipe to delete (soft-delete: mark `deletedAt`)

#### Kid Side (Claim & Submit)
**Flow**:
1. **View Assigned**: list quests where `assignedTo=activeMemberId` and status ≠ 'approved'
2. **Claim**: tap quest → status changes `assigned` → `claimed` (kid starts work)
3. **Submit**: when done, tap "Mark Done" → status changes `claimed` → `submitted` (awaiting parent approval)
4. **Await Approval**: see "Submitted" badge until parent approves

#### Parent Side (Approve)
**Flow**:
1. **Approval Queue**: filter quests with status='submitted'
2. **Approve**: tap "Approve" → status='approved' + auto-award coins
   - Coins added to `point_transactions` table: `type='quest_approved'`, `memberId=kid`, `points=reward`
   - Kid's balance updates instantly (real-time subscription)
3. **Reject**: tap "Reject" → status='assigned' (back to start) + optional rejection reason shown in-app

#### Database Schema
```sql
CREATE TABLE quests (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES members,
  created_by UUID REFERENCES members,
  status TEXT DEFAULT 'assigned',
  due_date DATE,
  due_time TIME,
  reward INT,
  repeat_pattern TEXT DEFAULT 'once',
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

### 3. Schedule (Calendar)

#### View Modes
1. **7-Day Strip**: horizontal scroll, current day highlighted
2. **Timeline (Day View)**: list of events for selected day, sorted by time
3. **Weekly View** (if added later): full week grid

#### Event Types
- **Appointment**: doctor, dentist, school pickup
- **Birthday**: annual milestone
- **Holiday**: holiday name + date
- **Family Event**: gathering, outing, dinner
- **School**: school day, half-day, event
- **Trip**: multi-day travel

#### Event Details
- **Title**: "Soccer practice"
- **Time**: start + end (with timezone awareness)
- **Attendees**: which family members attending (default: all family)
- **Color**: pick from brand palette (terracotta, sage, amber, lavender, etc.)
- **Repeat**: never / daily / weekly / monthly / yearly (yearly for birthdays/holidays)
- **Reminder**: none / notification (local) / call (VoIP via CallKit)

#### Reminders (Call-Based)

**VoIP Call Reminder Flow**:
1. Parent sets event reminder to **"call"**
2. Time arrives (e.g., 9:00 AM for a 9:30 AM appointment)
3. Background VoIP call placed via `CallKit` + `RNCallKeep`
4. Device rings like normal incoming call (even if app closed / phone locked)
5. When user picks up, native `AVSpeechSynthesizer` speaks reminder:
   - **Event**: "Get ready for [Title], [DayPart]" (e.g., "Get ready for soccer practice, this afternoon")
   - **Chore**: "This is a reminder to [Title], due [DayPart]"
   - **Notes** (if any): "One more thing — [notes]"
6. On 2nd+ reads (repeat calls if user doesn't dismiss): "Still there? Just a reminder —" instead of greeting

**Phrasing Detail**:
- **DayPart** function:
  - 5 AM – 12 PM → "this morning"
  - 12 PM – 5 PM → "this afternoon"
  - 5 PM – 9 PM → "tonight"
  - Otherwise → "today"

#### Database Schema
```sql
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT,
  color TEXT,
  start_at TIMESTAMP WITH TIME ZONE NOT NULL,
  end_at TIMESTAMP WITH TIME ZONE NOT NULL,
  reminder_type TEXT DEFAULT 'none',
  reminder_minutes_before INT,
  repeat_pattern TEXT DEFAULT 'never',
  attendees UUID[] DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

### 4. Chat (Messaging)

#### Channel Types
1. **Family Group Chat**: all family members, single thread
2. **Direct Messages (DM)**: one-on-one conversations between any two members

#### Message Features
- **Text**: plain text (no markdown/rich text)
- **Emoji Reactions**: tap message → emoji picker → add reaction
  - Multiple members can react with same emoji (cumulative)
  - Tap reaction again to remove your own
- **Delete**: long-press message (if sender) → confirm → soft-delete (message text replaced with "[deleted]")
- **Unread Badge**: red dot on Chat tab icon if unread messages
  - Count decreases when Chat tab opened

#### DM Routing
- **Composite IDs**: two-member DM uses channel ID format `dm_<memberId1>_<memberId2>` (IDs always sorted alphabetically: `dm_aaa_bbb`, never `dm_bbb_aaa`)
- **Create on First Message**: if DM doesn't exist, `sendMessage` auto-creates it with first message
- **Persistence**: DMs persist (not deleted when members interact with family chat)

#### Real-Time Subscriptions
- Family chat: listen to messages where `channel_id='family'`
- Per-DM: listen to messages where `channel_id='dm_...'`
- Reactions: listen to reactions table and update message card in real-time

#### Database Schema
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  channel_id TEXT NOT NULL,  -- 'family' or 'dm_<id1>_<id2>'
  sender_id UUID NOT NULL REFERENCES members,
  text TEXT NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE TABLE message_reactions (
  id UUID PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES messages,
  member_id UUID NOT NULL REFERENCES members,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP,
  UNIQUE(message_id, member_id, emoji)
);
```

### 5. GPS (Location Tracking)

#### Map Display
- **Google Maps** (or equivalent): centered on family hub location (home address)
- **Member Pins**: each family member as a color-coded pin (parent=sage, kid=amber, etc.)
- **Last Update Time**: "Last seen X minutes ago" under each pin

#### Bottom Drawer
- **Member List**: swipe up to show detailed drawer
  - Member name + photo + role + last location (address)
  - Current accuracy radius (if available)
  - Battery level (if shared by device)
  - "Tap to call" quick action

#### Permissions
- **On First Launch**: prompt for "Allow Always" location access (needed for background location)
- **Settings**: can disable per member or switch to "While Using App" only
- **RLS**: each member sees family's locations (real-time subscription via `member_locations` table)

#### Database Schema
```sql
CREATE TABLE member_locations (
  id UUID PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES members,
  family_id UUID NOT NULL REFERENCES families,
  latitude NUMERIC,
  longitude NUMERIC,
  accuracy NUMERIC,
  updated_at TIMESTAMP
);
```

### 6. Store (Rewards)

#### Parent Side (Create Rewards)
1. **Add Reward**: parent taps "+"
   - Title: "Movie night"
   - Description: "Pick a movie and we watch it together"
   - Coin Cost: 50 (kid must have 50+ coins to redeem)
   - Photo: optional image (e.g., movie poster)
   - Save → insert into `rewards` table

2. **Manage Rewards**: list all active rewards
   - Swipe to delete
   - Edit to change cost/title

3. **Redemption Queue**: see pending redemptions (kids requesting rewards)
   - Approve → mark completed, remove coins from kid
   - Reject → deny, coins stay with kid

#### Kid Side (Redeem)
1. **Browse Rewards**: swipe through reward cards
   - Show coin cost + description
   - Button: "Redeem" (if balance ≥ cost) or "X more coins needed"

2. **Redeem**: tap "Redeem" → confirmation → coins deducted, redemption marked pending
   - Parent sees in redemption queue

3. **Completed**: after parent approves, see in "Completed Rewards" history

#### Database Schema
```sql
CREATE TABLE rewards (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  coin_cost INT NOT NULL,
  image_url TEXT,
  created_by UUID,
  created_at TIMESTAMP
);

CREATE TABLE redemptions (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL,
  reward_id UUID NOT NULL REFERENCES rewards,
  redeemed_by UUID NOT NULL REFERENCES members,
  status TEXT DEFAULT 'pending',  -- pending, completed, rejected
  redeemed_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE point_transactions (
  id UUID PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES members,
  family_id UUID NOT NULL,
  type TEXT,  -- quest_approved, reward_redeemed, manual_adjustment, etc.
  points INT NOT NULL,
  reference_id UUID,  -- quest_id, redemption_id, etc.
  created_at TIMESTAMP
);
```

### 7. Profile (Settings & Member Management)

#### Member View (Tabs)
1. **Me**: current member's profile (name, photo, role, stats)
2. **Roster** (parent only): list all family members
   - Swipe to delete (revoke member)
   - Tap to view details

3. **Settings** (parent only): family-wide settings
   - Manage reward items (create, edit, delete)
   - Manage event reminders
   - Manage family info (name, timezone, home address)

#### Member Profile Details
- **Photo**: upload from camera / gallery, or use placeholder avatar
- **Name**: editable (kid profiles by kid or parent)
- **Role**: parent, kid, teen, senior, grandparent (selectable on creation)
- **Status**: pending (not yet joined) or active (has account)
- **PIN Settings** (parent): enable/disable PIN for this member
- **Coins** (kid): current balance + transaction history

#### Settings Screen (Parent)
- **Notifications**: toggle on/off, select types (call, push)
- **Location Sharing**: toggle, set frequency (real-time vs. every 5 min)
- **Currency**: coin per month budget allocation (planned feature)
- **About**: app version, privacy policy, terms of service
- **Logout**: sign out of current session + return to login

#### Database Schema
```sql
CREATE TABLE members (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families,
  name TEXT NOT NULL,
  role TEXT NOT NULL,  -- parent, kid, teen, senior, grandparent
  pin TEXT,
  pin_enabled BOOLEAN DEFAULT FALSE,
  profile_image_url TEXT,
  invite_status TEXT DEFAULT 'pending',
  auth_user_id UUID REFERENCES auth.users,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## Database Schema

### Complete ERD

#### Families
```sql
CREATE TABLE families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  timezone TEXT DEFAULT 'America/New_York',
  home_address TEXT,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Members
```sql
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('parent', 'kid', 'teen', 'senior', 'grandparent')),
  pin TEXT,
  pin_enabled BOOLEAN DEFAULT FALSE,
  profile_image_url TEXT,
  invite_status TEXT DEFAULT 'pending' CHECK (invite_status IN ('pending', 'active')),
  auth_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_members_family_id ON members(family_id);
CREATE INDEX idx_members_auth_user_id ON members(auth_user_id);
```

#### Quests / Chores
```sql
CREATE TABLE quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID NOT NULL REFERENCES members(id),
  created_by UUID NOT NULL REFERENCES members(id),
  status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned', 'claimed', 'submitted', 'approved', 'rejected')),
  due_date DATE,
  due_time TIME,
  reward INT,
  repeat_pattern TEXT DEFAULT 'once' CHECK (repeat_pattern IN ('once', 'daily', 'weekly', 'monthly')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_quests_family_id ON quests(family_id);
CREATE INDEX idx_quests_assigned_to ON quests(assigned_to);
CREATE INDEX idx_quests_status ON quests(status);
```

#### Calendar Events
```sql
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT CHECK (event_type IN ('appointment', 'birthday', 'holiday', 'family-event', 'school', 'trip')),
  color TEXT,
  start_at TIMESTAMP WITH TIME ZONE NOT NULL,
  end_at TIMESTAMP WITH TIME ZONE NOT NULL,
  reminder_type TEXT DEFAULT 'none' CHECK (reminder_type IN ('none', 'notification', 'call')),
  reminder_minutes_before INT,
  repeat_pattern TEXT DEFAULT 'never',
  attendees UUID[] DEFAULT '{}',
  created_by UUID REFERENCES members(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_calendar_events_family_id ON calendar_events(family_id);
CREATE INDEX idx_calendar_events_start_at ON calendar_events(start_at);
```

#### Messages
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id TEXT NOT NULL,  -- 'family' or 'dm_<id1>_<id2>'
  sender_id UUID NOT NULL REFERENCES members(id),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_messages_channel_family ON messages(channel_id, family_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
```

#### Message Reactions
```sql
CREATE TABLE message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(message_id, member_id, emoji)
);
```

#### Rewards
```sql
CREATE TABLE rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  coin_cost INT NOT NULL,
  image_url TEXT,
  created_by UUID REFERENCES members(id),
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_rewards_family_id ON rewards(family_id);
```

#### Redemptions
```sql
CREATE TABLE redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES rewards(id),
  redeemed_by UUID NOT NULL REFERENCES members(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
  redeemed_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_redemptions_family_id ON redemptions(family_id);
CREATE INDEX idx_redemptions_status ON redemptions(status);
```

#### Point Transactions (Coin Ledger)
```sql
CREATE TABLE point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- 'quest_approved', 'reward_redeemed', 'manual_adjustment'
  points INT NOT NULL,
  reference_id UUID,  -- quest_id, redemption_id, etc.
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_point_transactions_member ON point_transactions(member_id);
CREATE INDEX idx_point_transactions_family ON point_transactions(family_id);
```

#### Member Locations
```sql
CREATE TABLE member_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  latitude NUMERIC,
  longitude NUMERIC,
  accuracy NUMERIC,
  battery_level INT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_member_locations_member ON member_locations(member_id);
```

#### Family Photo Frame (Per-Parent)
```sql
CREATE TABLE family_photo_frame (
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  photo_url TEXT,
  storage_path TEXT,
  updated_by UUID REFERENCES members(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (family_id, member_id)
);
```

#### Invite Codes
```sql
CREATE TABLE family_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,  -- 3-letter + 5-digit, ambiguity-free alphabet
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired', 'revoked')),
  created_by UUID REFERENCES members(id),
  used_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_family_invites_code ON family_invites(code);
CREATE INDEX idx_family_invites_status ON family_invites(status);
```

#### Device Recovery Codes (Planned)
```sql
CREATE TABLE device_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired', 'revoked')),
  created_by UUID REFERENCES members(id),
  used_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_device_recovery_member_pending ON device_recovery_codes(member_id) WHERE status = 'pending';
```

---

## Edge Functions & Backend

### Edge Functions (Supabase)

#### `generate-invite-code`
**Purpose**: Create an invite code for a pending family member.
**Auth**: Authenticated (parent role only)
**Input**:
```typescript
{
  familyId: string;
  memberId: string;
}
```
**Output**:
```typescript
{
  code: string;      // 8 characters, e.g., "ABC12345"
  expiresAt: string; // ISO 8601
}
```
**Flow**:
1. Verify caller is parent + same family
2. Verify target member exists and `inviteStatus='pending'`
3. Generate 8-character code (3-letter prefix + 5 random, ambiguity-free alphabet)
4. Insert into `family_invites` table with status='pending'
5. Return code + expiry (7 days)

#### `join-family`
**Purpose**: Claim an invite code as a new member (anonymous auth).
**Auth**: None (public)
**Input**:
```typescript
{
  code: string;
  pin: string;  // 4-digit PIN to set for this member
}
```
**Output**:
```typescript
{
  accessToken: string;
  refreshToken: string;
  memberId: string;
  familyId: string;
}
```
**Flow**:
1. Look up `family_invites` by code + status='pending'
   - Return 404 if not found
   - Return 410 if expired/used/revoked
2. Load target `members` row
3. Verify no existing `auth_user_id` (prevent double-claiming)
4. Call `supabase.auth.admin.createUser()` with anonymous provider
5. Update `members` row: `auth_user_id=new_anon_id`, `pin=input_pin`, `pinEnabled=true`, `inviteStatus='active'`
6. Mark `family_invites` row: status='used', `used_at=now()`
7. Generate session tokens and return to client
8. Client calls `supabase.auth.setSession()` → logged in as anonymous user

#### `generate-recovery-code` (Planned)
**Purpose**: Create a recovery code for an active member (to recover on new device).
**Auth**: Authenticated (parent role only)
**Input**:
```typescript
{
  familyId: string;
  memberId: string;
}
```
**Output**:
```typescript
{
  code: string;
  expiresAt: string;  // 1 hour
}
```
**Flow**:
1. Verify caller is parent + same family
2. Verify target member exists and `inviteStatus='active'` + has `auth_user_id`
3. Generate 8-character code (same format as invite codes)
4. Insert into `device_recovery_codes` table with status='pending' + 1-hour expiry
5. Return code + expiry

#### `recover-device` (Planned)
**Purpose**: Recover a device by re-authenticating an existing anonymous identity.
**Auth**: None (public)
**Input**:
```typescript
{
  code: string;
  pin: string;
}
```
**Output**:
```typescript
{
  accessToken: string;
  refreshToken: string;
  memberId: string;
  familyId: string;
}
```
**Flow**:
1. Look up `device_recovery_codes` by code + status='pending'
   - Return 404/410 if not found/expired/used/revoked
2. Load target `members` row
3. Verify `pin` matches `members.pin` (plain text comparison)
4. Mint session for EXISTING `auth_user_id` (not a new account):
   - Call `supabase.auth.admin.updateUserById(auth_user_id, { email: '<deterministic-synthetic-address>' })`
   - Call `supabase.auth.admin.generateLink({ type: 'magiclink', email: syntheticEmail })`
   - Extract `hashed_token` from response
   - Call `supabase.auth.verifyOtp({ type: 'magiclink', token_hash: hashed_token })` server-side
   - Obtain real session tokens
5. Return session tokens to client
6. Client calls `supabase.auth.setSession()` → logged in as existing user (zero orphaned rows)
7. Mark `device_recovery_codes` row: status='used', `used_at=now()`

#### `send-message` (Real-time chat)
**Purpose**: Persist a message and broadcast via real-time subscription.
**Auth**: Authenticated (any member in family)
**Input**:
```typescript
{
  channelId: string;  // 'family' or 'dm_<id1>_<id2>'
  text: string;
}
```
**Output**:
```typescript
{
  messageId: string;
  createdAt: string;
}
```
**Flow**:
1. Verify sender is member of target family
2. If DM channel doesn't exist, create it
3. Insert into `messages` table
4. Real-time subscription pushes message to all family members instantly
5. Unread count increments for non-Chat-tab members

#### `add-reaction`
**Purpose**: Add emoji reaction to a message.
**Auth**: Authenticated
**Input**:
```typescript
{
  messageId: string;
  emoji: string;
}
```
**Output**:
```typescript
{
  reactionId: string;
}
```
**Flow**:
1. Insert into `message_reactions` table
2. Real-time push updates message card (show new emoji)
3. If same member adds same emoji again, this fails on UNIQUE constraint (expected — deduplicated on client)

### Background Jobs

#### Daily Quest Sweep (Planned)
**Purpose**: Auto-clear completed quests after N days, generate recurring quests.
**Trigger**: Scheduled via pg_cron (daily at 2 AM UTC)
**Logic**:
1. For each quest with `repeat_pattern != 'once'` and `status='approved'`:
   - If next repeat cycle starts: duplicate quest row with new due_date
2. Soft-delete quests older than 30 days with status='approved'
3. Soft-delete quests with `due_date` older than 7 days and status='assigned'/'claimed' (stale)

#### Location Update Sync (Real-Time)
**Purpose**: Accept location updates from mobile app and broadcast to family.
**Trigger**: Device sends location (configurable: real-time vs. every 5 min)
**Flow**:
1. Client calls `supabase.from('member_locations').upsert({ member_id, latitude, longitude, accuracy })`
2. Real-time subscription pushes to other family members
3. GPS tab updates map pins instantly

#### Reminder Dispatch (VoIP Calls)
**Purpose**: Trigger VoIP calls at reminder time (via `send-reminder` edge function).
**Trigger**: Scheduled edge function or APNs timer trigger
**Flow**:
1. Query `calendar_events` where `reminder_type='call'` and trigger time met
2. Build reminder payload (event title, type, notes)
3. Call native iOS function `RNCallKeep` to initiate VoIP call
4. App's `AVSpeechSynthesizer` speaks reminder on call answer
5. Auto-hangup after reminder or user dismisses

---

## UI Components & Theme

### Theme System

#### Colors (`constants/colors.ts`)

**Kinfolk Editorial Palette** (warm, accessible):

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `primary` | `#DF613C` | `#EE8058` | Terracotta – main actions, CTAs |
| `teal` | `#3D7A5A` | `#5FA37D` | Sage – parent role, CONNECT |
| `amber` | `#D97706` | `#F5A85A` | Amber – kid role, ORGANIZE |
| `pink` | `#7B5EA7` | `#A78BC9` | Lavender – CARE, highlights |
| `navy` | `#2C2722` | `#EDE7DE` | Warm black – text primary |
| `textPrimary` | `#2C2722` | `#FDFCF9` | Main text |
| `textSecondary` | `#6B5F52` | `#B8AC9C` | Secondary text, labels |
| `textTertiary` | `#A69A8A` | `#7A6E60` | Timestamps, captions |
| `card` | `#FFFFFF` | `#1D1A24` | Card backgrounds |
| `surface` | `#F2ECE1` | `#17151D` | Surface, input backgrounds |
| `background` | `#FAF8F4` | `#0E0C13` | Screen background |
| `border` | terracotta 15% | terracotta 15% | Dividers, borders |
| `danger` | `#C54A27` | `#EE8058` | Errors, destructive |
| `success` | `#3D7A5A` | `#5FA37D` | Success states |

**Light Tints** (used for backgrounds, badges):
- `primaryLight` / `tealLight` / `amberLight` / `pinkLight`

#### Typography (`constants/theme.ts`)

```typescript
const TYPO = {
  heading: 20,   // Screen titles, large headings
  body: 15,      // Primary text, buttons
  caption: 13,   // Secondary info, timestamps
  small: 11,     // Badges, tiny labels
};

const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};
```

#### Dark Mode
- Every component uses `useTheme()` hook (imports `colors`, `isDark` from context)
- Token-based: all colors from `colors.*`, never hardcoded hex
- No color-only defined inside `@media (prefers-color-scheme: dark)` blocks
- `isDark` flag used only for non-color changes (shadow opacity, icon stroke width)

### Shared Components

#### `PinEntryModal.tsx`
**Purpose**: Prompt for 4-digit PIN when switching profiles.
**Props**:
```typescript
{
  visible: boolean;
  onSuccess(pin: string): void;
  onCancel(): void;
}
```
**Features**:
- Numeric keypad (0-9) + delete key
- 5-attempt lockout with 30-second countdown
- Shake animation on wrong entry
- Cancel button

#### `CubeSpinner.tsx`
**Purpose**: Animated loading indicator (rotating cube brand logo).
**Props**:
```typescript
{
  size?: number;  // Default: 40
  color?: string; // Default: colors.primary
}
```

#### `FamilyPhotoFrameCard.tsx`
**Purpose**: Per-parent photo frame (tilted, with delete/replace menu).
**Props**:
```typescript
{
  colors: any;
  isDark: boolean;
  width?: number;    // Default: 124
  height?: number;   // Derived from width * 1.25 (3:2 aspect)
}
```
**Behavior**:
- Long-press to show menu: Cancel, Choose new photo, Remove photo
- Empty state: static illustration
- Loading: spinner overlay
- Error (photo failed): fallback to empty state

#### `ReactionPicker.tsx`
**Purpose**: Emoji picker for message reactions.
**Props**:
```typescript
{
  visible: boolean;
  onSelectEmoji(emoji: string): void;
}
```
**Features**:
- Grid of 20-30 common emojis (smileys, thumbs, etc.)
- Search or category tabs (optional)

### Screens & Navigation

#### Login Flow
1. **LoginScreen** (`features/auth/screens/LoginScreen.tsx`)
   - Email input + password input
   - "Sign in" button
   - "No account? Sign up" link
   - "Or join with invite code" link

2. **SignupScreen** (`features/auth/screens/SignupScreen.tsx`)
   - Email input + password (2x for confirmation)
   - "Create account" button
   - Email confirmation flow (redirect to LoginScreen after confirming)

3. **JoinFamilyScreen** (`features/onboarding/screens/JoinFamilyScreen.tsx`)
   - Invite code input (8 characters)
   - "Join" button
   - 4-digit PIN entry
   - Confirm → claims member + logged in

#### Tab Screens
- Each tab's entry point is thin re-export (`app/(tabs)/[tab].tsx`)
- Real logic in `features/[domain]/[FeatureScreen].tsx`
- Each screen subscribes to real-time data + renders current state

---

## Real-Time & Subscriptions

### Supabase Real-Time (PostgreSQL Subscriptions)

#### Subscription Pattern
```typescript
// In a component or store initializer:
const channel = supabase
  .channel('family_members')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'members', filter: `family_id=eq.${familyId}` },
    (payload) => {
      // payload.eventType: 'INSERT' | 'UPDATE' | 'DELETE'
      // payload.new: updated row (INSERT/UPDATE)
      // payload.old: previous row (UPDATE/DELETE)
      updateMemberInLocalStore(payload);
    }
  )
  .subscribe();

// Cleanup on unmount:
supabase.removeChannel(channel);
```

#### Subscriptions Per Store

| Store | Tables Subscribed | Reason |
|-------|---|---|
| `familyStore` | `members` | Member list changes (name, photo, role) |
| `questStore` | `quests` | Quest status, assignments |
| `eventStore` | `calendar_events` | Events added/edited/deleted |
| `chatStore` | `messages`, `message_reactions` | New messages, new reactions |
| `rewardStore` | `rewards`, `redemptions`, `point_transactions` | Reward changes, coin balance |
| `notifStore` | `messages` | Unread message count |

#### Real-Time Events Flow
```
Parent approves quest on Device A
  → INSERT into point_transactions (kid gets coins)
  → UPDATE quests (status='approved')
  → Real-time pushes to all subscribers
  → Kid's device (Device B) receives UPDATE event
  → questStore updates local quest status
  → rewardStore updates coin balance
  → Both screens re-render instantly
```

### Offline-First Considerations
- **AsyncStorage**: cache latest snapshot of each store (for cold start)
- **Session Restore**: on app boot, check AsyncStorage for last known state
- **Pending Actions**: if offline when making change, queue in local store + sync when online
- **Conflict Resolution**: last-write-wins (Supabase timestamp) or explicit user resolution (not yet implemented)

---

## Storage & Media

### Supabase Storage Buckets

#### `family-photos`
**Purpose**: Family photos (memories feed, frame photos).
**Path Structure**: `${auth.user.id}/${familyId}/photo-frame/${memberId}/current.jpg`
- Per-parent scoped: each parent's frame photo in own directory
- Fixed filename: `current.jpg` for easy replacement (upsert-on-upload)
- **Upload Policy**: authenticated users, scoped to own family
- **Delete Policy**: authenticated users, own family's photos
- **Retention**: no auto-cleanup (manual deletion via app)

#### `profile-photos`
**Purpose**: Member profile avatars.
**Path Structure**: `${auth.user.id}/${memberId}/avatar.jpg`
- Per-member avatar
- Fixed filename for easy replacement

#### RLS Policies

**Storage bucket policies** enforce family-level access:
```sql
-- INSERT policy (upload)
CREATE POLICY "Family members upload own family's photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'family-photos'
    AND public.current_user_family_id()::text = (storage.foldername(name))[2]
  );

-- SELECT policy (view)
CREATE POLICY "Family members view own family's photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'family-photos'
    AND public.current_user_family_id()::text = (storage.foldername(name))[2]
  );

-- DELETE policy (remove)
CREATE POLICY "Family members delete own family's photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'family-photos'
    AND public.current_user_family_id()::text = (storage.foldername(name))[2]
  );
```

### Image Upload Flow

#### From Camera / Gallery
1. `expo-image-picker.launchImageLibraryAsync()` or `launchCameraAsync()`
2. User selects + crops (if `allowsEditing=true`)
3. Result: local file URI
4. Call `uploadFamilyFramePhoto(familyId, memberId, localUri)` from `lib/supabase.ts`
5. Read file into bytes
6. Call `supabase.storage.from('family-photos').upload(path, fileBytes, { upsert: true })`
7. On success: call `createSignedUrl(path, expirySeconds)` → returns temporary URL
8. Store URL in DB: `INSERT into family_photo_frame { photo_url: signedUrl, storage_path: path }`
9. Component loads image via `ExpoImage source={{ uri: signedUrl }}`

#### Delete Flow
1. User confirms delete in alert
2. Call `deleteFamilyFramePhoto(familyId, memberId, storagePath)`
3. Edge function (or client call) performs:
   - `supabase.storage.from('family-photos').remove([storagePath])`
   - `supabase.from('family_photo_frame').delete().eq('family_id', familyId).eq('member_id', memberId)`
4. Component clears `photoUrl` state → renders empty-state illustration

### Signed URL Strategy
- **Expiry**: set to `MEMORIES_SIGNED_URL_EXPIRY_SECONDS` (configurable, default: 1 week)
- **Cache**: `ExpoImage` caches by URL → signed URL changing = cache miss = fresh fetch (natural, no cache-busting param needed)
- **Post-Expiry**: cached images still render if URL was saved; stale URL just won't load on re-fetch

---

## Monetization (Paywall)

### Subscription Model

**Pricing**:
- **Monthly**: $6.99/mo
- **Yearly**: $44.99/yr (≈46% discount, standard anchor)
- **Free Trial**: 7 days (free for both plans)

**Soft-Gate**: app fully usable without subscription; optional upgrade prompts + banners at natural moments.

### RevenueCat Integration

#### Setup (Pre-Code)
1. **App Store Connect**: create subscription group + 2 products (`family_cube_monthly`, `family_cube_yearly`) with 7-day trial intro offers
2. **RevenueCat**: link App Store app, import products, create `premium` entitlement + `default` offering
3. **API Key**: get public iOS SDK key (`appl_...`)

#### SDK Initialization (`app/_layout.tsx`)
```typescript
import Purchases from 'react-native-purchases';

useEffect(() => {
  const initPurchases = async () => {
    await Purchases.configure({
      apiKey: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY,
      appUserID: activeMemberId,  // Stable ID per member
    });
    // Sync subscription state
    const customerInfo = await Purchases.getCustomerInfo();
    useSubscriptionStore.setState({
      isSubscribed: !!customerInfo.entitlements.active['premium'],
    });
  };
  initPurchases();
}, [activeMemberId]);
```

#### Entitlement Store (`store/subscriptionStore.ts`)
```typescript
interface SubscriptionStore {
  isSubscribed: boolean;
  isInTrial: boolean;
  trialExpiresAt: string | null;
  subscriptionExpiresAt: string | null;
  
  refresh(): Promise<void>;           // Fetch from RevenueCat
  purchase(packageId: string): Promise<void>;  // Initiate purchase
  restorePurchases(): Promise<void>; // For new device
}
```

#### Paywall Screen (`features/paywall/PaywallScreen.tsx`)
**Shows**:
- Two plan cards (monthly / yearly side-by-side)
- Trial messaging: "7 days free, then $6.99/mo"
- Purchase CTA per plan
- "Restore Purchases" link (bottom)
- "Dismiss" option (for soft-gate)

#### Soft-Gate Nag Points
- **Hub Hub Banner**: "Upgrade to unlock full features" (dismissible)
- **Post-Action Prompt**: after kid completes 3rd quest, show upgrade modal (dismissible)
- **Settings Link**: "Manage Subscription" in ProfileSettingsScreen

#### Purchase Flow
```
User taps "Subscribe Monthly"
  → Purchases.purchasePackage('$rc_monthly')
  → iOS shows native payment sheet (Face ID/Touch ID confirm)
  → On success: RevenueCat updates entitlements
  → getCustomerInfo() returns isSubscribed=true
  → subscriptionStore re-fetches + updates
  → Paywall modal closes
  → "Premium" badge appears in Hub

Next app launch (without subscription):
  → getCustomerInfo() checks entitlements
  → isSubscribed=false (or trial expired)
  → Soft-gate banners show again
```

### Analytics (Optional)
- Track paywall views: `Mixpanel.track('paywall_viewed')`
- Track trial starts: `Mixpanel.track('trial_started')`
- Track conversions: `Mixpanel.track('subscription_purchased', { plan: 'monthly' })`

---

## Implementation Status & Next Steps

### ✅ Completed
- Authentication (real + anonymous, biometric support)
- Member management (profiles, roles, PINs)
- Quests (assign, claim, approve workflow)
- Calendar events (with call reminders via VoIP)
- Chat (family group + DMs with reactions)
- GPS location tracking
- Store (rewards + redemptions)
- Profile settings + management
- Real-time subscriptions (all major tables)
- Storage (family photos with per-parent scoping)
- Plugin refactor (AppDelegate code-gen from canonical source)
- Call reminder TTS (phrasing improvements)
- Database schema (complete ERD)

### 🚧 In Progress
- Paywall setup (App Store Connect + RevenueCat account-side)
- SDK integration (RevenueCat initialization + entitlement store)

### 📋 Planned
- Device recovery mechanism (`device_recovery_codes` table + edge functions)
- Daily quest sweep + recurring quest generation
- Detailed analytics dashboard (parent oversight)
- Per-parent family photo frame → live testing after rebuild
- Admin oversight without impersonation (view kid data without PIN-switching)
- Trip "never started" soft-delete flag

---

**Document maintained by:** Claude Code  
**Last sync:** 2026-08-27  
**Contact:** For questions or updates, reference this document and the test plans in `docs/test_plans/`.
