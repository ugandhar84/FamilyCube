// Custom entry point (replaces the default "expo-router/entry" main) —
// registers Firebase Messaging's background handler BEFORE expo-router
// boots the app, since RNFirebase requires this to run at module-eval
// time, outside any React component lifecycle, to reliably fire while the
// app is backgrounded or killed. This is the Android half of the call-
// reminder wake path (iOS wakes via PushKit natively in AppDelegate.swift
// instead — no JS involved there).
import { Platform } from 'react-native';

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
        const uuid = `${Date.now()}`;
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
