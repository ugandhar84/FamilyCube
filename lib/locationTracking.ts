/**
 * locationTracking — background location updates for the family Radar map.
 * Registers a TaskManager background task that expo-location calls with
 * fresh coordinates even while the app is backgrounded/closed, and writes
 * them straight to Supabase (member_locations) so every family member's
 * map view stays current without anyone needing the app open.
 *
 * expo-task-manager's native module isn't present until a full native
 * rebuild runs (pod install + Xcode build) after installing the package —
 * a plain `import * as TaskManager from 'expo-task-manager'` throws at
 * module-eval time on a stale JS-only reload, which crashed the entire
 * import chain (GpsTab → VaultScreen → the profile route) and took the
 * whole (tabs)/profile route down with it. requireOptionalNativeModule
 * mirrors lib/location.ts's existing safe-wrapper pattern so this file is
 * inert instead of fatal until the rebuild actually happens.
 */
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as Location from 'expo-location';
import { supabase } from './supabase';
import { encryptLocationText } from './locationCrypto';

export const LOCATION_TASK_NAME = 'family-cube-background-location';

const LOW_BATTERY_THRESHOLD = 15;
const LOW_BATTERY_RESET_ABOVE = 20; // hysteresis — avoids re-alerting every update while hovering at 15%

let lowBatteryAlerted = false;

/**
 * Fires the family low-battery alert once per episode — armed again only
 * once the device charges back above LOW_BATTERY_RESET_ABOVE, so a phone
 * sitting at 14% doesn't re-notify the family on every single location
 * update. Safe to call on every update; it no-ops most of the time.
 */
export async function maybeAlertLowBattery(memberId: string, batteryLevel: number | null): Promise<void> {
  if (batteryLevel === null) return;
  if (batteryLevel > LOW_BATTERY_RESET_ABOVE) { lowBatteryAlerted = false; return; }
  if (batteryLevel > LOW_BATTERY_THRESHOLD || lowBatteryAlerted) return;
  lowBatteryAlerted = true;
  try {
    await supabase.functions.invoke('notify-low-battery', {
      body: { member_id: memberId, battery_level: batteryLevel },
    });
  } catch { /* best-effort — a missed alert isn't worth failing the location update over */ }
}

// 0.1 mile — the OS only calls the task again once the device has moved at
// least this far, so an idle/stationary phone simply never re-fires and
// nothing gets written. That's the "don't pull battery when idle" behavior:
// battery is only read inside the task body, which only runs on real movement.
const MIN_DISTANCE_METERS = 161; // 0.1 mi = 160.9344m

let lastFamilyId: string | null = null;
export function setBackgroundLocationFamilyId(id: string | null) {
  lastFamilyId = id;
}

type TaskManagerAPI = typeof import('expo-task-manager');
let _tm: TaskManagerAPI | null | undefined = undefined; // undefined = unchecked

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

// Same lazy-load story as expo-task-manager above — expo-battery is a
// native module too, so an eager `import * as Battery from 'expo-battery'`
// throws at module-eval time before a rebuild and crashes this whole file's
// import chain (GpsTab → VaultScreen → the profile route) right along with it.
type BatteryAPI = typeof import('expo-battery');
let _battery: BatteryAPI | null | undefined = undefined;

function getBattery(): BatteryAPI | null {
  if (_battery !== undefined) return _battery;
  const native = requireOptionalNativeModule('ExpoBattery');
  if (!native) { _battery = null; return null; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _battery = require('expo-battery') as BatteryAPI;
  } catch {
    _battery = null;
  }
  return _battery;
}

/**
 * Reads the device's current battery level/charging state — exported so the
 * manual "refresh my location" tap (GpsTab.tsx) can write a REAL value
 * instead of leaving battery_level/is_charging stale from whatever the
 * background task last wrote (or never wrote at all, for someone who's
 * never left movement-radius since enabling tracking). Same lazy-load/
 * safe-wrapper pattern as the background task's own read above.
 */
export async function readBatteryStatus(): Promise<{ level: number | null; isCharging: boolean | null }> {
  const battery = getBattery();
  if (!battery) return { level: null, isCharging: null };
  try {
    const level = await battery.getBatteryLevelAsync();
    const state = await battery.getBatteryStateAsync();
    return {
      level: level >= 0 ? Math.round(level * 100) : null,
      isCharging: state === battery.BatteryState.CHARGING || state === battery.BatteryState.FULL,
    };
  } catch {
    return { level: null, isCharging: null };
  }
}

// Registered once, lazily, the first time getTaskManager() succeeds (rather
// than at module load) — the task body itself reads the member id from a
// small in-memory ref since TaskManager callbacks can't accept closures
// over component state.
let activeMemberId: string | null = null;
export function setBackgroundLocationMemberId(id: string | null) {
  activeMemberId = id;
}

let lastFix: { lat: number; lng: number } | null = null;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let taskDefined = false;
function ensureTaskDefined(tm: TaskManagerAPI) {
  if (taskDefined || tm.isTaskDefined(LOCATION_TASK_NAME)) { taskDefined = true; return; }
  tm.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error('[locationTracking] background task error:', error.message);
      return;
    }
    if (!activeMemberId) return; // no signed-in member yet — nothing to attribute this to
    const { locations } = (data as { locations: Location.LocationObject[] }) ?? { locations: [] };
    const loc = locations?.[locations.length - 1];
    if (!loc) return;

    const { latitude: lat, longitude: lng } = loc.coords;

    // The OS already gates re-delivery on distanceInterval, but double-check
    // here too since some platforms are looser about the threshold — a
    // stationary device should never reach the battery read below.
    const prev = lastFix;
    lastFix = { lat, lng };
    if (prev) {
      const moved = haversineMeters(prev.lat, prev.lng, lat, lng);
      if (moved < MIN_DISTANCE_METERS) return;
    }

    // Crisp street-level address — geo.street is the primary "which street"
    // signal; name/city fill in when street is unavailable (e.g. rural).
    // Precise (house number included) is only used when the member has
    // opted into share_exact_address — otherwise we fall back to the
    // street-name-only coarse version, same privacy default as the manual
    // refresh path in GpsTab.tsx.
    let street: string | null = null;
    let coarseAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    let preciseAddress = coarseAddress;
    let neighborhood = coarseAddress;
    try {
      const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (geo) {
        street = geo.street ?? geo.name ?? null;
        coarseAddress = [street, geo.city].filter(Boolean).join(', ') || coarseAddress;
        preciseAddress = [
          [geo.streetNumber, street].filter(Boolean).join(' ') || street,
          geo.city,
        ].filter(Boolean).join(', ') || coarseAddress;
        neighborhood = geo.district ?? geo.city ?? geo.region ?? coarseAddress;
      }
    } catch { /* reverse geocode is best-effort — raw coords are still useful */ }

    let shareExact = false;
    try {
      const { data: pref } = await supabase.from('member_locations')
        .select('share_exact_address').eq('member_id', activeMemberId).maybeSingle();
      shareExact = pref?.share_exact_address ?? false;
    } catch { /* default to coarse on lookup failure */ }
    const address = shareExact ? preciseAddress : coarseAddress;

    // Battery is only ever read here — inside a real, movement-triggered
    // update — never on a bare timer tick, per "if they're idle don't pull it".
    let batteryLevel: number | null = null;
    let isCharging: boolean | null = null;
    const battery = getBattery();
    if (battery) {
      try {
        const level = await battery.getBatteryLevelAsync();
        const state = await battery.getBatteryStateAsync();
        if (level >= 0) batteryLevel = Math.round(level * 100);
        isCharging = state === battery.BatteryState.CHARGING || state === battery.BatteryState.FULL;
      } catch { /* battery API unavailable — skip rather than block the update */ }
    }
    if (!isCharging) maybeAlertLowBattery(activeMemberId, batteryLevel);

    // Address/street text uses the same per-device envelope as chat when
    // per_device_e2e is on (see lib/locationCrypto.ts) — falls back to the
    // legacy shared-family key otherwise. lat/lng stay plain (the map
    // needs them live/queryable to render pins without decrypting every
    // row), but the human-readable "where" is sensitive the same way a
    // chat message is.
    const encAddress = await encryptLocationText(activeMemberId, lastFamilyId, address);
    const encStreet  = street ? await encryptLocationText(activeMemberId, lastFamilyId, street) : null;
    const encNeighborhood = await encryptLocationText(activeMemberId, lastFamilyId, neighborhood);

    const now = new Date().toISOString();
    await supabase.from('member_locations').upsert({
      member_id: activeMemberId,
      family_id: lastFamilyId,
      lat, lng, address: encAddress,
      neighborhood: encNeighborhood,
      street: encStreet,
      ...(batteryLevel !== null ? { battery_level: batteryLevel } : {}),
      ...(isCharging !== null ? { is_charging: isCharging } : {}),
      speed_mph: loc.coords.speed ? Math.max(0, Math.round(loc.coords.speed * 2.237)) : 0,
      last_updated: now,
    }, { onConflict: 'member_id' });

    if (lastFamilyId) {
      await supabase.from('member_location_history').insert({
        member_id: activeMemberId, family_id: lastFamilyId,
        lat, lng, address: encAddress,
        battery_level: batteryLevel, is_charging: isCharging,
        recorded_at: now,
      });
    }
  });
  taskDefined = true;
}

/** True once expo-task-manager's native module is actually available (post-rebuild). */
export function isBackgroundLocationSupported(): boolean {
  return getTaskManager() !== null;
}

/**
 * Requests foreground THEN background ("Always") permission and starts
 * updates. Must request foreground first — iOS rejects a direct jump to
 * background permission. Returns false (and never starts) if either step
 * is denied, or if the native module isn't built in yet, so the caller can
 * fall back to foreground-only sharing / show a "rebuild needed" message.
 */
export async function startBackgroundLocationTracking(memberId: string, familyId?: string | null): Promise<boolean> {
  const tm = getTaskManager();
  if (!tm) return false;
  ensureTaskDefined(tm);
  setBackgroundLocationMemberId(memberId);
  setBackgroundLocationFamilyId(familyId ?? null);
  lastFix = null; // fresh session — next fix always counts as "moved"

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;

  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return false;

  const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (already) return true;

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    // Balanced (not Highest) — network/coarse GPS fixes, not continuous
    // high-accuracy tracking. This is a "which street is everyone on"
    // family map, not turn-by-turn navigation, and accuracy is the single
    // biggest battery-cost lever here.
    accuracy: Location.Accuracy.Balanced,
    // Movement is the only real trigger — a stationary phone never wakes
    // the GPS chip, so no update (and no battery read) happens while idle.
    // timeInterval is a rarely-hit safety net, not a normal-operation
    // keepalive: on iOS the OS's own motion coprocessor gates delivery
    // regardless of this value, and on Android — which does honor it more
    // literally — an hour is loose enough that it never becomes the
    // effective polling rate; distanceInterval stays the real driver.
    timeInterval: 60 * 60_000,
    distanceInterval: MIN_DISTANCE_METERS, // 0.1 mile
    showsBackgroundLocationIndicator: true, // iOS blue status-bar pill while active — visible, not sneaky
    foregroundService: {
      notificationTitle: 'Family Cube',
      notificationBody: 'Sharing your location with your family',
    },
  });
  return true;
}

export async function stopBackgroundLocationTracking(): Promise<void> {
  if (!getTaskManager()) return;
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  setBackgroundLocationMemberId(null);
}

export async function isBackgroundLocationTracking(): Promise<boolean> {
  if (!getTaskManager()) return false;
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
}
