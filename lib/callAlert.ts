// Call-style reminder alerts — CallKeep (CallKit/ConnectionService) wiring.
// The ring itself is native (AppDelegate.swift's PushKit delegate on iOS
// reports the incoming call before JS even loads); this module handles:
//  - JS-side CallKeep setup (required on Android; iOS setup already runs
//    natively in AppDelegate.swift, this is a required no-op re-call there)
//  - VoIP token registration → voip_push_tokens table
//  - Answer/decline event listeners → navigate to the post-answer screen
import { Platform, NativeEventEmitter, NativeModules, DeviceEventEmitter } from 'react-native';
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
//
// PushKit typically hands the token back to AppDelegate almost immediately
// on launch, well before this listener has a chance to attach (JS/React
// takes longer to boot) — so the live NotificationCenter post alone misses
// it most of the time. FCVoipToken.getCachedToken() reads back whatever
// AppDelegate.swift already cached to UserDefaults, covering that race;
// the live listener still matters for token refreshes that happen later
// while the app is running.
export function listenForVoipToken(onToken: (token: string) => void): () => void {
  if (Platform.OS !== 'ios' || !NativeModules.RNCallKeep) return () => {};
  try {
    if (NativeModules.FCVoipToken?.getCachedToken) {
      NativeModules.FCVoipToken.getCachedToken((token: string) => {
        if (token) onToken(token);
      });
    }
    // Plain NSNotificationCenter posts (not tied to a specific native
    // module's own event emitter) — DeviceEventEmitter is the correct API
    // for these; `new NativeEventEmitter()` with no module argument throws
    // an Invariant Violation on newer React Native versions.
    const sub = DeviceEventEmitter.addListener('VoipTokenUpdated', (e: { token: string }) => {
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

// react-native-callkeep is inconsistent about callUUID casing between
// events — reportNewIncomingCall's uuid passes through as-given (our own
// UUID().uuidString on iOS is uppercase) for didDisplayIncomingCall, but
// RNCallKeep.m explicitly lowercases it for the answerCall/endCall actions
// ([action.callUUID.UUIDString lowercaseString]). pendingPayloads is keyed
// by this string, so a payload stored under the uppercase form was
// silently missed on lookup by the lowercase form the answer event
// actually carries — the payload resolved to empty every time despite
// didDisplayIncomingCall firing correctly moments earlier. Normalize to
// lowercase everywhere this map is touched.
const normalizeUUID = (uuid: string) => uuid.toLowerCase();

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
//
// Cold-start bug this fixes: when the app is killed and the user answers
// the call directly from the lock screen, iOS launches the app AFTER the
// answer action already happened. RNCallKeep queues every native event that
// fired before any JS listener existed (see _delayedEvents/startObserving
// in RNCallKeep.m) and replays the whole batch via getInitialEvents() once
// the first addEventListener call is made — that batch can include
// RNCallKeepPerformAnswerCallAction itself, not just
// RNCallKeepDidDisplayIncomingCall. Previously only the payload (title/
// itemId) was extracted from the replay queue; the answer action itself
// was silently dropped, so a cold-start answer never navigated to
// /call-alert and the reminder never spoke — the app would launch to
// whatever screen it normally opens to, with no sign anything was wrong.
let onAnsweredHandler: ((payload: CallAlertPayload) => void) | null = null;

export function trackIncomingCallPayloads(): () => void {
  console.log('[callAlert] trackIncomingCallPayloads called, RNCallKeep present=', !!RNCallKeep);
  if (!RNCallKeep) return () => {};
  const live = RNCallKeep.addEventListener('didDisplayIncomingCall', ({ callUUID, payload }) => {
    console.log('[callAlert] live didDisplayIncomingCall', callUUID, payload);
    pendingPayloads.set(normalizeUUID(callUUID), extractPayload(callUUID, payload));
  });
  RNCallKeep.getInitialEvents().then(events => {
    console.log('[callAlert] getInitialEvents resolved, count=', events?.length ?? 0, JSON.stringify(events));
    const answeredCallUUIDs: string[] = [];
    for (const evt of events ?? []) {
      if (evt.name === 'RNCallKeepDidLoadWithEvents') continue;
      const data = (evt as any).data;
      if (!data?.callUUID) continue;
      if (evt.name === 'RNCallKeepPerformAnswerCallAction') {
        answeredCallUUIDs.push(data.callUUID);
        continue;
      }
      pendingPayloads.set(normalizeUUID(data.callUUID), extractPayload(data.callUUID, data.payload ?? data));
    }
    console.log('[callAlert] replay processed — answeredCallUUIDs=', answeredCallUUIDs, 'onAnsweredHandler set=', !!onAnsweredHandler);
    // Process answers after the loop so a payload arriving later in the
    // same batch (order isn't guaranteed) is still available by the time
    // we resolve it.
    for (const callUUID of answeredCallUUIDs) {
      const key = normalizeUUID(callUUID);
      const payload = pendingPayloads.get(key) ?? extractPayload(callUUID, {});
      pendingPayloads.delete(key);
      console.log('[callAlert] firing onAnsweredHandler for replayed answer, payload=', payload);
      onAnsweredHandler?.(payload);
    }
  }).catch((e) => console.warn('[callAlert] getInitialEvents error', e));
  return () => live.remove();
}

export function onCallAnswered(handler: (payload: CallAlertPayload) => void): () => void {
  console.log('[callAlert] onCallAnswered registering, RNCallKeep present=', !!RNCallKeep);
  onAnsweredHandler = handler;
  if (!RNCallKeep) return () => { onAnsweredHandler = null; };
  const listener = RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
    console.log('[callAlert] LIVE answerCall event fired', callUUID);
    const key = normalizeUUID(callUUID);
    const payload = pendingPayloads.get(key) ?? extractPayload(callUUID, {});
    pendingPayloads.delete(key);
    handler(payload);
  });
  return () => { listener.remove(); onAnsweredHandler = null; };
}

// Covers the case react-native-callkeep's own event-replay queue cannot:
// the app was fully killed, PushKit displayed the call in one process, the
// user answered, and iOS relaunched a DIFFERENT process for this JS to boot
// in — the library's in-memory _delayedEvents array dies with the old
// process. AppDelegate.swift's CXCallObserverDelegate asks iOS's own
// CallKit call registry directly (independent of which process is running)
// and caches the answered call to UserDefaults, which does survive the
// process boundary. Call once at app startup, after onCallAnswered has
// registered its handler (matching the ordering already required for
// trackIncomingCallPayloads).
export function checkNativeAnsweredCall(): void {
  const mod = (NativeModules as any).FCVoipToken;
  if (Platform.OS !== 'ios' || !mod?.getLastAnsweredCall) return;
  mod.getLastAnsweredCall((result: { callUUID: string; itemType: string; itemId: string } | null) => {
    console.log('[callAlert] checkNativeAnsweredCall result=', result, 'onAnsweredHandler set=', !!onAnsweredHandler);
    if (!result) return;
    onAnsweredHandler?.({
      callUUID: result.callUUID,
      itemType: (result.itemType as 'chore' | 'event') || 'chore',
      itemId: result.itemId,
      dueAtIso: '',
    });
  });
}

// Live counterpart to checkNativeAnsweredCall — fires if the app was still
// running (foreground/background, not killed) when CXCallObserver detected
// the connected call, so the answer routes immediately instead of waiting
// for the next cold boot to read it back from UserDefaults.
export function listenForNativeCallAnswered(): () => void {
  if (Platform.OS !== 'ios') return () => {};
  const sub = DeviceEventEmitter.addListener('FCCallAnswered', (e: { callUUID: string; itemType: string; itemId: string }) => {
    console.log('[callAlert] live FCCallAnswered event', e);
    onAnsweredHandler?.({
      callUUID: e.callUUID,
      itemType: (e.itemType as 'chore' | 'event') || 'chore',
      itemId: e.itemId,
      dueAtIso: '',
    });
  });
  return () => sub.remove();
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

// iOS hands audio control to the app asynchronously after Answer — CallKit
// owns the AVAudioSession until its didActivateAudioSession delegate method
// fires (see RNCallKeep.m), and any expo-speech call made before that point
// is silently dropped: no error, just no sound, because the app's audio
// session isn't actually active yet. Speaking immediately on navigation to
// the post-answer screen hit this race every time. Android has no such
// handoff (no CallKit), so this resolves immediately there; iOS also gets a
// short timeout fallback in case the event is ever missed, so the reminder
// still speaks (just possibly silently) rather than hanging forever.
export function waitForAudioSession(timeoutMs = 1500): Promise<void> {
  if (!RNCallKeep || Platform.OS !== 'ios') {
    console.log('[callAlert] waitForAudioSession — skipped (no RNCallKeep or not iOS)');
    return Promise.resolve();
  }
  return new Promise(resolve => {
    let done = false;
    const finish = (viaEvent: boolean) => {
      if (done) return;
      done = true;
      console.log('[callAlert] waitForAudioSession resolved — viaEvent=', viaEvent);
      listener.remove();
      resolve();
    };
    const listener = RNCallKeep!.addEventListener('didActivateAudioSession', () => finish(true));
    setTimeout(() => finish(false), timeoutMs);
  });
}

// CallKit's audio session (AVAudioSessionCategoryPlayAndRecord, set in
// RNCallKeep.m's configureAudioSession) is oriented around a real phone
// call's routing — by default that can mean the earpiece or a connected
// Bluetooth/car audio route rather than the loud speaker, so
// AVSpeechSynthesizer's audio can be technically "playing" (onStart fires,
// no error) while genuinely inaudible to someone holding the phone normally.
// Forces the route to the speaker, same call react-native-callkeep's own
// in-call "speaker" toggle button would make.
export async function routeAudioToSpeaker(callUUID: string): Promise<void> {
  if (!RNCallKeep || Platform.OS !== 'ios' || !callUUID) return;
  try {
    await RNCallKeep.setAudioRoute(callUUID, 'Speaker');
    console.log('[callAlert] routeAudioToSpeaker succeeded for', callUUID);
  } catch (e) {
    console.warn('[callAlert] routeAudioToSpeaker failed', e);
  }
}
