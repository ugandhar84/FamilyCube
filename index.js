// Custom entry point (replaces the default "expo-router/entry" main) —
// registers Firebase Messaging's background handler BEFORE expo-router
// boots the app, since RNFirebase requires this to run at module-eval
// time, outside any React component lifecycle, to reliably fire while the
// app is backgrounded or killed. This is the Android half of the call-
// reminder wake path (iOS wakes via PushKit natively in AppDelegate.swift
// instead — no JS involved there).
import { Platform } from 'react-native';

// Hermes has no built-in WebCrypto (no global `crypto` object at all) —
// lib/chatCrypto.ts's crypto.subtle / crypto.getRandomValues / crypto.
// randomUUID calls throw "crypto doesn't exist" without this. Must run
// before any other module (including expo-router's own tree) evaluates,
// since several stores/screens read chatCrypto functions at import time.
import { install } from 'react-native-quick-crypto';
install();

if (Platform.OS === 'android') {
  try {
    // v22+ modular API — getMessaging()/setBackgroundMessageHandler() as
    // standalone functions, not the older messaging()-callable default.
    const { getMessaging, setBackgroundMessageHandler } = require('@react-native-firebase/messaging');
    const app = getMessaging();
    setBackgroundMessageHandler(app, async (remoteMessage) => {
      const data = remoteMessage?.data;
      if (data?.type !== 'call_reminder') return;
      try {
        const RNCallKeep = require('react-native-callkeep').default;
        // Use the server's own callUUID (apns.ts's sendFcmDataMessage) so
        // the killed-app path's cached fields land under the same key the
        // live listenForForegroundCallReminder/answer listener in
        // lib/callAlert.ts would use, keeping both paths consistent.
        const uuid = data.callUUID ?? `${Date.now()}`;
        // Persisted to AsyncStorage, not lib/callAlert.ts's in-memory Map —
        // this handler runs before any JS/React module (including that
        // Map) is guaranteed to exist, and the app may still be fully
        // killed when the call is later answered. listenForAndroidCallReminderAnswered
        // reads this back once JS does mount.
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.setItem(
          `call_reminder_pending:${uuid}`,
          JSON.stringify({ itemType: data.itemType, itemId: data.itemId, dueAtIso: data.dueAtIso }),
        );
        await RNCallKeep.displayIncomingCall(
          uuid,
          data.callerName ?? 'Family Cube Reminder',
          data.callerName ?? 'Family Cube Reminder',
          'generic',
          false,
          { itemType: data.itemType, itemId: data.itemId, dueAtIso: data.dueAtIso, callUUID: uuid },
        );
      } catch (e) {
        console.warn('[index.js] background call_reminder display failed:', e);
      }
    });
  } catch (e) {
    // @react-native-firebase native module not present (e.g. Expo Go) —
    // degrade silently, same as lib/callAlert.ts's CallKeep require guard.
  }
}

require('expo-router/entry');
