# Notifications & Permissions Architecture

## Overview

Family Cube implements a three-layer notification system combining **preference gates** (user opt-in), **role-based access** (who can act), and **timezone-aware delivery** (local morning windows for non-urgent reminders).

All times in the database are stored as UTC. Client-side conversions happen at display time using the user's stored IANA timezone.

---

## Notification Types & Recipient Rules

### Health & Medical (`notif_health`)

| Notification | Owner | Caretaker | Caregiver | Viewer | Window | Dedup |
|---|:---:|:---:|:---:|:---:|---|---|
| **Vaccine reminder** (7d, 1d, today, overdue) | ✅ | ✅ | ❌ | ❌ | 8–9 AM local | Per-user per vaccine per date |
| **Appointment reminder** (24h before) | ✅ | ✅ | ❌ | ❌ | Immediate | Per appointment per date |
| **Medication reminder** (local device, repeating) | ✅ | ✅ | ✅ | ❌ | User-configured | Local notifications only |

**Why?** Only owner and caretaker attend vet visits; caregivers (e.g., pet sitters) only administer existing medications but don't schedule medical visits.

### Safety & Alerts

| Notification | Owner | Caretaker | Caregiver | Viewer | Window | Dedup |
|---|:---:|:---:|:---:|:---:|---|---|
| **Lost pet alert** (nearby community) | ✅ | ✅ | ✅ | ✅ | Immediate | Per alert |
| **Pet found alert** (to alert subscribers) | ✅ | ✅ | ✅ | ✅ | Immediate | Per alert |

**Why?** Everyone who knows the pet can help spot it.

### Social & Events

| Notification | Owner | Caretaker | Caregiver | Viewer | Window | Dedup |
|---|:---:|:---:|:---:|:---:|---|---|
| **Playdate invite / update** | ✅ | ✅ | ❌ | ❌ | Immediate | Per request |
| **Playdate chat** | ✅ | ✅ | ❌ | ❌ | Immediate | Per message |
| **Event RSVP** | ✅ | ✅ | ✅ | ✅ | Immediate | Per RSVP |
| **Post like / comment** | ✅ (post author) | ❌ | ❌ | ❌ | Immediate | Per like/comment |
| **Follow / mention** | ✅ (account owner) | ❌ | ❌ | ❌ | Immediate | Per follow/mention |

**Why?** Only the post author is notified of engagement on their posts. Playdate planning requires scheduling capability (owner/caretaker only).

### Milestones & Family

| Notification | Owner | Caretaker | Caregiver | Viewer | Window | Dedup |
|---|:---:|:---:|:---:|:---:|---|---|
| **Birthday / memorial** | ✅ | ✅ | ✅ | ✅ | 8–9 AM local | Per-user per pet per year |
| **Family invite accepted** | ✅ (inviter only) | ❌ | ❌ | ❌ | Immediate | Per invite |

**Why?** Birthdays and memorials are emotional milestones for everyone in the pet's life. Family membership changes affect only the inviter (pet owner).

---

## Preference Gates

### Client-Side (`lib/notifications.ts`)

**`TYPE_TO_FLAG` map** — links each notification type to its preference flag:

```ts
const TYPE_TO_FLAG = {
  // Health
  vaccine_reminder:        'notifHealth',
  appointment_reminder:    'notifAppointment',
  medication_reminder:     'notifHealth',
  // Safety
  lost_alert:              'notifLost',
  pet_found:               'notifLost',
  // Social
  playdate_request:        'notifPlaydate',
  playdate_chat_message:   'notifChat',
  post_like:               'notifFamily',
  // Milestones
  birthday_notif:          'notifDaily',
  memorial_notif:          'notifDaily',
  // ... etc
};
```

**`recipientAllowsNotif(userId, type)`** — async gate before writing to DB or invoking push:

```ts
// Returns true if the recipient:
// 1. Has the preference flag enabled (profiles.notif_*)
// 2. Is NOT in quiet hours (preferences.quiet_hours_enabled + their timezone)
// 3. Or notification type is not in TYPE_TO_FLAG (defaults allow)
```

### Server-Side (`supabase/functions/_shared/prefs.ts`)

**`filterByPref(db, userIds, flag)`** — bulk filter for edge functions:

```ts
// Returns { allowed: string[], blocked: string[] }
// Filters by preference flag AND quiet hours per user's timezone
```

---

## Timezone & Quiet Hours

### Storage
- **All times in DB**: UTC (timestamp with time zone)
- **Quiet hours in DB**: `profiles.quiet_hours_start` and `profiles.quiet_hours_end` as HH:MM strings (e.g., `"22:00"`, `"08:00"`)
- **User timezone**: `profiles.timezone` as IANA string (e.g., `"America/New_York"`, `"Asia/Kolkata"`)

### Detection & Sync
- **On login**: Device timezone detected via `Intl.DateTimeFormat().resolvedOptions().timeZone` and saved to `profiles.timezone`
- **On app foreground**: Timezone re-detected and updated (catches timezone changes during travel, DST transitions)

### Conversion
**Server-side (edge functions):**
```ts
import { inQuietHours } from './prefs.ts';

// Uses Intl.DateTimeFormat with user's stored timezone
if (inQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end, prefs.timezone)) {
  // User is in quiet hours — block non-urgent notifications
  return; // or throw 403
}
```

**Client-side (React Native):**
```ts
import { formatInTz } from '@/lib/dates';

// Display appointment time in user's local timezone
const localTime = formatInTz(utcTimestamp, userTimezone, { 
  hour: '2-digit', 
  minute: '2-digit' 
});
```

---

## Delivery Windows

### Immediate (Urgent)
- Lost alerts
- Playdate updates
- Social interactions (likes, follows)
- Chat messages
- Event RSVPs
- Family invite notifications

**Pattern:** Fired immediately if preference gate passes and quiet hours don't block.

### Morning Window (Non-Urgent)
- Vaccine reminders
- Birthday/memorial
- Appointment reminders

**Pattern:** Hourly cron checks; only sends if current time is 8:00–9:59 AM in user's local timezone.

**Cron schedules:**
- `send-vaccine-reminder` — `23 * * * *` (every hour at :23)
- `send-birthday-memorial` — `17 * * * *` (every hour at :17)
- `send-appointment-reminder` — `0 * * * *` (every hour at :00)

**Why morning window?** These are non-urgent reminders. Hourly runs + local timezone check ensures global delivery without timezone bias. If quiet hours block the 8 AM run, the 9 AM run catches them. No user is woken at 3 AM.

---

## Deduplication

### Immediate notifications
```ts
// After insert, check last 24h for same type+pet+user
const { data: recent } = await supabase
  .from('notification_logs')
  .select('id')
  .eq('user_id', userId)
  .eq('type', 'post_like')
  .eq('data->post_id', postId)
  .gte('created_at', oneDayAgo);

if (recent?.length > 0) return; // Already sent today
```

### Morning-window reminders
```ts
// Vaccine reminder: per-user per-vaccine per-date
const dedupKey = `${userId}:${vaccineId}:${nextDueDate}`;

// Birthday/memorial: per-user per-pet per-year
const dedupKey = `${userId}:${petId}:${year}`;
```

---

## Medication Reminders (Local Device Only)

Medication reminders are NOT pushed to the notification center. Instead, they use local device notifications scheduled via `expo-notifications`:

- **Storage**: `medications.remind_time` (HH:MM time), `medications.notif_id` (Expo notification ID)
- **Trigger**: Daily/weekly/monthly repeating trigger based on `medications.frequency`
- **Gating**: Checks `notif_health` preference before scheduling
- **Cancellation**: Old notification is cancelled before scheduling a new one (e.g., if user changes the time)

**Why local?** Medications are sensitive—users should see them even if the app is backgrounded or offline. Local notifications fire even when the server is unreachable.

---

## Role-Based Access Control

### Four Roles: `owner`, `caretaker`, `caregiver`, `viewer`

Defined in `lib/permissions.ts`:

```ts
export type PetRole = 'owner' | 'caretaker' | 'caregiver' | 'viewer';

const PERMISSIONS = {
  owner:     { canScan: true,  canLogHealth: true,  canPost: true,  canManageFamily: true, ... },
  caretaker: { canScan: true,  canLogHealth: true,  canPost: true,  canManageFamily: false, ... },
  caregiver: { canScan: true,  canLogHealth: false, canPost: false, canManageFamily: false, ... },
  viewer:    { canScan: false, canLogHealth: false, canPost: false, canManageFamily: false, ... },
};
```

### Health Screen Gates
All health sub-screens (`vaccines`, `appointments`, `medications`, `records`, `weights`, `insurance`) import and use `getPermissions`:

```tsx
const perms = getPermissions(petRoles[activePetId] ?? 'owner');

if (!perms.canLogHealth) {
  Alert.alert('No permission', permissionDeniedMsg('add vaccines'));
  return;
}
```

- **Add/Edit/Delete buttons**: Hidden and blocked for caregiver/viewer
- **Read-only list**: Visible to all roles (everyone can see the pet's health history)

### Authorization in Edge Functions
Playdates, health actions, and family management are protected server-side:

```ts
// isPetMember now requires role = 'caretaker'
// Only owner or caretaker can perform playdate actions
const { data: fam } = await db
  .from('pet_family')
  .select('id')
  .eq('pet_id', petId)
  .eq('user_id', userId)
  .eq('role', 'caretaker')
  .limit(1);
```

---

## Pro Subscription Enforcement

### Server-Side Gate
**File:** `supabase/functions/_shared/requirePro.ts`

Checks the **calling user's own subscription**, not the pet owner's:

```ts
async function requirePro(db, userId): Promise<'ok' | 'free' | 'expired' | 'grace'> {
  const { data } = await db
    .from('subscriptions')
    .select('tier, status, expires_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data || data.tier === 'free') return 'free';
  if (data.status === 'grace_period') return 'grace'; // Allow during grace period
  if (data.status === 'expired' || data.status === 'cancelled') {
    if (!data.expires_at || new Date(data.expires_at) < new Date()) return 'expired';
  }
  return 'ok';
}
```

**Applied to all 4 AI edge functions** right after the auth guard:

| Function | Check |
|---|---|
| `analyze-pet-mood` | Blocks free users from running mood scans |
| `parse-health-record` | Blocks free users from parsing documents |
| `vet-chat` | Blocks free users from chatting with AI vet |
| `symptom-scan` | Blocks free users from symptom analysis |

**Response on block:**
```json
{
  "error": "Pro subscription required",
  "code": "pro_required"
}
```
HTTP 402 Payment Required.

### Client-Side Paywall
**Pattern:** Catch 402, show upgrade alert with "Upgrade" button

Applied to all 5 calling screens:
- `app/ai/vet-chat.tsx`
- `app/ai/symptom-scan.tsx`
- `app/ai/mood-camera.tsx`
- `app/health/records.tsx` (background job)
- `app/health/record/[id].tsx` (retry)

```tsx
if (res.status === 402 && errData.code === 'pro_required') {
  Alert.alert('Pro feature', 'Upgrade to use this feature.', [
    { text: 'Not now', style: 'cancel' },
    { text: 'Upgrade', onPress: () => router.push('/subscription/plans') },
  ]);
  return; // Exit gracefully
}
```

### Why Per-User, Not Per-Pet?
A **caretaker on a free account cannot use Pro features** even if invited to a Pro owner's pet. Subscription is personal:

| Scenario | Result |
|---|---|
| Owner (Pro) runs mood scan on their pet | ✅ Works |
| Caretaker (free) invited to same pet, tries to run scan | ❌ 402, see upgrade prompt |
| Caretaker upgrades to Pro | ✅ Can now run scans |

This prevents monetization bypass: one Pro subscription cannot be shared across unlimited family members.

---

## Implementation Checklist

### Notifications
- [x] `lib/notifications.ts` — TYPE_TO_FLAG map covers all types
- [x] `lib/db/medications.ts` — added `remind_time`, `notif_id` columns
- [x] `app/health/medications.tsx` — local notification scheduling
- [x] All edge functions — use `filterByPref()` for preference gates
- [x] `send-appointment-reminder/index.ts` — timezone-aware formatting
- [x] `send-birthday-memorial/index.ts` — hourly cron + morning window
- [x] `send-vaccine-reminder/index.ts` — role-filtered recipients

### Permissions
- [x] `lib/types.ts` — added `caregiver` to role types
- [x] `lib/permissions.ts` — defined role → capability matrix
- [x] All 7 health sub-screens — permission gates on write actions
- [x] Edge functions — role checks on playdate and family actions

### Subscriptions
- [x] `supabase/functions/_shared/requirePro.ts` — subscription gate helper
- [x] All 4 AI edge functions — added Pro check after auth
- [x] All 5 calling screens — 402 handler + upgrade alert

### Timezone
- [x] `app/_layout.tsx` — detect + save timezone on login and foreground
- [x] `lib/dates.ts` — `formatInTz()` utility for display
- [x] All edge functions — use stored timezone in quiet-hours checks
- [x] Cron jobs — hourly schedules with per-user morning window

---

## Testing Guide

### Timezone Behavior
```
1. Log in as user A (timezone: America/New_York)
2. Set quiet hours: 22:00–08:00
3. Trigger a non-urgent reminder (vaccine, birthday)
   → Should NOT send at 3 AM ET (outside window)
   → Should send at 8 AM ET (in morning window, outside quiet)
4. Travel to Asia/Kolkata (set manually in settings)
   → Timezone auto-saved on next foreground
   → Birthday still sends at 8 AM local (IST), not the old time
```

### Role-Based Access
```
1. Owner invites caretaker to a pet
2. Caretaker views vaccines (can read list) ✅
3. Caretaker tries to add vaccine
   → Alert: "Your role doesn't allow you to log health data" ❌
4. Owner runs AI mood scan
   → Works ✅
5. Caretaker (free tier) tries to run mood scan
   → 402 response → Alert: "Upgrade to use AI Mood Analysis" ❌
6. Caretaker upgrades to Pro
   → Can now run mood scans ✅
```

### Preference Gates
```
1. User disables notifHealth in preferences
2. Vaccine reminder cron runs
   → User blocked by filterByPref() → no notification sent
3. User enables notifAppointment but disables quiet hours override
4. Appointment reminder cron runs
   → Within quiet hours → server blocks → no notification
5. User enables quiet hours override in preference store
   → Next reminder: sent despite quiet hours
```

---

## Database Migrations

Applied in this session:

```sql
-- Medications reminder time
ALTER TABLE medications
  ADD COLUMN IF NOT EXISTS remind_time time,
  ADD COLUMN IF NOT EXISTS notif_id text;

-- Vaccine T2/T3 prices (for backtest alignment)
ALTER TABLE screener
  ADD COLUMN IF NOT EXISTS t2_price numeric(20,4),
  ADD COLUMN IF NOT EXISTS t3_price numeric(20,4);

-- Profiles already has:
--   timezone (IANA string, DEFAULT 'UTC')
--   notif_* columns (boolean)
--   quiet_hours_enabled, quiet_hours_start, quiet_hours_end
```

---

## Key Files Reference

### Core Logic
- `lib/notifications.ts` — preference gate map & recipientAllowsNotif()
- `lib/permissions.ts` — role → permissions matrix
- `lib/dates.ts` — timezone conversion utilities
- `supabase/functions/_shared/requirePro.ts` — subscription gate
- `supabase/functions/_shared/prefs.ts` — quiet hours & preference filtering

### Edge Functions (All Deployed)
- `send-vaccine-reminder/index.ts` — role-filtered, morning-window
- `send-appointment-reminder/index.ts` — timezone-aware formatting
- `send-birthday-memorial/index.ts` — all roles, year-based dedup
- `analyze-pet-mood/index.ts` — Pro gate
- `parse-health-record/index.ts` — Pro gate
- `vet-chat/index.ts` — Pro gate
- `symptom-scan/index.ts` — Pro gate

### Client Screens
- `app/(tabs)/health.tsx` — tab-level permission check
- `app/health/{vaccines,appointments,medications,records}.tsx` — write-action gates
- `app/ai/{vet-chat,symptom-scan,mood-camera}.tsx` — 402 Pro handlers
- `app/_layout.tsx` — timezone detection on login & foreground

### Cron Jobs (via pg_cron)
- `send-vaccine-reminder` → `23 * * * *` (every hour, :23)
- `send-appointment-reminder` → `0 * * * *` (every hour, :00)
- `send-birthday-memorial` → `17 * * * *` (every hour, :17)
- `cron-periodic-lost-alerts` → `*/5 * * * *` (every 5 min)
- `cron-playdate-notifications` → `0 * * * *` (every hour)
- `media-retention-cleanup` → `0 0 * * *` (daily midnight)

---

## Glossary

- **Dedup key**: Unique identifier to prevent re-sending the same notification in the same cycle
- **Quiet hours**: User-configured window (e.g., 22:00–08:00) where non-urgent notifications are blocked
- **Morning window**: 8:00–9:59 AM in user's local timezone; used for non-urgent reminders
- **TYPE_TO_FLAG**: Map of notification type string → preference store key (e.g., `vaccine_reminder` → `notifHealth`)
- **Role**: Pet family membership level (owner, caretaker, caregiver, viewer) controlling what actions a user can perform
- **Subscription tier**: User's RevenueCat subscription status (free, pro, ultimate); per-user, not per-pet
- **Timezone**: User's IANA timezone string (e.g., `America/New_York`); used for quiet-hours and morning-window checks; auto-detected on login & app foreground
