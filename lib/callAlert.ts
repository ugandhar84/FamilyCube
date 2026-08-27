// Call-style reminder alerts — CallKeep (CallKit/ConnectionService) wiring.
// The ring itself is entirely native (AppDelegate.swift's PushKit delegate on
// iOS reports the incoming call before JS even loads, and CallKit/
// ConnectionService owns ring → answer → speak(TTS) → hang up end to end).
// There is deliberately no in-app screen or JS-side answer/end handling —
// the native call UI is the whole experience. This module only handles:
//  - JS-side CallKeep setup (required on Android; iOS setup already runs
//    natively in AppDelegate.swift, this is a required no-op re-call there)
//  - VoIP/FCM token registration → voip_push_tokens table
import { Platform, NativeModules, DeviceEventEmitter } from 'react-native';
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
  if (!token || !memberId) {
    console.log('[callAlert] saveVoipTokenToMember: skipped, missing', { hasToken: !!token, memberId });
    return;
  }
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  try {
    const { error } = await supabase.from('voip_push_tokens').upsert(
      { member_id: memberId, family_id: familyId, token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
    if (error) {
      console.warn('[callAlert] saveVoipTokenToMember: upsert error', error.message);
    } else {
      console.log('[callAlert] saveVoipTokenToMember: registered', { memberId, tokenPrefix: token.slice(0, 8) });
    }
  } catch (e) {
    console.warn('[callAlert] saveVoipTokenToMember failed:', e);
  }
}

// Bridges AppDelegate.swift's NotificationCenter post (native, iOS-only) to
// a JS callback — call once at app startup with the active member's id.
//
// PushKit typically hands the token back to AppDelegate almost immediately
// on launch, well before this listener has a chance to attach (JS/React
// takes longer to boot) — so the live NotificationCenter post alone misses
// it most of the time. FCVoipToken.getCachedToken() reads back whatever
// AppDelegate.swift already cached to UserDefaults, covering that race;
// the live listener still matters for token refreshes that happen later
// while the app is running.
export function listenForVoipToken(onToken: (token: string) => void): () => void {
  if (Platform.OS !== 'ios' || !NativeModules.RNCallKeep) {
    console.log('[callAlert] listenForVoipToken: skipped', { platform: Platform.OS, hasCallKeep: !!NativeModules.RNCallKeep });
    return () => {};
  }
  try {
    if (NativeModules.FCVoipToken?.getCachedToken) {
      NativeModules.FCVoipToken.getCachedToken((token: string) => {
        console.log('[callAlert] getCachedToken resolved', { hasToken: !!token, tokenPrefix: token?.slice(0, 8) });
        if (token) onToken(token);
      });
    } else {
      console.log('[callAlert] listenForVoipToken: FCVoipToken native module not present');
    }
    // Plain NSNotificationCenter posts (not tied to a specific native
    // module's own event emitter) — DeviceEventEmitter is the correct API
    // for these; `new NativeEventEmitter()` with no module argument throws
    // an Invariant Violation on newer React Native versions.
    const sub = DeviceEventEmitter.addListener('VoipTokenUpdated', (e: { token: string }) => {
      console.log('[callAlert] VoipTokenUpdated event received', { hasToken: !!e?.token });
      if (e?.token) onToken(e.token);
    });
    return () => sub.remove();
  } catch (e) {
    console.warn('[callAlert] listenForVoipToken threw', e);
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
