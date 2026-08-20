// Call-style reminder alerts — CallKeep (CallKit/ConnectionService) wiring.
// The ring itself is native (AppDelegate.swift's PushKit delegate on iOS
// reports the incoming call before JS even loads); this module handles:
//  - JS-side CallKeep setup (required on Android; iOS setup already runs
//    natively in AppDelegate.swift, this is a required no-op re-call there)
//  - VoIP token registration → voip_push_tokens table
//  - Answer/decline event listeners → navigate to the post-answer screen
import { Platform, NativeEventEmitter, NativeModules } from 'react-native';
import { supabase } from '@/lib/supabase';

let RNCallKeep: typeof import('react-native-callkeep').default | null = null;
try {
  RNCallKeep = require('react-native-callkeep').default;
} catch {
  // Native module not present in this build (e.g. Expo Go) — every export
  // below degrades to a no-op rather than crashing the app on import.
}

// @react-native-firebase/messaging v22+ modular API (getMessaging/getToken/
// onMessage as standalone functions), not the older messaging()-callable
// default export the library's own docs still show in most examples.
let fbMessaging: typeof import('@react-native-firebase/messaging') | null = null;
try {
  fbMessaging = require('@react-native-firebase/messaging');
} catch {
  // Same degrade-in-Expo-Go pattern as CallKeep above.
}

const CALLKEEP_OPTIONS = {
  ios: {
    appName: 'Family Cube',
    supportsVideo: false,
    maximumCallGroups: '1',
    maximumCallsPerCallGroup: '1',
  },
  android: {
    alertTitle: 'Call permission required',
    alertDescription: 'Family Cube needs call permission to ring you for chore/event reminders.',
    cancelButton: 'Cancel',
    okButton: 'OK',
    additionalPermissions: [],
    selfManaged: true,
    foregroundService: {
      channelId: 'family_cube_call_reminders',
      channelName: 'Call Reminders',
      notificationTitle: 'Family Cube is ringing you',
    },
  },
};

let didSetup = false;

export async function setupCallAlerts(): Promise<void> {
  if (!RNCallKeep || didSetup) return;
  try {
    await RNCallKeep.setup(CALLKEEP_OPTIONS);
    didSetup = true;
  } catch (e) {
    console.warn('[callAlert] CallKeep setup failed:', e);
  }
}

// ── VoIP token registration (iOS) ──────────────────────────────────────────
// The token itself is produced natively by PKPushRegistry in AppDelegate.swift,
// which posts it via NSNotificationCenter (see VoipTokenUpdated) since no JS
// context is guaranteed to exist yet when PushKit first hands it over.

export async function saveVoipTokenToMember(memberId: string, familyId: string, token: string): Promise<void> {
  if (!token || !memberId) return;
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  try {
    await supabase.from('voip_push_tokens').upsert(
      { member_id: memberId, family_id: familyId, token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
  } catch (e) {
    console.warn('[callAlert] saveVoipTokenToMember failed:', e);
  }
}

// Bridges AppDelegate.swift's NotificationCenter post (native, iOS-only) to
// a JS callback — call once at app startup with the active member's id.
export function listenForVoipToken(onToken: (token: string) => void): () => void {
  if (Platform.OS !== 'ios' || !NativeModules.RNCallKeep) return () => {};
  try {
    const emitter = new NativeEventEmitter();
    const sub = emitter.addListener('VoipTokenUpdated', (e: { token: string }) => {
      if (e?.token) onToken(e.token);
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

// ── FCM token + foreground ring (Android) ──────────────────────────────────
// Background/killed-app delivery is handled by index.js's
// setBackgroundMessageHandler (must run at module-eval time, outside React);
// this covers the foreground case, where RNFirebase delivers via onMessage
// instead and the background handler never fires.

export async function registerAndroidVoipToken(memberId: string, familyId: string): Promise<void> {
  if (Platform.OS !== 'android' || !fbMessaging) return;
  try {
    const app = fbMessaging.getMessaging();
    const token = await fbMessaging.getToken(app);
    if (token) await saveVoipTokenToMember(memberId, familyId, token);
  } catch (e) {
    console.warn('[callAlert] registerAndroidVoipToken failed:', e);
  }
}

export function listenForForegroundCallReminder(): () => void {
  if (Platform.OS !== 'android' || !fbMessaging || !RNCallKeep) return () => {};
  try {
    const app = fbMessaging.getMessaging();
    return fbMessaging.onMessage(app, async (remoteMessage) => {
      const data = remoteMessage?.data as Record<string, string> | undefined;
      if (data?.type !== 'call_reminder') return;
      const uuid = `${Date.now()}`;
      const name = data.callerName ?? 'Family Cube Reminder';
      RNCallKeep!.displayIncomingCall(uuid, name, name, 'generic', false, {
        itemType: data.itemType, itemId: data.itemId, dueAtIso: data.dueAtIso, callUUID: uuid,
      });
    });
  } catch {
    return () => {};
  }
}

// ── Answer/decline handling ────────────────────────────────────────────────
// Fired by the native ring UI regardless of whether the app was foreground,
// backgrounded, or killed — this is the single place that routes into the
// post-answer screen (TTS readout + snooze), matching how a real phone
// call hands off from the system ringer to the app once picked up.
//
// `answerCall` only carries callUUID, not the reminder payload — the
// itemType/itemId/dueAtIso attached at reportNewIncomingCall time comes
// back separately via `didDisplayIncomingCall` (foreground/backgrounded
// case, fires immediately) or `didLoadWithEvents` (killed-app cold start,
// replays events queued before JS was ready). This map bridges the two so
// answerCall handlers can resolve the payload by callUUID.

export interface CallAlertPayload {
  itemType: 'chore' | 'event';
  itemId: string;
  dueAtIso: string;
  callUUID: string;
}

const pendingPayloads = new Map<string, CallAlertPayload>();

function extractPayload(callUUID: string, raw: any): CallAlertPayload {
  return {
    callUUID,
    itemType: (raw?.itemType as 'chore' | 'event') ?? 'chore',
    itemId: raw?.itemId ?? '',
    dueAtIso: raw?.dueAtIso ?? '',
  };
}

// Call once at app startup — populates pendingPayloads from both the
// live event and the cold-start replay queue.
export function trackIncomingCallPayloads(): () => void {
  if (!RNCallKeep) return () => {};
  const live = RNCallKeep.addEventListener('didDisplayIncomingCall', ({ callUUID, payload }) => {
    pendingPayloads.set(callUUID, extractPayload(callUUID, payload));
  });
  RNCallKeep.getInitialEvents().then(events => {
    for (const evt of events ?? []) {
      if (evt.name === 'RNCallKeepDidLoadWithEvents') continue;
      const data = (evt as any).data;
      if (data?.callUUID) pendingPayloads.set(data.callUUID, extractPayload(data.callUUID, data.payload ?? data));
    }
  }).catch(() => {});
  return () => live.remove();
}

export function onCallAnswered(handler: (payload: CallAlertPayload) => void): () => void {
  if (!RNCallKeep) return () => {};
  const listener = RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
    const payload = pendingPayloads.get(callUUID) ?? extractPayload(callUUID, {});
    pendingPayloads.delete(callUUID);
    handler(payload);
  });
  return () => listener.remove();
}

export function onCallEnded(handler: (callUUID: string) => void): () => void {
  if (!RNCallKeep) return () => {};
  const listener = RNCallKeep.addEventListener('endCall', ({ callUUID }) => handler(callUUID));
  return () => listener.remove();
}

export async function endCallAlert(callUUID: string): Promise<void> {
  if (!RNCallKeep) return;
  RNCallKeep.endCall(callUUID);
}
