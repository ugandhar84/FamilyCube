/**
 * Answers another member's "locate now" silent push while this app is in the
 * background or killed. app/_layout.tsx's listener only runs in the foreground, so a
 * backgrounded phone never replied. Imported once at the top of app/_layout.tsx so the
 * task is defined at launch (iOS can wake JS for a push before any screen mounts).
 */
import { requireOptionalNativeModule } from 'expo-modules-core';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TASK_NAME = 'FAMILYCUBE_LOCATION_REQUEST_PUSH';

function payloadOf(raw: any): Record<string, any> {
  const d = raw?.notification?.data ?? raw?.data ?? raw ?? {};
  if (typeof d === 'string') { try { return JSON.parse(d); } catch { return {}; } }
  if (typeof d?.dataString === 'string') { try { return JSON.parse(d.dataString); } catch { /* fall through */ } }
  if (typeof d?.body === 'string') { try { return JSON.parse(d.body); } catch { /* fall through */ } }
  return d;
}

try {
  if (requireOptionalNativeModule('ExpoTaskManager')) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    if (!TaskManager.isTaskDefined(TASK_NAME)) {
      TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
        if (error) return;
        try {
          if (payloadOf(data).type !== 'location_request') return;
          const [memberId, familyId] = await Promise.all([
            AsyncStorage.getItem('familycube_bg_location_member_id'),
            AsyncStorage.getItem('familycube_bg_location_family_id'),
          ]);
          if (!memberId || !familyId) return;
          const { reportLiveLocationNow } = await import('./locationTracking');
          await reportLiveLocationNow(memberId, familyId);
        } catch (e) {
          console.warn('[locationPushTask] failed:', (e as Error)?.message ?? e);
        }
      });
    }
    Notifications.registerTaskAsync(TASK_NAME).catch(() => {});
  }
} catch { /* native module missing: foreground listener still works */ }
