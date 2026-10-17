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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, withSuppressedNetworkBanner } from './supabase';
import { isFeatureEnabled } from './featureFlags';

export const STORE_GEOFENCE_TASK_NAME = 'family-cube-store-geofence';

// 1 mile — matches the "passing by, about a mile out" framing from the
// feature request; wide enough to catch someone driving past without
// needing to be right at the storefront.
const GEOFENCE_RADIUS_METERS = 1609;
const REGISTERED_KEY = '@familycube_store_geofence_key_v1';
const COOLDOWN_KEY_PREFIX = '@familycube_store_geofence_last_';
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MAX_FIX_AGE_MS = 2 * 60 * 1000;
const MAX_FIX_ACCURACY_M = 200;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

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
let lastRegisteredKey: string | null = null;

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

    // The OS Enter event can fire off a stale/cached last-known fix right
    // after startGeofencingAsync re-registers (every PIN-switch/app-load
    // calls registerStoreGeofences) — confirmed live-reported as a "near
    // Walmart" notification while nowhere near the store. Require a FRESH
    // GPS fix that's actually within the geofence radius before trusting
    // the event, rather than trusting the OS's own membership check alone.
    try {
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const distance = haversineMeters(
        fix.coords.latitude, fix.coords.longitude,
        region.latitude, region.longitude,
      );
      const ageMs = Date.now() - fix.timestamp;
      if (ageMs > MAX_FIX_AGE_MS || (fix.coords.accuracy ?? 0) > MAX_FIX_ACCURACY_M) return;
      if (distance > GEOFENCE_RADIUS_METERS) return;
      const last = Number(await AsyncStorage.getItem(COOLDOWN_KEY_PREFIX + region.identifier).catch(() => null)) || 0;
      if (Date.now() - last < COOLDOWN_MS) return;
    } catch (e) {
      console.warn('[storeGeofencing] fresh-fix check failed, skipping notify', e);
      return;
    }

    try {
      // count(exact) for the real total, but only fetch 2 names — the
      // notification should read as a quick, glanceable nudge ("Milk, Eggs
      // + 3 more"), not a dump of the whole list crammed into one line.
      const { data: pending, count } = await supabase
        .from('grocery_items')
        .select('name', { count: 'exact' })
        .eq('family_id', meta.familyId)
        .eq('is_bought', false)
        .eq('store_preference', meta.store)
        .order('created_at', { ascending: false })
        .limit(2);

      if (!pending || pending.length === 0) return;

      alreadyNotified.add(region.identifier);
      await AsyncStorage.setItem(COOLDOWN_KEY_PREFIX + region.identifier, String(Date.now())).catch(() => {});

      const notifs = getNotifications();
      const total = count ?? pending.length;
      const names = pending.map((p: any) => p.name).join(', ');
      const extra = total - pending.length;
      const body = extra > 0 ? `${names} + ${extra} more on your list` : `${names} on your list`;

      if (notifs) {
        await notifs.scheduleNotificationAsync({
          content: {
            title: `🛒 You're near ${meta.store}`,
            body,
            data: { type: 'store_proximity', store: meta.store },
            sound: true,
          },
          trigger: null,
        });
      }

      // The above is LOCAL to this device only — the rest of the family
      // never hears about it. Direct report: "when the parent in the near
      // proximity of the grocery stores then they should get notify" (the
      // OTHER partner, not just whoever's phone is actually there). Best-
      // effort real push via family-notifier, excluding the person who's
      // physically at the store.
      try {
        // This handler fires from a headless/backgrounded JS context on
        // whatever connectivity the OS hands it (same class of call as
        // lib/locationTracking.ts's own background push) — a transport
        // failure here is common-by-nature, not a real "you're offline"
        // moment for whoever's actively using the app elsewhere, so it
        // shouldn't trip the same shared app-wide network-failure banner
        // every foreground Supabase call also feeds [same fix applied to
        // locationTracking.ts this session for the identical reason].
        await withSuppressedNetworkBanner(async () => {
          const { data: self } = await supabase.from('members').select('name').eq('id', activeMemberIdRef).single();
          const { data: others } = await supabase.from('members').select('id')
            .eq('family_id', meta.familyId).neq('id', activeMemberIdRef ?? '');
          const memberIds = (others ?? []).map((m: any) => m.id);
          if (memberIds.length) {
            await supabase.functions.invoke('family-notifier', {
              body: {
                type: 'store_proximity_arrived', familyId: meta.familyId, memberIds, persist: true,
                excludeMemberId: activeMemberIdRef ?? undefined,
                payload: { memberName: self?.name, store: meta.store, itemNames: names, extraCount: extra },
              },
            });
          }
        });
      } catch (e) {
        console.warn('[storeGeofencing] family-notifier push failed', e);
      }
    } catch (e) {
      console.warn('[storeGeofencing] enter-handler failed', e);
    }
  });
  taskDefined = true;
}

// Define at import time, not just inside registerStoreGeofences — otherwise
// a cold-start/background wake can deliver a geofence event for a region the
// OS still remembers from a prior session before this module's JS has had a
// chance to call registerStoreGeofences, and the task fires against an
// undefined name: "Task 'family-cube-store-geofence' not found for app ID"
// [live-reported, same class of race already fixed for placeGeofencing.ts/
// locationTracking.ts by defining their tasks eagerly at module load].
const _boot = getTaskManager();
if (_boot) ensureTaskDefined(_boot);

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

  // Skip re-arming when this exact region set is already registered —
  // every PIN-switch/app-load was calling startGeofencingAsync again with
  // an unchanged region list, which re-evaluates membership against
  // whatever cached fix the OS has and can fire a false Enter event for a
  // region the device isn't actually near [live-reported: "everytime in
  // pinswitch and the load the app im getting this push near walmart"].
  const regionsKey = regions.map(r => r.identifier).sort().join('|');
  const persistedKey = lastRegisteredKey ?? await AsyncStorage.getItem(REGISTERED_KEY).catch(() => null);
  if (regionsKey === persistedKey && await Location.hasStartedGeofencingAsync(STORE_GEOFENCE_TASK_NAME).catch(() => false)) {
    lastRegisteredKey = regionsKey;
    return;
  }
  lastRegisteredKey = regionsKey;
  await AsyncStorage.setItem(REGISTERED_KEY, regionsKey).catch(() => {});
  alreadyNotified.clear();

  await Location.startGeofencingAsync(STORE_GEOFENCE_TASK_NAME, regions);
}

export async function stopStoreGeofences(): Promise<void> {
  if (!getTaskManager()) return;
  const started = await Location.hasStartedGeofencingAsync(STORE_GEOFENCE_TASK_NAME).catch(() => false);
  if (started) await Location.stopGeofencingAsync(STORE_GEOFENCE_TASK_NAME);
  regionStoreMap = {};
  alreadyNotified.clear();
  lastRegisteredKey = null;
  await AsyncStorage.removeItem(REGISTERED_KEY).catch(() => {});
}
