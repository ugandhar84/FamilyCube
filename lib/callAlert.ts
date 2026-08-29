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

// Bridges AppDelegate.swift's "CallReminderAnswered" NotificationCenter post
// (fired the moment CXCallObserver sees a reminder call actually connect) to
// the mark-call-reminder-answered edge function. The native side makes no
// network calls of its own (same reasoning as the VoIP token bridge above —
// only JS holds the real Supabase session), so this is what actually tells
// the backend "this one was picked up" — without it, call-reminder-sweeper's
// missed-call follow-up (one retry call + one push, ~3 min later) would fire
// for every reminder, answered or not, turning a quiet safety net into a
// redundant nag on top of a call the person already took.
// Timestamp of the most recent reminder-call answer — set the instant the
// native side reports one, read by app/_layout.tsx's foreground/AppState
// handler to skip the biometric re-lock check for that resume. Live-
// reported: answering a call reminder after 5+ min backgrounded (the
// existing re-lock threshold) foregrounded the app straight into
// LockScreen's auto-triggered Face ID prompt — but iOS won't reliably run
// Face ID while a CallKit call is still active/dismissing, so the prompt
// silently hung forever with no way to retry or cancel (busy stuck true,
// both buttons dead). Skipping the lock check entirely for a few seconds
// after a reminder-call answer avoids ever firing Face ID into that dead
// window; the app then unlocks normally like any other quick app-switcher
// bounce under LOCK_AFTER_MS, and re-locks again on the NEXT genuine
// backgrounding as usual.
let lastReminderCallAnsweredAt = 0;
const RECENT_ANSWER_WINDOW_MS = 60_000;

export function wasReminderCallJustAnswered(): boolean {
  return Date.now() - lastReminderCallAnsweredAt < RECENT_ANSWER_WINDOW_MS;
}

export function listenForCallReminderAnswered(): () => void {
  if (Platform.OS !== 'ios') return () => {};
  try {
    const sub = DeviceEventEmitter.addListener(
      'CallReminderAnswered',
      async (e: { itemType?: string; itemId?: string; dueAtIso?: string }) => {
        if (!e?.itemType || !e?.itemId || !e?.dueAtIso) return;
        lastReminderCallAnsweredAt = Date.now();
        try {
          await supabase.functions.invoke('mark-call-reminder-answered', {
            body: { itemType: e.itemType, itemId: e.itemId, dueAtIso: e.dueAtIso },
          });
        } catch (err) {
          console.warn('[callAlert] mark-call-reminder-answered failed', err);
        }
      }
    );
    return () => sub.remove();
  } catch (e) {
    console.warn('[callAlert] listenForCallReminderAnswered threw', e);
    return () => {};
  }
}

// Covers the killed-app-then-answered case listenForCallReminderAnswered's
// live NotificationCenter listener structurally cannot: that listener only
// receives the "CallReminderAnswered" post if JS is already running and this
// listener already attached at the exact moment CXCallObserver sees the call
// connect. A reminder call typically rings while the phone is locked/idle —
// the common case is the app is backgrounded or fully killed, so JS boots
// AFTER AppDelegate.swift's callObserver has already posted (and lost) that
// notification. Confirmed live via a direct call_reminder_log query: EVERY
// row ever written has answered=false, retry_count=0 — including calls the
// user personally answered — meaning the live listener has never once
// actually fired end-to-end in real usage.
//
// FCVoipToken.getLastAnsweredCall (native, see plugins/withCallKeep.js) reads
// back the same answer event from UserDefaults, written by the same
// callObserver, but cached under keys that survive both app-kill and the
// call's own hasEnded cleanup — see that method's comments for why dueAtIso
// specifically needed its own stable cache key. Call this once on app
// mount/boot (see app/_layout.tsx) alongside listenForCallReminderAnswered().
// Order relative to boot routing doesn't matter — this only ever affects (a)
// the server-side answered flag, checked by a cron sweep running minutes
// later, and (b) wasReminderCallJustAnswered()'s recency flag, only consulted
// by the AppState background→active handler, which can't fire before this
// function (called synchronously on mount, same tick as the app resuming
// from the answered call) has had a chance to run.
export async function checkLastAnsweredCallOnColdStart(): Promise<void> {
  if (Platform.OS !== 'ios' || !NativeModules.FCVoipToken?.getLastAnsweredCall) return;
  try {
    const result = await new Promise<{ callUUID: string; itemType: string; itemId: string; dueAtIso: string } | null>(
      (resolve) => NativeModules.FCVoipToken.getLastAnsweredCall((r: any) => resolve(r ?? null))
    );
    if (!result?.itemType || !result?.itemId || !result?.dueAtIso) return;
    console.log('[callAlert] checkLastAnsweredCallOnColdStart: found answered call', {
      itemType: result.itemType, itemId: result.itemId,
    });
    // Mirrors listenForCallReminderAnswered's live-listener behavior exactly —
    // this recency flag is what lets app/_layout.tsx's and
    // AppPinLockOverlay.tsx's background→active re-lock handlers skip the
    // Face ID prompt that otherwise hangs while a CallKit call is still
    // active/dismissing. Setting it here (not just calling
    // mark-call-reminder-answered below) is required — without it, this cold-
    // start path fixes the DB-side "answered" tracking but Bug 3's freeze
    // keeps happening exactly as before, since wasReminderCallJustAnswered()
    // would never have been set true by this path.
    lastReminderCallAnsweredAt = Date.now();
    try {
      await supabase.functions.invoke('mark-call-reminder-answered', {
        body: { itemType: result.itemType, itemId: result.itemId, dueAtIso: result.dueAtIso },
      });
    } catch (err) {
      console.warn('[callAlert] mark-call-reminder-answered failed (cold start)', err);
    }
  } catch (e) {
    console.warn('[callAlert] checkLastAnsweredCallOnColdStart threw', e);
  }
}

// TEMP diagnostic instrumentation — see AppDelegate.canonical.swift's
// callDebugTrace/trace(_:) comments for the full story. Two previous fix
// attempts for "call-reminder TTS speaks once then goes silent forever"
// were both confirmed live to NOT resolve it. Rather than ship a third
// blind guess as "the fix," the native repeat loop now appends a
// timestamped breadcrumb at every meaningful lifecycle point and persists
// it to UserDefaults; this function pulls that trace back out (via
// FCVoipToken.getLastCallDebugTrace, see plugins/withCallKeep.js) and ships
// it to the call_reminder_debug_trace table (see the matching migration)
// so it's readable after the fact — the user cannot connect this device to
// Xcode/Console.app or generate/share device logs, so this is the only way
// to get real evidence off of a live test call.
//
// Timing: the trace is only complete once call.hasEnded fires natively
// (the repeat loop could still be mid-pass before then), so this must be
// called AFTER the call has ended, not at answer time. For the common case
// (answering a reminder call backgrounds/foregrounds the app around the
// call's lifetime), the app's next 'active' AppState transition happens
// once the user hangs up and CallKit's UI dismisses — by which point
// call.hasEnded has already fired natively and flushed the final trace
// entry. That means EVERY foreground check (not just cold start) needs to
// try this, since most reminder calls are answered while the app is merely
// backgrounded (not killed) — see app/_layout.tsx's AppState 'active'
// handler, where this is called unconditionally alongside the existing
// foreground refresh work. It's cheap to call with nothing to report:
// getLastCallDebugTrace resolves null immediately if no trace is pending.
export async function shipPendingCallDebugTraceIfAny(): Promise<void> {
  if (Platform.OS !== 'ios' || !NativeModules.FCVoipToken?.getLastCallDebugTrace) return;
  try {
    const result = await new Promise<{ trace: string[]; itemId: string | null; dueAtIso: string | null; itemType: string | null } | null>(
      (resolve) => NativeModules.FCVoipToken.getLastCallDebugTrace((r: any) => resolve(r ?? null))
    );
    if (!result?.trace?.length) return;
    console.log('[callAlert] shipPendingCallDebugTraceIfAny: found a trace with', result.trace.length, 'entries');
    const { error } = await supabase.from('call_reminder_debug_trace').insert({
      item_id: result.itemId ?? null,
      due_at_iso: result.dueAtIso ?? null,
      item_type: result.itemType ?? null,
      trace: result.trace,
    });
    if (error) console.warn('[callAlert] shipPendingCallDebugTraceIfAny: insert failed', error.message);
  } catch (e) {
    console.warn('[callAlert] shipPendingCallDebugTraceIfAny threw', e);
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
