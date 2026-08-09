# Implementation Guide: Notifications, Permissions & Subscriptions

For developers implementing features that touch notifications, roles, or Pro subscriptions.

---

## Sending a Notification

### Step 1: Check Preference Gate (Client)

Before writing to `notification_logs` or invoking a push:

```tsx
import { recipientAllowsNotif } from '@/lib/notifications';

// In an event handler:
const allowed = await recipientAllowsNotif(targetUserId, 'post_like');
if (!allowed) return; // User has this notification disabled or is in quiet hours

// Proceed to write notification...
```

### Step 2: Write to notification_logs

```tsx
await supabase.from('notification_logs').insert({
  user_id: targetUserId,
  title: 'Alice liked your post',
  body: 'Your post got 1 like.',
  type: 'post_like', // Must be a key in TYPE_TO_FLAG
  data: { post_id, author_id },
});
```

### Step 3: Send Push (Optional)

```tsx
await supabase.functions.invoke('playdates', {
  body: {
    action: 'push', // trigger push specifically
    type: 'post_like', // used by handlePush() to gate again server-side
    user_id: targetUserId,
    title: 'Alice liked your post',
    body: 'Your post got 1 like.',
    data: { post_id, author_id },
  },
});
```

---

## Server-Side Notification (Edge Function)

### Pattern: Bulk notification to multiple users

```ts
// app/health/records.tsx → parse-health-record edge function

// 1. Find all recipients (owner + family with role filter)
const allUserIds = [owner_id, ...caretaker_ids, ...caregiver_ids];

// 2. Filter by preference gate + quiet hours
import { filterByPref } from './prefs.ts';
const { allowed: allowedUserIds } = await filterByPref(supabase, allUserIds, 'notif_health');

// 3. Fetch timezones for all allowed users
const { data: userProfiles } = await supabase
  .from('profiles')
  .select('id, timezone')
  .in('id', allowedUserIds);

const tzMap = new Map(userProfiles.map(p => [p.id, p.timezone]));

// 4. Build messages (possibly per-timezone for display time)
const messages = allowedUserIds.map(uid => ({
  user_id: uid,
  title: 'Health record analyzed',
  body: `Your ${petName}'s health record was analyzed at ${formatTime(uid, tzMap)}`,
  type: 'health_alert',
  data: { record_id, pet_id },
}));

// 5. Log + push
await supabase.from('notification_logs').insert(messages);
// Push via Expo...
```

### Handling Quiet Hours Per User

```ts
import { inQuietHours } from './prefs.ts';

for (const userId of allowedUserIds) {
  const prefs = prefsMap.get(userId);
  if (!prefs) continue;

  // User's timezone is used to check if they're in quiet hours right now
  if (inQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end, prefs.timezone)) {
    continue; // Skip this user — they're in quiet hours
  }

  // Send to this user...
}
```

---

## Role-Based Access in a New Screen

### Setup

```tsx
import { getPermissions, permissionDeniedMsg } from '@/lib/permissions';
import { usePetStore } from '@/store/petStore';
import { Alert } from 'react-native';

export default function MyHealthScreen() {
  const { activePetId, petRoles } = usePetStore();
  const perms = getPermissions(activePetId ? petRoles[activePetId] : 'owner');

  // perms.canLogHealth, perms.canEdit, etc. are now booleans
}
```

### Blocking a Write Action

```tsx
const handleAddVaccine = async () => {
  // 1. Check role permission
  if (!perms.canLogHealth) {
    Alert.alert('No permission', permissionDeniedMsg('add vaccines'));
    return;
  }

  // 2. Proceed with write...
  await saveVaccine(petId, vaccineData);
};
```

### Hiding UI for Non-Permitted Roles

```tsx
// Hide the FAB button if caregiver/viewer
{perms.canLogHealth && (
  <TouchableOpacity onPress={handleAddVaccine} style={s.fab}>
    <Ionicons name="add" size={24} color="#fff" />
  </TouchableOpacity>
)}

// Always show the read-only list (all roles can view)
<FlatList data={vaccines} renderItem={renderVaccine} />
```

---

## Role Check in an Edge Function

### Check if caller can perform action

```ts
// supabase/functions/my-function/index.ts

// Method 1: Owner-only
const { data: pet } = await supabase.from('pets')
  .select('owner_id').eq('id', pet_id).single();

if (pet.owner_id !== user.id) {
  return json({ error: 'Only the owner can do this' }, 403);
}

// Method 2: Owner or caretaker
const { data: pet } = await supabase.from('pets')
  .select('owner_id').eq('id', pet_id).single();

if (pet.owner_id !== user.id) {
  const { data: fam } = await supabase.from('pet_family')
    .select('role').eq('pet_id', pet_id).eq('user_id', user.id).single();
  
  if (fam?.role !== 'caretaker') {
    return json({ error: 'Caretaker or owner only' }, 403);
  }
}

// Method 3: Any role on the pet (owner, caretaker, caregiver, viewer)
const { data: pet } = await supabase.from('pets')
  .select('owner_id').eq('id', pet_id).single();

if (pet.owner_id !== user.id) {
  const { data: fam } = await supabase.from('pet_family')
    .select('id').eq('pet_id', pet_id).eq('user_id', user.id).single();
  
  if (!fam) {
    return json({ error: 'Not a member of this pet' }, 403);
  }
}
```

---

## Pro Subscription Gate (Edge Function)

### Add to any Pro-only feature

```ts
// analyze-pet-mood, vet-chat, symptom-scan, parse-health-record

import { requirePro, proRequiredResponse } from '../_shared/requirePro.ts';

// After auth check:
const { data: { user }, error: authErr } = await supabase.auth.getUser(...);
if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

// Add Pro gate:
const svcClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const proStatus = await requirePro(svcClient, user.id);
if (proStatus === 'free' || proStatus === 'expired') {
  return proRequiredResponse(); // 402 + { code: 'pro_required' }
}

// Continue with feature...
```

### Client-Side Error Handling

```tsx
// For functions.invoke():
const { error } = await supabase.functions.invoke('parse-health-record', { body });
if (error?.status === 402) {
  Alert.alert('Pro feature', 'Upgrade to use this.', [
    { text: 'Upgrade', onPress: () => router.push('/subscription/plans') },
  ]);
  return;
}

// For fetch():
const res = await fetch(`${url}/functions/v1/analyze-pet-mood`, { ... });
if (res.status === 402) {
  const errData = await res.json();
  if (errData.code === 'pro_required') {
    Alert.alert('Pro feature', 'Upgrade to use AI Mood Analysis.', [
      { text: 'Upgrade', onPress: () => router.push('/subscription/plans') },
    ]);
    return;
  }
}
```

---

## Timezone Detection & Conversion

### Auto-detect on Login

```tsx
// app/_layout.tsx (already in place)

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (tz) {
  supabase.from('profiles').update({ timezone: tz })
    .eq('id', user.id);
}
```

### Re-detect on Foreground (Travel)

```tsx
// In AppState listener (already in place)

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (tz && user) {
  supabase.from('profiles').update({ timezone: tz })
    .eq('id', user.id);
}
```

### Convert UTC to User Timezone (Display)

```tsx
import { formatInTz } from '@/lib/dates';

// UTC timestamp from DB
const appointmentTime = '2026-07-15T14:30:00Z';
const userTimezone = 'America/New_York';

// Show in user's local timezone
const display = formatInTz(appointmentTime, userTimezone, {
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
  day: 'numeric',
});
// → "Jul 15, 2:30 PM" (EDT = UTC-4)
```

### Server-Side Quiet Hours Check

```ts
// In edge function
import { inQuietHours } from './prefs.ts';

const prefs = await fetchPrefs(db, userId);

if (inQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end, prefs.timezone)) {
  return json({ error: 'User is in quiet hours' }, 429);
}
```

---

## Morning-Window Notifications (Non-Urgent)

### Adding a New Morning-Window Reminder

1. **Create the edge function** — use the `send-vaccine-reminder` pattern:
   ```ts
   // supabase/functions/send-my-reminder/index.ts
   
   import { isMorningFor } from './helpers.ts'; // copy from send-birthday-memorial
   
   // Check each recipient:
   for (const userId of allowedUsers) {
     const tz = userTzMap.get(userId);
     if (!isMorningFor(tz)) continue; // Skip if not 8-9 AM their time
     
     // Send to this user...
   }
   ```

2. **Add to TYPE_TO_FLAG**:
   ```ts
   // lib/notifications.ts
   my_reminder: 'notifDaily', // or the appropriate preference flag
   ```

3. **Schedule the cron** (hourly, at an off-minute):
   ```sql
   SELECT cron.schedule(
     'send-my-reminder',
     '21 * * * *', -- every hour at :21 (avoid :00, :30)
     'SELECT net.http_post(...)'
   );
   ```

4. **Add to edge function list in package**:
   - Add folder under `supabase/functions/`
   - Deploy: `supabase functions deploy send-my-reminder`

---

## Adding a New Notification Type

### Step 1: Define the type

```ts
// lib/notifications.ts
const TYPE_TO_FLAG = {
  my_new_notification: 'notifDaily', // or appropriate flag
};
```

### Step 2: Determine recipients

- Who should receive it? Owner only? All roles? Caretaker + owner?
- Add to the recipient matrix in `NOTIFICATIONS_AND_PERMISSIONS.md`

### Step 3: Write to DB

```tsx
// Client or edge function
await supabase.from('notification_logs').insert({
  user_id: recipientId,
  title: 'Notification title',
  body: 'Notification body',
  type: 'my_new_notification', // Must match TYPE_TO_FLAG key
  data: { entity_id, context },
});
```

### Step 4: Send push (optional)

```tsx
await supabase.functions.invoke('playdates', {
  body: {
    action: 'push',
    type: 'my_new_notification',
    user_id: recipientId,
    title: 'Notification title',
    body: 'Notification body',
  },
});
```

### Step 5: Test preference gate

- Disable the preference flag (`notif_*`) in user's settings
- Notification should NOT be sent (blocked by `recipientAllowsNotif`)
- Enable it back, notification should appear

---

## Common Patterns

### Fetch profiles with multiple columns

```ts
const { data } = await supabase.from('profiles')
  .select('id, timezone, notif_health, notif_appointment, quiet_hours_enabled, quiet_hours_start, quiet_hours_end')
  .in('id', userIds);
```

### Check if user is owner of pet

```ts
const { data: pet } = await supabase.from('pets')
  .select('owner_id').eq('id', petId).single();

const isOwner = pet.owner_id === userId;
```

### Get all family members with role

```ts
const { data: family } = await supabase.from('pet_family')
  .select('user_id, role').eq('pet_id', petId);

const caretakers = family.filter(f => f.role === 'caretaker').map(f => f.user_id);
const viewers = family.filter(f => f.role === 'viewer').map(f => f.user_id);
```

### Parse Expo push response

```ts
const expoRes = await fetch('https://exp.host/--/api/v2/push/send', { ... });
const result = await expoRes.json();

const successCount = (result.data ?? []).filter(d => d.status === 'ok').length;
const errors = (result.data ?? []).filter(d => d.status === 'error');
```

---

## Testing Checklist

### New Notification Type

- [ ] Type is in `TYPE_TO_FLAG`
- [ ] Preference gate blocks notification when flag is disabled
- [ ] Quiet hours block notification when applicable
- [ ] Timezone conversion works correctly (if applicable)
- [ ] Deduplication prevents spam
- [ ] Recipient list is correct (by role)
- [ ] Push sends only to users with tokens
- [ ] In-app log always written (even if push fails)

### New Role-Gated Action

- [ ] Owner can perform action
- [ ] Caretaker can (or cannot, as spec) perform action
- [ ] Caregiver is blocked with clear error message
- [ ] Viewer is blocked with clear error message
- [ ] UI button hidden for non-permitted roles
- [ ] Server-side role check prevents direct API calls

### New Pro Feature

- [ ] Client gate checks `usePaywall.gate('feature')` before allowing
- [ ] Edge function checks `requirePro()` and returns 402
- [ ] Client catches 402, shows upgrade alert
- [ ] Button navigates to `/subscription/plans`
- [ ] Pro user can perform action
- [ ] Free-tier user gets upgrade prompt

---

## Debugging

### Notification Not Sending

1. Check `TYPE_TO_FLAG` — type might not be mapped
   ```ts
   if (!TYPE_TO_FLAG['my_type']) return; // Defaults allow!
   ```

2. Check preference gate
   ```ts
   const allowed = await recipientAllowsNotif(userId, type);
   console.log('Gate result:', allowed);
   ```

3. Check quiet hours
   ```ts
   if (inQuietHours(start, end, timezone)) {
     console.log('User is in quiet hours, skipping');
   }
   ```

4. Check dedup
   ```ts
   const { data: recent } = await supabase
     .from('notification_logs')
     .select('id')
     .eq('user_id', userId)
     .eq('type', 'my_type')
     .eq('data->entity_id', entityId)
     .gte('created_at', oneDayAgo);
   
   if (recent?.length > 0) {
     console.log('Already sent today, skipping');
   }
   ```

### Role Gate Not Working

1. Check `pet_family` table — is the row actually there?
   ```sql
   SELECT * FROM pet_family WHERE pet_id = '...' AND user_id = '...';
   ```

2. Check role value
   ```ts
   console.log('User role:', fam?.role); // Should be 'caretaker', 'caregiver', or 'viewer'
   ```

3. Check petRoles cache in store
   ```tsx
   console.log('Pet roles:', petRoles); // May be stale
   // Refresh: await refetch pets
   ```

### Pro Gate Not Working

1. Check subscription row
   ```sql
   SELECT * FROM subscriptions WHERE user_id = '...' ORDER BY updated_at DESC LIMIT 1;
   ```

2. Check tier and status
   ```ts
   console.log('Tier:', data.tier, 'Status:', data.status, 'Expires:', data.expires_at);
   ```

3. Check requirePro return value
   ```ts
   const result = await requirePro(db, userId);
   console.log('Pro status:', result); // Should be 'ok' for Pro users
   ```

### Timezone Not Applied

1. Check stored timezone
   ```sql
   SELECT timezone FROM profiles WHERE id = '...';
   ```

2. Check if it's a valid IANA name
   ```ts
   try {
     new Intl.DateTimeFormat('en-US', { timeZone: tz });
   } catch {
     console.error('Invalid timezone:', tz);
   }
   ```

3. Check formatInTz output
   ```ts
   const result = formatInTz(timestamp, tz, { hour: '2-digit', minute: '2-digit' });
   console.log('Formatted:', result); // Should be in user's local time
   ```
