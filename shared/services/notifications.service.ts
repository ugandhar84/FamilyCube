// PawBond — Push Notification Setup
// Gracefully degrades when native modules aren't available (Expo Go).

import { Platform, AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { usePreferenceStore } from '@/store/preferenceStore';

// ── Client-side notification gate ────────────────────────────────────────────

/** Map Expo push notification type → preference store key */
const TYPE_TO_FLAG: Record<string, keyof ReturnType<typeof usePreferenceStore.getState>> = {
  // Appointments & health
  appointment_reminder:        'notifAppointment',
  vaccine_reminder:            'notifHealth',
  medication_reminder:         'notifHealth',
  health_alert:                'notifHealth',
  // Lost & found
  lost_alert:                  'notifLost',
  pet_found:                   'notifLost',   // DB stores 'pet_found' — was wrongly keyed as 'found_pet'
  found_pet:                   'notifLost',   // keep old key for any legacy push payloads
  // Playdates
  playdate_request:            'notifPlaydate',
  playdate_confirmed:          'notifPlaydate',
  playdate_accepted:           'notifPlaydate',
  playdate_declined:           'notifPlaydate',
  playdate_withdrawal:         'notifPlaydate',
  playdate_counter_proposal:   'notifPlaydate',
  playdate_cancelled:          'notifPlaydate',
  playdate_rescheduled:        'notifPlaydate',
  playdate_resend:             'notifPlaydate',
  playdate_expired:            'notifPlaydate',
  playdate_completion:         'notifPlaydate',
  playdate_reminder:           'notifPlaydate',
  // Chat
  chat_message:                'notifChat',
  playdate_message:            'notifChat',
  playdate_chat_message:       'notifChat',
  // Events
  event_rsvp:                  'notifEvent',
  event_update:                'notifEvent',
  // Family (care-sharing between pet family members)
  invite:                      'notifFamily',
  invite_accepted:             'notifFamily',
  family_invite:               'notifFamily',
  // Social feed — each has its own preference flag
  post_like:                   'notifPostLike',
  post_comment:                'notifPostComment',
  follow:                      'notifFollow',
  mention:                     'notifMention',
  new_post:                    'notifPostLike',   // "new post from someone you follow" — reuses post-like pref
  // Daily & milestones
  birthday_notif:              'notifDaily',
  memorial_notif:              'notifDaily',
  daily_tip:                   'notifDaily',
  daily_care:                  'notifDaily',
};

/** Map preference store key → profiles DB column */
const FLAG_TO_DB_COL: Record<string, string> = {
  notifAppointment: 'notif_appointment',
  notifLost:        'notif_lost',
  notifPlaydate:    'notif_playdate',
  notifChat:        'notif_chat',
  notifEvent:       'notif_event',
  notifFamily:      'notif_family',
  notifPostLike:    'notif_post_like',
  notifPostComment: 'notif_post_comment',
  notifFollow:      'notif_follow',
  notifMention:     'notif_mention',
  notifHealth:      'notif_health',
  notifDaily:       'notif_daily',
};

/**
 * Check if the recipient user allows a notification of the given type.
 * Fetches their preferences from the DB — used before writing to notification_logs
 * or invoking a push for another user.
 * Returns true (allow) when the profile is not found or the type is unknown.
 */
export async function recipientAllowsNotif(recipientId: string, type: string): Promise<boolean> {
  const flag = TYPE_TO_FLAG[type];
  if (!flag) return true;
  const col = FLAG_TO_DB_COL[flag];
  if (!col) return true;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('notif_family,notif_playdate,notif_chat,notif_event,notif_appointment,notif_lost,notif_health,notif_daily,notif_post_like,notif_post_comment,notif_follow,notif_mention,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,timezone')
      .eq('id', recipientId)
      .single();
    if (!data) return true;
    const row = data as Record<string, any>;
    if (row[col] === false) return false;
    if (row.quiet_hours_enabled && row.quiet_hours_start && row.quiet_hours_end) {
      if (recipientInQuietHours(row.quiet_hours_start as string, row.quiet_hours_end as string, row.timezone as string | null)) return false;
    }
    return true;
  } catch {
    return true; // fail open — don't drop notifications on transient errors
  }
}

/**
 * Quiet hours check using a specific IANA timezone — used when checking another user's
 * quiet hours from a sender's device (the sender's local clock is irrelevant).
 * Falls back to device local time if timezone is null/invalid.
 */
function recipientInQuietHours(start: string, end: string, timezone: string | null): boolean {
  const now = new Date();
  let nowMins: number;
  if (timezone) {
    try {
      const parts = Intl.DateTimeFormat('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
      }).formatToParts(now);
      const h = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '0', 10);
      const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
      nowMins = h * 60 + m;
    } catch {
      nowMins = now.getHours() * 60 + now.getMinutes();
    }
  } else {
    nowMins = now.getHours() * 60 + now.getMinutes();
  }
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins   = eh * 60 + em;
  if (startMins >= endMins) return nowMins >= startMins || nowMins < endMins;
  return nowMins >= startMins && nowMins < endMins;
}

/** Quiet hours check for the current device (uses device local time — correct for the logged-in user). */
function clientInQuietHours(start: string, end: string): boolean {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins   = eh * 60 + em;
  if (startMins >= endMins) return nowMins >= startMins || nowMins < endMins;
  return nowMins >= startMins && nowMins < endMins;
}

/**
 * Check if a notification of the given type should be shown on-device.
 * Reads from the Zustand preference store — no network call needed.
 * Pass the `type` field from notification.request.content.data.
 */
export function canShowNotification(notifType?: string): boolean {
  const prefs = usePreferenceStore.getState();

  // Quiet hours override everything
  if (prefs.quietHoursEnabled && clientInQuietHours(prefs.quietHoursStart, prefs.quietHoursEnd)) {
    return false;
  }

  if (!notifType) return true; // unknown type — allow
  const flag = TYPE_TO_FLAG[notifType];
  if (!flag) return true; // unmapped type — allow
  return prefs[flag] as boolean;
}

// ── Lazy-load native modules (not available in all Expo Go versions) ──────────

let Notifications: typeof import('expo-notifications') | null = null;
let Device: typeof import('expo-device') | null = null;

try {
  Notifications = require('expo-notifications');
} catch {
  console.warn('expo-notifications not available in this environment');
}

try {
  Device = require('expo-device');
} catch {
  console.warn('expo-device not available in this environment');
}

// ── Register notification action categories ───────────────────────────────────
// Called once at startup. Categories are cached by the OS — safe to re-register.

export async function registerNotificationCategories(): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.setNotificationCategoryAsync('FEEDING_REMINDER', [
      {
        identifier: 'fed_action',
        buttonTitle: '✓ Fed',
        options: { opensAppToForeground: false }, // iOS: handle silently in background
      },
    ]);
  } catch (e) {
    console.warn('[notifications] Could not register categories:', e);
  }
}

// ── Configure notification handler (only if module available) ─────────────────

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const notifType = notification.request.content.data?.type as string | undefined;
      const allowed = canShowNotification(notifType);
      // Suppress the iOS system banner when the app is in the foreground —
      // _layout.tsx already shows our own in-app banner via addNotificationReceivedListener.
      const isForegrounded = AppState.currentState === 'active';
      return {
        shouldPlaySound:  allowed,
        shouldSetBadge:   allowed,
        shouldShowBanner: allowed && !isForegrounded,
        shouldShowList:   true,
      };
    },
  });
}

// ── Register for push notifications ──────────────────────────────────────────

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Notifications || !Device) return null;

  if (!Device.isDevice) {
    console.warn('Push notifications only work on physical devices');
    return null;
  }

  // Create notification channels on Android
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
    });
    await Notifications.setNotificationChannelAsync('lost_alerts', {
      name: 'Lost Pet Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#E24B4A',
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Care Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('family', {
      name: 'Family Updates',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync('social', {
      name: 'Social & Playdates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }

  // Request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission not granted');
    return null;
  }

  // Get Expo push token — requires a real Expo project UUID in .env
  const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
  const isValidUuid = projectId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
  if (!isValidUuid) {
    // Silently skip — set EXPO_PUBLIC_PROJECT_ID in .env to enable push tokens
    return null;
  }
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return token ?? null;
  } catch (e) {
    console.warn('Could not get push token:', e);
    return null;
  }
}

// ── Save token to Supabase (called on login) ──────────────────────────────────

export async function savePushToken(userId: string): Promise<void> {
  const token = await registerForPushNotifications();
  if (!token) return;

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';

  // Upsert on token alone (UNIQUE(token) constraint) — atomically reassigns the
  // token to the current user. This prevents shared-device / Expo Go situations
  // where the same push token is stored for multiple user_ids, which causes every
  // user's cron notifications to fire on the same device.
  await supabase.from('push_tokens').upsert(
    { user_id: userId, token, platform, updated_at: new Date().toISOString() },
    { onConflict: 'token' }
  );
}

// ── Save token to members table (FamilyCube) ──────────────────────────────────
// Called whenever the active member switches. Writes the device's Expo push
// token to member_device_tokens, keyed on (member_id, device_id) — the fix
// for shared devices, where multiple members PIN-switch through the day and
// a single members.expo_push_token column can only ever hold the most
// recently active member's token, leaving everyone else stale. Also keeps
// writing members.expo_push_token as a "last known" fallback for edge
// functions / transition period — additive, not a replacement.

export async function saveTokenToMember(memberId: string): Promise<void> {
  const token = await registerForPushNotifications();
  if (!token || !memberId) return;
  try {
    const { getDeviceId } = await import('@/lib/chatCrypto');
    const deviceId = await getDeviceId();
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';

    // Look up this member's family_id — member_device_tokens.family_id is
    // required (RLS scoping, same pattern as device_keys).
    const { data: memberRow } = await supabase
      .from('members')
      .select('family_id')
      .eq('id', memberId)
      .single();
    const familyId = (memberRow as { family_id?: string } | null)?.family_id;

    if (familyId) {
      await supabase.from('member_device_tokens').upsert(
        {
          member_id: memberId,
          device_id: deviceId,
          family_id: familyId,
          expo_push_token: token,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'member_id,device_id' }
      );

      // Only one member can be "active" on this physical device at a time —
      // any OTHER member's row for this exact device_id is now stale and
      // would falsely claim the device still belongs to them.
      await supabase
        .from('member_device_tokens')
        .delete()
        .eq('device_id', deviceId)
        .neq('member_id', memberId);
    }

    // Keep the old column updated too — see comment above.
    await supabase.from('members').update({ expo_push_token: token }).eq('id', memberId);
  } catch (e) {
    console.warn('[notifications] saveTokenToMember failed:', e);
  }
}

// ── Clear token from member on profile switch / logout ────────────────────────

export async function clearTokenFromMember(memberId: string): Promise<void> {
  if (!memberId) return;
  try {
    await supabase.from('members').update({ expo_push_token: null }).eq('id', memberId);
  } catch (e) {
    console.warn('[notifications] clearTokenFromMember failed:', e);
  }
}

// ── Remove token on logout ────────────────────────────────────────────────────

export async function removePushToken(userId: string): Promise<void> {
  if (!Notifications || !Device?.isDevice) return;
  // Read existing token without requesting permission (user is logging out)
  const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
  const isValidUuid = projectId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
  if (!isValidUuid) return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;
    await supabase.from('push_tokens').delete().match({ user_id: userId, token });
  } catch (e) {
    console.warn('[removePushToken] failed:', e);
  }
}

// ── Schedule local reminder (for offline/fallback) ────────────────────────────

export async function scheduleLocalReminder({
  title,
  body,
  triggerDate,
  data,
  notifType,
}: {
  title: string;
  body: string;
  triggerDate: Date;
  data?: Record<string, unknown>;
  notifType?: string;
}): Promise<string | null> {
  if (!Notifications) return null;
  if (!canShowNotification(notifType)) return null;
  const id = await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { ...(data ?? {}), type: notifType }, sound: true },
    trigger: { date: triggerDate, channelId: 'reminders' },
  });
  return id;
}

// ── Fire an immediate local notification (result-ready alerts) ────────────────

export async function scheduleImmediateNotification({
  title,
  body,
  data,
  notifType,
}: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  notifType?: string;
}): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { ...(data ?? {}), type: notifType }, sound: true },
      trigger: null, // fires immediately
    });
  } catch (e) {
    console.warn('[scheduleImmediateNotification]', e);
  }
}

// ── Sync user location for SOS nearby detection ───────────────────────────────
// Call this whenever the app has a fresh location (home screen, SOS screen, social tab).
// Upserts into user_locations — service role not needed, user updates own row.

export async function syncUserLocation(
  userId: string,
  lat: number,
  lng: number,
  accuracyM?: number
): Promise<void> {
  try {
    await supabase.from('user_locations').upsert(
      { user_id: userId, lat, lng, accuracy_m: accuracyM ?? null, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  } catch (e) {
    // Non-critical — fail silently
  }
}

// ── Cancel all local reminders for a pet ─────────────────────────────────────

export async function cancelLocalReminders(petId: string): Promise<void> {
  if (!Notifications) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if ((n.content.data as any)?.pet_id === petId) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

// ── Listen for notifications received while app is in foreground ──────────────

export function addNotificationReceivedListener(handler: (notification: any) => void) {
  if (!Notifications) return { remove: () => {} };
  return Notifications.addNotificationReceivedListener(handler);
}

// ── Listen for notification taps (deep link) ──────────────────────────────────

export function addNotificationResponseListener(
  handler: (response: any) => void
) {
  if (!Notifications) {
    return { remove: () => {} };
  }
  return Notifications.addNotificationResponseReceivedListener(handler);
}

// ── Fetch unread notifications from DB (fallback system) ───────────────────

/**
 * Fetch unread notifications for the current user
 * Used as fallback when push notifications aren't available
 * Call this when app opens or when user navigates to notification screen
 */
export async function fetchUnreadNotifications(userId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('notification_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[notifications] ❌ Failed to fetch unread notifications:', error);
      return [];
    }

    console.log('[notifications] ✅ Fetched', data?.length ?? 0, 'unread notifications from DB');
    return data ?? [];
  } catch (err: any) {
    console.error('[notifications] 🔴 Error fetching notifications:', err);
    return [];
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  try {
    await supabase
      .from('notification_logs')
      .update({ read: true })
      .eq('id', notificationId);
  } catch (err: any) {
    console.error('[notifications] ⚠️  Failed to mark as read:', err);
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  try {
    await supabase
      .from('notification_logs')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
  } catch (err: any) {
    console.error('[notifications] ⚠️  Failed to mark all as read:', err);
  }
}
