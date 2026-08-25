/**
 * storeGeofencing — store_proximity_reminders feature.
 *
 * Once a family pins a lat/lng for a store (PinStoreLocationSheet), this
 * registers an expo-location geofence there. On entering the region, fires
 * a local notification listing what's still pending on that store's list —
 * "you're near Walmart, 3 items on your list."
 *
 * Separate from lib/locationTracking.ts's continuous-tracking task — these
 * are independent expo-location subsystems (startGeofencingAsync vs.
 * startLocationUpdatesAsync) and neither depends on the other being active.
 * Same lazy-native-module story as locationTracking.ts: expo-task-manager
 * isn't present until a full rebuild, so everything here degrades to a
 * silent no-op rather than crashing the import chain on a stale JS reload.
 */
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as Location from 'expo-location';
import { supabase } from './supabase';
import { isFeatureEnabled } from './featureFlags';

export const STORE_GEOFENCE_TASK_NAME = 'family-cube-store-geofence';

// 1 mile — matches the "passing by, about a mile out" framing from the
// feature request; wide enough to catch someone driving past without
// needing to be right at the storefront.
const GEOFENCE_RADIUS_METERS = 1609;

type TaskManagerAPI = typeof import('expo-task-manager');
let _tm: TaskManagerAPI | null | undefined = undefined;

function getTaskManager(): TaskManagerAPI | null {
  if (_tm !== undefined) return _tm;
  const native = requireOptionalNativeModule('ExpoTaskManager');
  if (!native) { _tm = null; return null; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _tm = require('expo-task-manager') as TaskManagerAPI;
  } catch {
    _tm = null;
  }
  return _tm;
}

type NotificationsAPI = typeof import('expo-notifications');
let _notifs: NotificationsAPI | null | undefined = undefined;

function getNotifications(): NotificationsAPI | null {
  if (_notifs !== undefined) return _notifs;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _notifs = require('expo-notifications') as NotificationsAPI;
  } catch {
    _notifs = null;
  }
  return _notifs;
}

// Region -> store name, so the task callback (which only gets identifier +
// coords, not app context) knows which store's pending items to look up.
// Rebuilt every time registerStoreGeofences runs; TaskManager callbacks
// can't close over component/store state, same constraint documented in
// locationTracking.ts.
let regionStoreMap: Record<string, { store: string; familyId: string }> = {};
let activeMemberIdRef: string | null = null;

// Once per region per "episode" (until the device leaves and re-enters) —
// otherwise lingering just inside the radius could re-fire repeatedly as
// the OS re-evaluates the region.
const alreadyNotified = new Set<string>();

let taskDefined = false;
function ensureTaskDefined(tm: TaskManagerAPI) {
  if (taskDefined || tm.isTaskDefined(STORE_GEOFENCE_TASK_NAME)) { taskDefined = true; return; }
  tm.defineTask(STORE_GEOFENCE_TASK_NAME, async ({ data, error }) => {
    if (error) { console.error('[storeGeofencing] task error:', error.message); return; }
    const { eventType, region } = (data as { eventType: number; region: Location.LocationRegion }) ?? {};
    if (eventType !== Location.GeofencingEventType.Enter) return;
    if (!region?.identifier) return;

    const meta = regionStoreMap[region.identifier];
    if (!meta) return;
    if (alreadyNotified.has(region.identifier)) return;

    try {
      const { data: pending } = await supabase
        .from('grocery_items')
        .select('name')
        .eq('family_id', meta.familyId)
        .eq('is_bought', false)
        .eq('store_preference', meta.store)
        .limit(5);

      if (!pending || pending.length === 0) return;

      alreadyNotified.add(region.identifier);

      const notifs = getNotifications();
      if (!notifs) return;

      const names = pending.map((p: any) => p.name).join(', ');
      await notifs.scheduleNotificationAsync({
        content: {
          title: `🛒 You're near ${meta.store}`,
          body: pending.length > 3
            ? `${pending.length} items on your list: ${names}…`
            : `On your list: ${names}`,
          data: { type: 'store_proximity', store: meta.store },
          sound: true,
        },
        trigger: null,
      });
    } catch (e) {
      console.warn('[storeGeofencing] enter-handler failed', e);
    }
  });
  taskDefined = true;
}

/** True once expo-task-manager's native module is actually available (post-rebuild). */
export function isStoreGeofencingSupported(): boolean {
  return getTaskManager() !== null;
}

/**
 * Re-registers geofence regions for every pinned store in this family.
 * Call on app foreground / after a pin is added or removed — expo-location
 * has no incremental "add one region" API, the whole set is replaced each
 * call (per startGeofencingAsync's own docs).
 */
export async function registerStoreGeofences(familyId: string, memberId: string): Promise<void> {
  if (!isFeatureEnabled('store_proximity_reminders')) return;
  const tm = getTaskManager();
  if (!tm) return;

  // Per-member opt-out (EditMemberModal, Roster tab) — the geofence fires a
  // LOCAL notification on whichever device is physically nearby, so this is
  // inherently a per-device/per-active-member check, not something the
  // server side can gate.
  const { data: memberRow } = await supabase
    .from('members')
    .select('store_proximity_reminders_enabled')
    .eq('id', memberId)
    .single();
  if (memberRow?.store_proximity_reminders_enabled === false) {
    await stopStoreGeofences();
    return;
  }

  activeMemberIdRef = memberId;

  const { data: locations } = await supabase
    .from('store_locations')
    .select('store, latitude, longitude')
    .eq('family_id', familyId);

  if (!locations || locations.length === 0) {
    await stopStoreGeofences();
    return;
  }

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return;
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return;

  ensureTaskDefined(tm);
  alreadyNotified.clear();

  const regions: Location.LocationRegion[] = locations.map((loc: any) => {
    const identifier = `${familyId}:${loc.store}`;
    regionStoreMap[identifier] = { store: loc.store, familyId };
    return {
      identifier,
      latitude: loc.latitude,
      longitude: loc.longitude,
      radius: GEOFENCE_RADIUS_METERS,
      notifyOnEnter: true,
      notifyOnExit: false,
    };
  });

  await Location.startGeofencingAsync(STORE_GEOFENCE_TASK_NAME, regions);
}

export async function stopStoreGeofences(): Promise<void> {
  if (!getTaskManager()) return;
  const started = await Location.hasStartedGeofencingAsync(STORE_GEOFENCE_TASK_NAME).catch(() => false);
  if (started) await Location.stopGeofencingAsync(STORE_GEOFENCE_TASK_NAME);
  regionStoreMap = {};
  alreadyNotified.clear();
}
