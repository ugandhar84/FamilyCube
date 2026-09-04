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
import * as Device from 'expo-device';
import { supabase } from './supabase';
import { encryptLocationText } from './locationCrypto';

export const LOCATION_TASK_NAME = 'family-cube-background-location';

const LOW_BATTERY_THRESHOLD = 20;
const LOW_BATTERY_RESET_ABOVE = 25; // hysteresis — avoids re-alerting every update while hovering near the threshold

let lowBatteryAlerted = false;

/**
 * Fires the family low-battery alert once per episode — armed again only
 * once the device charges back above LOW_BATTERY_RESET_ABOVE, so a phone
 * sitting at 19% doesn't re-notify the family on every single location
 * update. Safe to call on every update; it no-ops most of the time.
 *
 * Was calling the dedicated notify-low-battery edge function, which wrote
 * to notification_logs (confirmed dead — zero real writers app-wide, see
 * store/notifStore.ts's header comment) and read recipient push tokens
 * from `push_tokens` (confirmed empty — zero rows, ever). Both of this
 * feature's two delivery paths were broken independently, so no low-
 * battery alert has ever reached anyone. family-notifier already has a
 * correctly-wired 'low_battery' case (real `notifications` table,
 * member_device_tokens/members.expo_push_token resolution) — reuse that
 * single working pipeline instead of maintaining a second, broken one.
 */
export async function maybeAlertLowBattery(memberId: string, batteryLevel: number | null): Promise<void> {
  // The Simulator doesn't have a real device battery — expo-battery reads
  // whatever the host Mac reports, and its first read right after
  // launch/reload is known to come back as a bogus near-zero value before
  // settling, which fired a false "low battery" alert on every single
  // reload (live-reported: Mac was at 51%, well above the 20% threshold,
  // yet the alert still fired). Only real devices have trustworthy battery
  // telemetry worth alerting the family on.
  if (!Device.isDevice) return;
  if (batteryLevel === null) return;
  if (batteryLevel > LOW_BATTERY_RESET_ABOVE) { lowBatteryAlerted = false; return; }
  if (batteryLevel > LOW_BATTERY_THRESHOLD || lowBatteryAlerted) return;
  lowBatteryAlerted = true;
  try {
    const { data: member } = await supabase.from('members')
      .select('name, family_id').eq('id', memberId).single();
    if (!member?.family_id) return;
    // 'low_battery' isn't in family-notifier's NOTIFY_PARENTS/NOTIFY_SPECIFIC
    // auto-route lists (it's not parent-specific or tied to one other
    // member) — resolve "every other family member" here, same as the old
    // notify-low-battery function used to do server-side.
    const { data: others } = await supabase.from('members')
      .select('id').eq('family_id', member.family_id).neq('id', memberId);
    const recipientIds = (others ?? []).map((m: any) => m.id);
    if (!recipientIds.length) return;
    await supabase.functions.invoke('family-notifier', {
      body: {
        type: 'low_battery',
        familyId: member.family_id,
        memberIds: recipientIds,
        payload: { memberName: member.name, memberId, batteryLevel },
        persist: true,
      },
    });
  } catch { /* best-effort — a missed alert isn't worth failing the location update over */ }
}

// ~0.05 mile — the OS only calls the task again once the device has moved
// at least this far, so an idle/stationary phone simply never re-fires and
// nothing gets written. That's the "don't pull battery when idle" behavior:
// battery is only read inside the task body, which only runs on real movement.
// Was 322m (0.2mi) — user-reported: location visibly lagged behind someone
// who had genuinely started walking/driving, since nothing wrote until a
// full 0.2mi had passed (~4-5 minutes of walking). 80m is still well above
// normal GPS jitter on a stationary phone (typically single-digit meters)
// but responsive enough that "just started moving" shows up promptly.
const MIN_DISTANCE_METERS = 80; // ~0.05 mi

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

const BATTERY_POLL_INTERVAL_MS = 5 * 60_000;

let batteryPollTimer: ReturnType<typeof setInterval> | null = null;
let batteryPollMemberId: string | null = null;

async function writeBatteryStatus(memberId: string): Promise<void> {
  const { level, isCharging } = await readBatteryStatus();
  if (level === null && isCharging === null) return;
  const patch = {
    ...(level !== null ? { battery_level: level } : {}),
    ...(isCharging !== null ? { is_charging: isCharging } : {}),
  };
  try {
    // Battery polling runs unconditionally for every signed-in member
    // (app/_layout.tsx, independent of whether they've ever touched "Share
    // My Location") — it must never be the write that FIRST creates this
    // member's member_locations row, since an upsert's insert branch falls
    // back to share_location_enabled's schema DEFAULT of false, silently
    // pre-deciding a choice this code has no opinion on (and doesn't know
    // family_id either, which a real insert here would also need). Deliberate
    // UPDATE-only: if no row exists yet this simply no-ops for that poll —
    // the real GPS-fix writer (which does know both the correct sharing
    // value and family_id) creates the row moments later regardless.
    await supabase.from('member_locations').update(patch).eq('member_id', memberId);
    if (!isCharging) maybeAlertLowBattery(memberId, level);
  } catch { /* best-effort — next poll will retry */ }
}

/**
 * Battery-only sampling, independent of the 0.2-mile movement gate that
 * drives the background location task above. A stationary phone can
 * legitimately lose real battery %/charging state for hours under that gate
 * (e.g. sitting on a charger at home) — this fills in with a plain interval
 * so the family's battery readout stays fresh without waiting on a real GPS
 * move. Only touches battery_level/is_charging, never lat/lng, so it can't
 * clobber a genuine location fix.
 *
 * Started/stopped from app/_layout.tsx (root-mounted for the app's whole
 * lifetime), not from GpsTab.tsx — a plain setInterval only survives while
 * its owning component stays mounted, so tying this to the GPS *screen*
 * meant it silently stopped the moment the user navigated to another tab.
 * Root-level start/stop keeps it running for as long as the app itself is
 * alive; like any plain JS timer it still pauses once iOS fully suspends
 * the app in the background and resumes on next foreground/wake.
 */
export function startBatteryPolling(memberId: string): void {
  if (batteryPollTimer && batteryPollMemberId === memberId) return;
  stopBatteryPolling();
  batteryPollMemberId = memberId;
  writeBatteryStatus(memberId);
  batteryPollTimer = setInterval(() => writeBatteryStatus(memberId), BATTERY_POLL_INTERVAL_MS);
}

export function stopBatteryPolling(): void {
  if (batteryPollTimer) clearInterval(batteryPollTimer);
  batteryPollTimer = null;
  batteryPollMemberId = null;
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
    // Whole-body try/catch — this callback is invoked directly by the
    // native TaskManager bridge, not from any JS call site that could ever
    // .catch() it itself. Before this, only the inner reverse-geocode and
    // battery reads were individually guarded; a thrown/rejected
    // encryptLocationText call or either of the two Supabase writes further
    // down (network blip, RLS denial, malformed payload) escaped as a
    // genuinely uncaught rejection straight out of the native bridge —
    // live-reported as "Uncaught (in promise, id: 0) ... Task
    // 'family-cube-background-location' not found for app ID
    // 'mainApplication'" even with isBackgroundLocationTracking/
    // stopBackgroundLocationTracking already fully guarded, since neither
    // of those was actually the source — this callback body was.
    try {
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
    //
    // Was: `lastFix` got overwritten on EVERY callback regardless of
    // whether this fix actually cleared the threshold and got written
    // below. On a platform that calls the task more often than
    // distanceInterval promises, each small hop reset the comparison
    // baseline to itself — so distance was always measured "since the
    // last raw callback" instead of "since the last point we actually
    // recorded," letting the device drift arbitrarily far (many times
    // MIN_DISTANCE_METERS) in a series of sub-threshold hops without ever
    // writing a single update. Only advance `lastFix` once a fix clears
    // the gate (right below) — an early return above now leaves the old
    // baseline in place so the next callback's distance is still measured
    // from the last real write, not the last raw callback.
    if (lastFix) {
      const moved = haversineMeters(lastFix.lat, lastFix.lng, lat, lng);
      if (moved < MIN_DISTANCE_METERS) return;
    }
    lastFix = { lat, lng };

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
      // This callback only ever runs while the native background task is
      // genuinely active, so sharing is unconditionally "on" here — explicit,
      // not left to the column's DEFAULT false. Was: omitted entirely, so if
      // this upsert's INSERT branch won the race against GpsTab.tsx's own
      // `share_location_enabled: true` write (both fire around
      // startBackgroundLocationTracking — this task can deliver its first
      // fix before that write lands), it created member_locations' row with
      // the column defaulting to false, silently overwriting the user's
      // real "on" choice (direct report: "share my location toggle... i see
      // it is on reinstall reset to false in UI" — same root cause, a race
      // rather than only the reinstall path this column was first added for).
      share_location_enabled: true,
    }, { onConflict: 'member_id' });

    if (lastFamilyId) {
      await supabase.from('member_location_history').insert({
        member_id: activeMemberId, family_id: lastFamilyId,
        lat, lng, address: encAddress,
        battery_level: batteryLevel, is_charging: isCharging,
        recorded_at: now,
      });
    }
    } catch (e) {
      console.warn('[locationTracking] background task callback failed:', (e as Error)?.message ?? e);
    }
  });
  taskDefined = true;
}

/** True once expo-task-manager's native module is actually available (post-rebuild). */
export function isBackgroundLocationSupported(): boolean {
  return getTaskManager() !== null;
}

// Eagerly (re-)registers the JS-side task handler as soon as this module
// loads, instead of waiting for some screen to call
// startBackgroundLocationTracking first. Was lazy-only — on every fresh JS
// instance (a dev reload, or a real app relaunch) where the NATIVE side
// still has the background task running from before (it survives a JS
// reload independently), a location fix could arrive and get handed to the
// native TaskManager bridge before any UI had re-invoked start/ensureTaskDefined
// this session. With no JS handler registered yet, the bridge itself threw
// "Task 'family-cube-background-location' not found for app ID
// 'mainApplication'" as a promise nothing in JS ever attached a .catch()
// to — live-reported exactly as an "Uncaught (in promise, id: 0)" error
// right after a rebuild+reload. Registering here closes that window: by
// the time any location fix can possibly arrive, the handler already
// exists, independent of whether the user has touched GpsTab/KioskFindFamTab
// yet this session.
(() => {
  const tm = getTaskManager();
  if (tm) ensureTaskDefined(tm);
})();

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
    distanceInterval: MIN_DISTANCE_METERS, // ~0.05 mile (80m) — see MIN_DISTANCE_METERS' own comment
    showsBackgroundLocationIndicator: true, // iOS blue status-bar pill while active — visible, not sneaky
    foregroundService: {
      notificationTitle: 'Family Cube',
      notificationBody: 'Sharing your location with your family',
    },
  });
  return true;
}

export async function stopBackgroundLocationTracking(): Promise<void> {
  try {
    if (!getTaskManager()) return;
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
    if (started) {
      // A dev-client rebuild/reinstall can leave hasStartedLocationUpdatesAsync
      // reporting true from a previous native binary's task registration that
      // no longer exists in this one — stopLocationUpdatesAsync then throws
      // "Task ... not found" instead of just being a no-op. Either way the
      // task isn't running anymore, so swallow it rather than let it become
      // an uncaught rejection.
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
    }
  } catch (e) {
    // Whole-function guard, same class of fix as isBackgroundLocationTracking
    // above — getTaskManager()/the native bridge itself can throw
    // "Task ... not found for app ID ..." outside the two already-guarded
    // inner calls, and this function has no caller that awaits it with its
    // own .catch() (see GpsTab.tsx's `await stopBackgroundLocationTracking()`).
    console.warn('[locationTracking] stopBackgroundLocationTracking failed, treating as already stopped:', (e as Error)?.message ?? e);
  }
  setBackgroundLocationMemberId(null);
}

export async function isBackgroundLocationTracking(): Promise<boolean> {
  // Was: only the inner hasStartedLocationUpdatesAsync call was guarded —
  // getTaskManager()/the native bridge call itself could still throw
  // (observed live: "Task 'family-cube-background-location' not found for
  // app ID 'mainApplication'" — the OS-level task registration can outlive
  // a single JS session, e.g. after a dev-client reinstall/rebuild leaves a
  // stale native registration behind), and every call site awaited this
  // with a bare .then(), no .catch(), so the rejection surfaced as an
  // uncaught promise error instead of just meaning "not tracking."
  try {
    if (!getTaskManager()) return false;
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch (e) {
    console.warn('[locationTracking] isBackgroundLocationTracking failed — treating as not tracking:', (e as Error)?.message ?? e);
    return false;
  }
}
