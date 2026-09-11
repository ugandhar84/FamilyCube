/**
 * kioskNotificationRoute — translates a notification's phone route (from
 * routeForNotification, components/NotificationPanel.tsx) into a
 * KioskTabKey, so kiosk's own notification panel can navigate via
 * KioskScreen's internal tab-switch instead of expo-router.
 *
 * Deliberately a thin translation layer over routeForNotification, not a
 * second copy of its type/data switch — that function stays the single
 * source of truth for "which notification type means which conceptual
 * destination." This only answers "what does that destination look like
 * as a kiosk tab."
 */
import { routeForNotification } from '@/components/NotificationPanel';
import type { KioskTabKey } from './kioskTabs';

const ROUTE_TO_KIOSK_TAB: Record<string, KioskTabKey> = {
  '/(tabs)/tasks': 'tasks',
  '/(tabs)': 'overview',
  '/(tabs)/chat': 'chat',
  '/(tabs)/store': 'store',
  '/(tabs)/gps': 'findfam',
  '/(tabs)/profile': 'profile',
  // Kiosk merged grocery into the Meals tab — see kioskTabs.ts's own
  // header comment ("Meals & Timers -> meals ... meals+grocery is the
  // real content").
  '/(tabs)/grocery': 'meals',
  '/(tabs)/meals': 'meals',
  '/(tabs)/family-health': 'health',
  '/(tabs)/memories': 'memories',
};

export function kioskTabForNotification(type: string, data?: Record<string, any> | null): KioskTabKey {
  const route = routeForNotification(type, data);
  return ROUTE_TO_KIOSK_TAB[route ?? '/(tabs)'] ?? 'overview';
}
