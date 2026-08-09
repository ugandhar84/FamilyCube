# Features QA Reference

User-facing behavior for notifications, permissions, and subscriptions. Use this to write test cases.

---

## Notifications Overview

### What the User Sees

| Notification | Where | Timing | Can User Control |
|---|---|---|:---:|
| Vaccine reminder | Push + In-app | 8–9 AM their time | ✅ notifHealth pref |
| Appointment reminder | Push + In-app | Immediately | ✅ notifAppointment pref |
| Medication reminder | Device only (local) | User-configured time | ✅ toggle on/off, choose time |
| Birthday / memorial | Push + In-app | 8–9 AM their time | ✅ notifDaily pref |
| Lost pet alert | Push + In-app | Immediately | ✅ notifLost pref |
| Playdate update | Push + In-app | Immediately | ✅ notifPlaydate pref |
| Post like / comment | Push + In-app | Immediately | ✅ notifFamily pref |

### Preference Controls

Settings → Notifications:
- **Health reminders** — Vaccines, appointments, medications
- **Appointment reminders** — Vet visits only
- **Lost & found** — Lost and found pet alerts
- **Playdates** — Playdate invites and updates
- **Daily digest** — Birthdays, memorials, daily tips
- **Family & social** — Follows, mentions, likes, comments, family invites
- **Chat & events** — Chat messages, event RSVPs
- **Quiet hours** — Toggle on/off, set custom time range

### Quiet Hours Behavior

If user has quiet hours enabled (e.g., 22:00–08:00):
- **Urgent notifications** (playdates, chat, likes) → still sent
- **Non-urgent** (vaccine reminders, birthdays) → blocked during quiet hours → retried next hour
- **Medication reminders** → blocked by "Quiet hours" toggle in meds form

### Timezone Behavior

On first login:
- App detects device timezone automatically
- Saved to user's profile

When traveling (timezone changes):
- Next time user opens app → timezone auto-updated
- Notifications in subsequent hours use new timezone
- Old reminders already scheduled on device continue in old timezone (local-only)

Example:
```
User in NYC (EST), quiet hours 22:00–08:00
Opens app at 11 PM NYC time → vaccine reminder blocks (in quiet)

User travels to London (GMT+0)
Opens app at 2 AM London time (same UTC moment)
Next vaccine reminder hour → uses GMT+0 quiet hours
2 AM London (in quiet) → still blocked
App shows "No new reminders" until 8 AM London time
```

---

## Health Features

### Vaccines Screen

**Who can see it?** All roles (owner, caretaker, caregiver, viewer)

**Who can add/edit/delete?** Owner + caretaker only

**Behavior when blocked:**
```
Caregiver or Viewer taps "Add Vaccine"
↓
Alert: "Your role doesn't allow you to log health data. Ask the pet owner to update your access."
↓
Button remains disabled; list is read-only
```

### Appointments Screen

**Who can see it?** All roles

**Who can add/edit/delete?** Owner + caretaker only

**Reminder sent to:** Owner + caretaker (24h before appointment)

**Example:**
```
Owner creates appointment: "Teeth cleaning, Jul 20 @ 3 PM"
↓
At 3 PM, Jul 19 (24h before):
  - Owner gets push: "🏥 Teeth cleaning appointment in 24h"
  - Caretaker gets push: "🏥 Teeth cleaning appointment in 24h"
  - Viewer gets nothing (role can't act on vet visit)
```

### Medications

**Who can see it?** All roles

**Who can add/edit/delete?** Owner + caretaker only

**Medication reminders:**
- Sent to owner + caretaker + caregiver (all who can administer)
- Local device notifications only (even if offline)
- Time picker: pick when to be reminded daily (e.g., 8:00 AM)
- Toggle: on/off per medication
- Respects "Quiet hours" preference

**Caregiver can:**
- View medications list
- See reminder schedule
- Receive reminders on their device ✅

**Caregiver cannot:**
- Add medication
- Edit medication
- Delete medication
- Change reminder time

---

## Role-Based Access

### Who Gets What Access?

| Capability | Owner | Caretaker | Caregiver | Viewer |
|---|:---:|:---:|:---:|:---:|
| View pet profile | ✅ | ✅ | ✅ | ✅ |
| Edit pet name/photo | ✅ | ❌ | ❌ | ❌ |
| Delete pet | ✅ | ❌ | ❌ | ❌ |
| Log health (vaccines, appointments, weight) | ✅ | ✅ | ❌ | ❌ |
| Log daily care (meals, water, activities) | ✅ | ✅ | ✅ | ❌ |
| Run AI mood scan | ✅ | ✅ | ✅ | ❌ |
| Parse health records (AI) | ✅ | ✅ | ❌ | ❌ |
| Chat with AI vet (Pro) | ✅ | ✅ | ✅ | ❌ |
| Create post | ✅ | ✅ | ✅ | ❌ |
| Organize playdates | ✅ | ✅ | ❌ | ❌ |
| Manage family members | ✅ | ❌ | ❌ | ❌ |

### Inviting Family

Owner invites caretaker/caregiver/viewer via email.

When caregiver is invited:
- Can see pet health history (read-only)
- Can log daily care (feeding, water)
- Can run AI mood scan (if they have Pro)
- Cannot schedule vet visits or add vaccines
- Cannot access pet admin settings

When viewer is invited:
- Can see pet profile and health summary
- Receives birthday/memorial/lost pet alerts
- Cannot make any changes
- Purely informational access (grandparents, close friends)

---

## Pro Features

### What's Pro Only?

| Feature | Free | Pro |
|---|:---:|:---:|
| View pet profile | ✅ | ✅ |
| Log health data (manual) | ✅ | ✅ |
| Log daily care (manual) | ✅ | ✅ |
| **AI Mood Scan** | ❌ | ✅ |
| **AI Health Record Parser** | ❌ | ✅ |
| **AI Vet Chat** | ❌ | ✅ |
| **AI Symptom Scan** | ❌ | ✅ |
| Playdates | ✅ | ✅ |
| Social posts | ✅ | ✅ |
| Pets limit | 1 | Unlimited |

### Subscription is Per-User, Not Per-Pet

**Scenario 1:**
```
Owner (Pro) invites Caretaker (Free) to their pet
↓
Owner can run AI mood scan ✅
Caretaker tries to run AI mood scan
↓
Alert: "Pro feature. Upgrade to use AI Mood Analysis."
Tap "Upgrade" → navigate to /subscription/plans
Caretaker can now see plans and purchase their own Pro
```

**Scenario 2:**
```
Owner (Free) invites Caretaker (Pro) to their pet
↓
Caretaker can run AI mood scan ✅ (they have their own Pro)
Owner can see results ✅ (read-only access to caretaker's AI analysis)
Owner tries to run AI mood scan
↓
Alert: "Pro feature. Upgrade to use AI Mood Analysis."
```

### Upgrade Flow

User taps a Pro feature button:

**If they have Pro:**
```
Feature works normally
```

**If they don't have Pro:**
```
UI gate triggers (client-side)
↓
Alert: "Pro feature. Upgrade to use [Feature Name]."
↓
User taps "Upgrade" 
↓
Navigate to /subscription/plans
↓
Can view plans and purchase
↓
Upgrade synced via RevenueCat
↓
User can now use the feature
```

---

## Timezone Behavior (User Perspective)

### Scenario: User in PST, Quiet Hours 10 PM–8 AM

**July 15, 10 PM PST (06:00 UTC next day):**
User's birthday reminder for their dog is scheduled.

**July 16:**
- 6 AM PST (2 PM UTC): No reminder yet (morning window is 8–9 AM PST)
- 8 AM PST (4 PM UTC): ✅ Reminder sent ("It's Fluffy's birthday!")
- 8:30 AM PST: Later — can't re-send today (deduped)
- 10 AM PST (6 PM UTC): Too late — morning window ended

**User travels to London (GMT+0) during the day:**

**July 17:**
- Opens app in London, timezone auto-updated to GMT+0
- No reminder yesterday because already sent
- Morning window is now 8–9 AM GMT+0
- 8 AM GMT+0 (midnight PST): App is closed; next reminder tomorrow

**July 18:**
- Opens app at 8:30 AM GMT+0
- No reminder yet today (only during 8–9 AM window, user was asleep)
- Next reminder tomorrow

---

## Quiet Hours (User Perspective)

### Setup

Settings → Notifications → Quiet hours:
- **Toggle:** On/Off
- **Start time:** 22:00 (10 PM)
- **End time:** 08:00 (8 AM)

### Behavior

**Non-urgent notifications** (vaccines, birthdays, health reminders):
- Between 10 PM–8 AM: blocked
- After 8 AM: sent
- If blocked by quiet hours, retried next hour

**Urgent notifications** (playdates, chat, likes):
- Always sent, even during quiet hours

**Medication reminders:**
- Have their own "Quiet hours" toggle in the medication form
- Independent of profile quiet hours

### Example

User:
```
Quiet hours: 22:00–08:00 (enabled)
Time zone: America/New_York
```

Timeline (EDT = UTC-4):
```
July 15, 8:00 AM EDT
↓
Vaccine reminder cron runs (morning window + not in quiet)
↓
✅ User gets reminder: "Fluffy's rabies shot is due in 7 days"

July 15, 11:00 PM EDT (in quiet hours)
↓
Birthday reminder cron runs
↓
❌ User is in quiet hours (11 PM in their timezone)
↓
Reminder is skipped this hour

July 16, 8:00 AM EDT (out of quiet hours, morning window)
↓
Birthday reminder cron runs again
↓
✅ User gets reminder: "Happy birthday, Fluffy!" (24h later but only attempted once/hour)
```

---

## Testing Cases

### Timezone Detection

```
Test: User logs in from different timezone
1. Log in from PST (America/Los_Angeles)
   → Check profiles table: timezone = "America/Los_Angeles"
2. Travel to EST (America/New_York)
3. Open app
   → Check profiles table: timezone = "America/New_York"
4. Receive reminder → verify time is shown in EST
```

### Quiet Hours Blocking

```
Test: Reminder blocked by quiet hours
1. User sets quiet hours: 22:00–08:00
2. Current time: 23:00 (in quiet hours)
3. Trigger vaccine reminder
   → No notification sent (blocked by quiet hours)
4. Current time: 08:00 (out of quiet hours)
5. Trigger same reminder again
   → Notification sent ✅
```

### Role Permissions

```
Test: Caregiver tries to add vaccine
1. Owner invites Caregiver to pet
2. Caregiver opens Health → Vaccines
3. Caregiver sees list of vaccines (read-only) ✅
4. Caregiver taps "Add Vaccine"
   → Alert: "Your role doesn't allow you to log health data"
5. Button is disabled ❌
6. Caregiver can view existing vaccines ✅
```

### Pro Gate

```
Test: Free user tries AI mood scan
1. Free-tier user opens pet
2. Taps "Analyze Mood" button
3. Takes a photo
4. Server returns 402 + { code: 'pro_required' }
5. Alert appears: "Pro feature. Upgrade to use AI Mood Analysis."
6. User taps "Upgrade"
7. Navigates to /subscription/plans ✅
```

### Notification Preferences

```
Test: User disables health notifications
1. Open Settings → Notifications
2. Toggle off "Health reminders"
3. Trigger vaccine reminder → not sent ❌
4. Toggle on "Health reminders"
5. Trigger same reminder → sent ✅
```

---

## Error Messages (What Users See)

### Role Permission Denied
```
"Your role doesn't allow you to log health data. Ask the pet owner to update your access."
```

### Quiet Hours (Displayed in Log)
```
During quiet hours, non-urgent reminders are held until morning. 
Check back tomorrow morning to see delayed notifications.
```

### Timezone Not Detected
```
We couldn't detect your timezone. 
Reminders will use your device's default (UTC). 
Update manually in Settings → Notifications.
```

### Pro Required (Alert)
```
Title: "Pro feature"
Message: "Upgrade to use AI Mood Analysis."
Button: "Upgrade" → /subscription/plans
```

### Medication Reminder Disabled
```
"Medication reminders are off. 
Toggle on in the medication details to enable reminders."
```

---

## Data Privacy Notes

### What's Stored

When sending a notification, the system stores:
- User ID (recipient)
- Notification type
- Title & body
- Metadata (post_id, pet_id, etc.)
- Timestamp (UTC)
- Timezone of recipient (for quiet-hours evaluation)

### What's NOT Stored

- Push token (only kept in push_tokens table for delivery)
- Subscription details (only fetched server-side during gate check)
- Preference values (fetched fresh on each check, not cached)

### Retention

- `notification_logs` entries → kept indefinitely (user's history)
- `push_tokens` → deleted when app uninstalled (handled by device)
- Dedup keys → only checked within 24h of send (then forgotten)
