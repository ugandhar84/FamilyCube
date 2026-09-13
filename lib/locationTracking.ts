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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, withSuppressedNetworkBanner, setActiveMemberIdHeaderOverride } from './supabase';
import { encryptLocationText } from './locationCrypto';

// Persisted fallback for activeMemberId/lastFamilyId below — was IN-MEMORY
// ONLY (module-level vars, set only by GpsTab.tsx's mount effect / the
// tracking-toggle handler, both of which run inside the React tree). On
// iOS, startLocationUpdatesAsync can wake/relaunch the app in a
// background/headless JS context to deliver a fix — a fresh JS
// evaluation resets both vars to null, and nothing outside the full
// app-boot UI flow ever repopulates them, so the task's own
// `if (!activeMemberId) return` guard silently no-op'd every single
// background delivery with no error anywhere (live-reported: moved
// >0.5 miles, map still showed the old location, no error). Storing
// these under a plain AsyncStorage key any time they're set lets the
// task body recover them synchronously-enough (one AsyncStorage read)
// even when this module's own memory was wiped by a background relaunch.
const STORAGE_KEY_MEMBER_ID = 'familycube_bg_location_member_id';
const STORAGE_KEY_FAMILY_ID = 'familycube_bg_location_family_id';

// TestFlight/production builds have no Metro console — every failure in
// this background task previously went to console.error/console.warn
// only, so a persistent write failure (an RLS policy mismatch, a stale
// auth token, anything that fails on EVERY delivery rather than a one-off
// blip) was structurally undiagnosable outside a dev build. It would also
// silently feed the app-wide network-failure counter (lib/networkStore.ts)
// on every attempt, popping the generic "No internet connection —
// retrying…" banner with zero way to tell it apart from a real
// connectivity issue [live-reported: "getting this count not connect
// error - not sure why... could be location"]. Same
// record/get/clear-last-error pattern lib/calendarSync2Way.ts already
// uses for Apple Calendar sync — persists the most recent real failure so
// GpsTab.tsx can surface it directly in the UI instead of it vanishing
// into a console no one on a real device can see.
const LAST_ERROR_KEY_PREFIX = 'familycube_bg_location_last_error_'; // + memberId

async function recordLocationSyncError(memberId: string, context: string, e: unknown): Promise<void> {
  try {
    const message = e instanceof Error ? e.message : String(e);
    await AsyncStorage.setItem(LAST_ERROR_KEY_PREFIX + memberId, JSON.stringify({ context, message, at: new Date().toISOString() }));
  } catch { /* best-effort only */ }
}

export async function getLastLocationSyncError(memberId: string): Promise<{ context: string; message: string; at: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_ERROR_KEY_PREFIX + memberId);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function clearLastLocationSyncError(memberId: string): Promise<void> {
  try { await AsyncStorage.removeItem(LAST_ERROR_KEY_PREFIX + memberId); } catch { /* best-effort */ }
}

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
        excludeMemberId: memberId,
        payload: { memberName: member.name, memberId, batteryLevel },
        persist: true,
      },
    });
  } catch { /* best-effort — a missed alert isn't worth failing the location update over */ }
}

/** Resolves this member's family's parents and sends a family-notifier push — same self-contained pattern maybeAlertLowBattery above already uses. */
async function notifyParents(memberId: string, type: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const { data: member } = await supabase.from('members')
      .select('name, family_id').eq('id', memberId).single();
    if (!member?.family_id) return;
    const { data: parents } = await supabase.from('members')
      .select('id').eq('family_id', member.family_id).eq('role', 'parent').neq('id', memberId);
    const recipientIds = (parents ?? []).map((m: any) => m.id);
    if (!recipientIds.length) return;
    await supabase.functions.invoke('family-notifier', {
      body: {
        type, familyId: member.family_id, memberIds: recipientIds,
        excludeMemberId: memberId,
        payload: { memberName: member.name, memberId, ...payload },
        persist: true,
      },
    });
  } catch { /* best-effort — a missed alert isn't worth failing the location update over */ }
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineMeters(lat1, lng1, lat2, lng2) / 1609.344;
}

/**
 * Driving Reports — opens/updates/closes a driving_trips row and fires the
 * speeding/possible-crash alerts, all derived purely from the fixes the
 * background task above already produces (see this file's DRIVING_SPEED_MPH
 * etc. declarations for the full design rationale). Deliberately NOT using
 * lastFix/MIN_DISTANCE_METERS's own gate — trips need every genuine fix at
 * driving speed, even sub-25m ones, to compute accurate max speed/distance.
 */
async function handleDrivingTrip(
  memberId: string, familyId: string, speedMph: number,
  lat: number, lng: number, accuracy: number | null, nowIso: string,
): Promise<void> {
  const now = Date.now();
  const isDriving = speedMph > DRIVING_SPEED_MPH;

  // Trip gap timeout — a stale open trip (car parked, phone lost signal)
  // must not hang open forever; close it out before considering this fix.
  if (activeTripId && activeTripLastFixAt && now - activeTripLastFixAt > TRIP_GAP_TIMEOUT_MS) {
    await supabase.from('driving_trips').update({ ended_at: nowIso }).eq('id', activeTripId);
    activeTripId = null;
    activeTripLastFixAt = null;
    recentFixes = [];
    pendingCrashCheck = null;
  }

  if (isDriving) {
    recentFixes.push({ speedMph, accuracy });
    if (recentFixes.length > 5) recentFixes.shift();

    if (!activeTripId) {
      const { data: trip, error } = await supabase.from('driving_trips').insert({
        member_id: memberId, family_id: familyId,
        started_at: nowIso, max_speed_mph: speedMph,
        start_lat: lat, start_lng: lng, end_lat: lat, end_lng: lng,
      }).select('id').single();
      if (error || !trip) { console.warn('[locationTracking] driving_trips insert failed:', error?.message); return; }
      activeTripId = trip.id;
    } else {
      const distanceDelta = lastFix ? haversineMiles(lastFix.lat, lastFix.lng, lat, lng) : 0;
      const { data: current } = await supabase.from('driving_trips')
        .select('max_speed_mph, distance_miles').eq('id', activeTripId).single();
      await supabase.from('driving_trips').update({
        max_speed_mph: Math.max(current?.max_speed_mph ?? 0, speedMph),
        distance_miles: (current?.distance_miles ?? 0) + distanceDelta,
        end_lat: lat, end_lng: lng,
      }).eq('id', activeTripId);
    }
    activeTripLastFixAt = now;

    // Speeding alert — once per trip, not once per over-threshold fix.
    // Threshold is per-family configurable (families.speeding_threshold_mph).
    const speedingThreshold = await getSpeedingThreshold(familyId);
    if (speedMph > speedingThreshold) {
      const { data: trip } = await supabase.from('driving_trips')
        .select('speeding_alerted').eq('id', activeTripId).single();
      if (trip && !trip.speeding_alerted) {
        await supabase.from('driving_trips').update({ speeding_alerted: true }).eq('id', activeTripId);
        await notifyParents(memberId, 'speeding_alert', { speedMph });
      }
    }

    // Crash guardrail conditions 1-3 (see this file's header comment on
    // DRIVING_SPEED_MPH/HIGHWAY_SPEED_MPH for the full rationale) — only
    // arms the pending check; condition 4 (no resume within 60s) is
    // resolved on a LATER fix or the non-driving branch below, since it
    // can't be known synchronously here.
    const sustainedHighway = recentFixes.length >= 3 &&
      recentFixes.slice(-3).every(f => f.speedMph > HIGHWAY_SPEED_MPH);
    const lastFixGoodAccuracy = accuracy !== null && accuracy < CRASH_MIN_ACCURACY_M;
    if (sustainedHighway && lastFixGoodAccuracy && !pendingCrashCheck) {
      // Armed here, but the actual drop (condition 2) is only known once a
      // LOW-speed fix actually arrives — see the non-driving branch below.
      // Nothing to do yet on a still-fast fix.
    }
  } else {
    // Non-driving fix — this is where a real speed-drop (condition 2) is
    // observed, using the driving state from just before this fix.
    if (activeTripId && recentFixes.length >= 3 && !pendingCrashCheck) {
      const sustainedHighway = recentFixes.slice(-3).every(f => f.speedMph > HIGHWAY_SPEED_MPH);
      const lastAccuracyOk = recentFixes[recentFixes.length - 1]?.accuracy !== null &&
        (recentFixes[recentFixes.length - 1]!.accuracy as number) < CRASH_MIN_ACCURACY_M;
      const suddenDrop = speedMph < 5;
      if (sustainedHighway && lastAccuracyOk && suddenDrop) {
        pendingCrashCheck = { tripId: activeTripId, droppedAt: now };
      }
    } else if (pendingCrashCheck && speedMph > 5) {
      // Resumed within the grace window — condition 4 fails, this was a
      // normal brief stop, not a crash. Disarm.
      pendingCrashCheck = null;
    }

    if (pendingCrashCheck && now - pendingCrashCheck.droppedAt >= CRASH_RESUME_GRACE_MS) {
      const { data: trip } = await supabase.from('driving_trips')
        .select('possible_crash_alerted').eq('id', pendingCrashCheck.tripId).single();
      if (trip && !trip.possible_crash_alerted) {
        await supabase.from('driving_trips').update({ possible_crash_alerted: true }).eq('id', pendingCrashCheck.tripId);
        await notifyParents(memberId, 'possible_crash', { speedMph });
      }
      pendingCrashCheck = null;
    }

    if (activeTripId) {
      await supabase.from('driving_trips').update({ ended_at: nowIso }).eq('id', activeTripId);
      activeTripId = null;
      activeTripLastFixAt = null;
      recentFixes = [];
    }
  }
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
const MIN_DISTANCE_METERS = 25; // ~0.015 mi — matches startLocationUpdatesAsync's distanceInterval below

let lastFamilyId: string | null = null;
export function setBackgroundLocationFamilyId(id: string | null) {
  lastFamilyId = id;
  // Fire-and-forget — see STORAGE_KEY_FAMILY_ID's own comment. Never
  // awaited/blocking: this setter is called from UI code that shouldn't
  // wait on a disk write, and a momentary lag between the in-memory var
  // and the persisted copy is harmless (the in-memory var is always tried
  // first, see ensureTaskDefined below).
  if (id) AsyncStorage.setItem(STORAGE_KEY_FAMILY_ID, id).catch(() => {});
  else AsyncStorage.removeItem(STORAGE_KEY_FAMILY_ID).catch(() => {});
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

const LOCATION_HEARTBEAT_INTERVAL_MS = 15 * 60_000;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatMemberId: string | null = null;

async function writeLocationHeartbeat(memberId: string): Promise<void> {
  try {
    // UPDATE-only, same reasoning as writeBatteryStatus above — must never
    // be the write that creates member_locations' row (would default
    // share_location_enabled to false). Only touches last_updated: lat/lng/
    // address stay whatever the real GPS-fix writer last recorded, since a
    // stationary person's actual position hasn't changed.
    await supabase.from('member_locations').update({ last_updated: new Date().toISOString() })
      .eq('member_id', memberId).eq('share_location_enabled', true);
  } catch { /* best-effort — next tick will retry */ }
}

/**
 * Keeps member_locations.last_updated fresh for a stationary member, who
 * would otherwise sit at whatever timestamp their last real 25m+ move
 * produced — potentially many hours ago (live-reported: three different
 * family members all stuck at "3h ago"/"6h ago" while just at home; not a
 * write-path failure, this is the actual by-design behavior of the
 * movement-gated background task above, which correctly has no reason to
 * fire for someone who hasn't moved). That gate is right for lat/lng/
 * address/battery (nothing there has changed, no reason to re-derive them),
 * but a frozen last_updated reads as "tracking broke" to a family member
 * looking at the map, not as "they're just home" — Life360 and similar
 * apps keep a visibly-recent "last seen" even for a stationary pin. Same
 * root-mounted, screen-independent lifecycle as startBatteryPolling (see
 * its own comment) rather than GpsTab.tsx, so this doesn't stop the moment
 * someone navigates off the GPS tab.
 */
export function startLocationHeartbeat(memberId: string): void {
  if (heartbeatTimer && heartbeatMemberId === memberId) return;
  stopLocationHeartbeat();
  heartbeatMemberId = memberId;
  heartbeatTimer = setInterval(() => writeLocationHeartbeat(memberId), LOCATION_HEARTBEAT_INTERVAL_MS);
}

export function stopLocationHeartbeat(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  heartbeatMemberId = null;
}

/**
 * Writes this physical device's own battery + identity to the
 * device_status table (one row per device, keyed by getDeviceId() — the
 * same stable per-install id device_keys already uses — not per member,
 * since a device's model/name doesn't change as profiles switch). Live-
 * requested: "we should also send the device battery - kiosk device model
 * and name its battery." No existing mobile feature to mirror exactly —
 * mobile's own battery_level/is_charging on member_locations is a
 * per-MEMBER field (startBatteryPolling above), already covering a kiosk
 * device's own battery for free with zero extra code; device model/name
 * has never been persisted anywhere before (components/FeedbackSheet.tsx's
 * Device.modelName/deviceName usage is read-only for a support form, never
 * written to the DB). Safe to call on every app foreground/session start —
 * cheap upsert, no polling loop needed since model/name never change and
 * battery already has its own 5-minute poll via startBatteryPolling.
 */
export async function reportDeviceStatus(familyId: string | null | undefined): Promise<void> {
  if (!familyId) return;
  try {
    const { getDeviceId } = await import('./chatCrypto');
    const deviceId = await getDeviceId();
    const { level, isCharging } = await readBatteryStatus();
    await supabase.from('device_status').upsert({
      device_id: deviceId,
      family_id: familyId,
      device_model: Device.modelName ?? null,
      device_name: Device.deviceName ?? null,
      ...(level !== null ? { battery_level: level } : {}),
      ...(isCharging !== null ? { is_charging: isCharging } : {}),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'device_id' });
  } catch (e: any) {
    console.warn('[locationTracking] reportDeviceStatus failed', e?.message ?? e);
  }
}

// Registered once, lazily, the first time getTaskManager() succeeds (rather
// than at module load) — the task body itself reads the member id from a
// small in-memory ref since TaskManager callbacks can't accept closures
// over component state.
let activeMemberId: string | null = null;
export function setBackgroundLocationMemberId(id: string | null) {
  activeMemberId = id;
  // See STORAGE_KEY_MEMBER_ID's own comment — persisted fallback for a
  // background-relaunched JS instance where this in-memory var starts
  // out null again.
  if (id) AsyncStorage.setItem(STORAGE_KEY_MEMBER_ID, id).catch(() => {});
  else AsyncStorage.removeItem(STORAGE_KEY_MEMBER_ID).catch(() => {});
}

let lastFix: { lat: number; lng: number } | null = null;

// Driving Reports — trip boundaries derived entirely from the fixes this
// background task already produces, no new native tracking/permission/task.
// Reset on a background relaunch same as lastFix/activeMemberId — a
// relaunch mid-trip just starts a fresh trip row on the next qualifying
// fix, no worse than lastFix's own baseline already resetting today.
const DRIVING_SPEED_MPH = 8; // matches GpsTab.tsx's classifyMovement driving cutoff
const DEFAULT_SPEEDING_THRESHOLD_MPH = 70; // families.speeding_threshold_mph's own column default — used only if that read fails
const TRIP_GAP_TIMEOUT_MS = 10 * 60_000; // no fix for this long — car parked / lost signal, close the trip rather than hang it open forever
let activeTripId: number | null = null;
let activeTripLastFixAt: number | null = null; // Date.now() of the trip's most recent fix, for the gap-timeout check
// Crash guardrail state — see this file's own comment further down at the
// speed-drop check for why this can't be decided synchronously in one fix.
let pendingCrashCheck: { tripId: number; droppedAt: number } | null = null;
// Rolling window of the last few fixes' (speed, accuracy) — only as long as
// needed for the "sustained highway speed" guardrail (3 fixes), not a
// general-purpose history (member_location_history already exists for that).
const HIGHWAY_SPEED_MPH = 40;
const CRASH_MIN_ACCURACY_M = 20;
const CRASH_RESUME_GRACE_MS = 60_000;
let recentFixes: { speedMph: number; accuracy: number | null }[] = [];

// Per-family speeding threshold — configurable (live-requested), stored on
// `families.speeding_threshold_mph`. Cached briefly rather than queried on
// every single fix (this task can fire every 2 min while driving); a
// family changing their limit mid-trip picks it up within one cache TTL,
// not instantly, which is an acceptable tradeoff for one extra query saved
// per fix.
const THRESHOLD_CACHE_TTL_MS = 15 * 60_000;
let cachedThreshold: { familyId: string; value: number; at: number } | null = null;

async function getSpeedingThreshold(familyId: string): Promise<number> {
  if (cachedThreshold && cachedThreshold.familyId === familyId && Date.now() - cachedThreshold.at < THRESHOLD_CACHE_TTL_MS) {
    return cachedThreshold.value;
  }
  try {
    const { data } = await supabase.from('families').select('speeding_threshold_mph').eq('id', familyId).single();
    const value = data?.speeding_threshold_mph ?? DEFAULT_SPEEDING_THRESHOLD_MPH;
    cachedThreshold = { familyId, value, at: Date.now() };
    return value;
  } catch {
    return DEFAULT_SPEEDING_THRESHOLD_MPH;
  }
}

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
    // In-memory vars are null on a background-relaunched/headless JS
    // instance (see this file's own header comment and
    // STORAGE_KEY_MEMBER_ID's comment above) — fall back to the persisted
    // copy before giving up. Backfills the in-memory vars too so the rest
    // of this invocation (and any immediately-following ones in the same
    // JS instance) can read them synchronously without hitting storage
    // again.
    if (!activeMemberId) activeMemberId = await AsyncStorage.getItem(STORAGE_KEY_MEMBER_ID).catch(() => null);
    if (!lastFamilyId) lastFamilyId = await AsyncStorage.getItem(STORAGE_KEY_FAMILY_ID).catch(() => null);
    if (!activeMemberId) {
      console.warn('[locationTracking] background task fired with no known active member (memory + storage both empty) — skipping write');
      return;
    }
    // Real bug, found tracing "share exact address doesn't stick": this
    // headless context's Supabase calls never carried an x-active-member-id
    // header (lib/supabase.ts's own getActiveMemberIdHeader() reads
    // useFamilyStore, which isn't hydrated here) — so the server-side RLS
    // check `member_id = resolve_active_member_id()` fell through to an
    // "arbitrary pick among the session's members" fallback, wrong for any
    // multi-member family, and silently rejected every write this task
    // ever made. Set the override to the member id THIS task already knows
    // is correct (see this file's own header comment on why that's tracked
    // separately from familyStore in the first place).
    setActiveMemberIdHeaderOverride(activeMemberId);
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

    // Always the full exact address, house number included — the old
    // per-member "share exact address" toggle was removed after repeated
    // failed patches left it stuck/unreliable [live-requested: "i want
    // that ... make that default"], so every member's location now always
    // shows the complete address, no toggle/opt-out.
    let street: string | null = null;
    let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    let neighborhood = address;
    try {
      const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (geo) {
        street = geo.street ?? geo.name ?? null;
        address = [
          [geo.streetNumber, street].filter(Boolean).join(' ') || street,
          geo.city,
        ].filter(Boolean).join(', ') || address;
        neighborhood = geo.district ?? geo.city ?? geo.region ?? address;
      }
    } catch { /* reverse geocode is best-effort — raw coords are still useful */ }

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

    // Address/street text uses the shared-family-key scheme (see
    // lib/locationCrypto.ts). lat/lng stay plain (the map needs them
    // live/queryable to render pins without decrypting every row), but the
    // human-readable "where" is sensitive the same way a chat message is.
    const encAddress = await encryptLocationText(activeMemberId, lastFamilyId, address);
    const encStreet  = street ? await encryptLocationText(activeMemberId, lastFamilyId, street) : null;
    const encNeighborhood = await encryptLocationText(activeMemberId, lastFamilyId, neighborhood);

    const now = new Date().toISOString();
    // Was fire-and-forget with the error result never even read — an RLS
    // rejection (e.g. this task's activeMemberId/lastFamilyId disagreeing
    // with what resolve_active_member_id() resolves from the request
    // header, a genuinely separate "active member" tracker from this
    // file's own — see member_locations' own RLS policy) or any other
    // write failure vanished with zero trace anywhere, indistinguishable
    // from a real successful update from the outside (live-reported:
    // moved noticeably, map never updated, no error shown). Logging here
    // doesn't fix a real RLS mismatch by itself, but makes the next
    // occurrence actually diagnosable instead of a silent no-op.
    const speedMph = loc.coords.speed ? Math.max(0, Math.round(loc.coords.speed * 2.237)) : 0;
    const { error: upsertErr } = await withSuppressedNetworkBanner(() => supabase.from('member_locations').upsert({
      member_id: activeMemberId,
      family_id: lastFamilyId,
      lat, lng, address: encAddress,
      neighborhood: encNeighborhood,
      street: encStreet,
      ...(batteryLevel !== null ? { battery_level: batteryLevel } : {}),
      ...(isCharging !== null ? { is_charging: isCharging } : {}),
      speed_mph: speedMph,
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
    }, { onConflict: 'member_id' }));
    if (upsertErr) {
      console.error('[locationTracking] member_locations upsert failed:', upsertErr.message);
      await recordLocationSyncError(activeMemberId, 'upsert', upsertErr.message);
      return;
    }
    // A Postgres-level error (RLS denial, bad payload) comes back as a
    // normal HTTP response, never a fetch throw — withSuppressedNetworkBanner
    // only exempts transport-level failures, so this branch is reached
    // independently and is what actually distinguishes "a real bug" from
    // "the network dropped" for anyone reading this file. Clear any
    // previously-recorded failure once a write genuinely succeeds, so a
    // resolved issue doesn't keep showing as still-broken.
    await clearLastLocationSyncError(activeMemberId);

    if (lastFamilyId) {
      const { error: historyErr } = await withSuppressedNetworkBanner(() => supabase.from('member_location_history').insert({
        member_id: activeMemberId, family_id: lastFamilyId,
        lat, lng, address: encAddress,
        battery_level: batteryLevel, is_charging: isCharging,
        recorded_at: now,
      }));
      if (historyErr) console.warn('[locationTracking] member_location_history insert failed:', historyErr.message);
    }

    // Driving Reports — trip open/update/close, riding entirely on the fix
    // this task already produced above. See this file's header-level
    // comment block near activeTripId's declaration for why no new native
    // tracking is involved.
    if (lastFamilyId) {
      await handleDrivingTrip(activeMemberId, lastFamilyId, speedMph, lat, lng, loc.coords.accuracy ?? null, now);
    }
    } catch (e) {
      console.warn('[locationTracking] background task callback failed:', (e as Error)?.message ?? e);
      if (activeMemberId) await recordLocationSyncError(activeMemberId, 'callback', (e as Error)?.message ?? e);
    } finally {
      // Must always clear — this is a shared module-level override on the
      // ONE Supabase client instance, and the foreground app can resume
      // (or a foreground Supabase call can interleave) in the same JS
      // context right after this task runs. Leaving it set would send the
      // WRONG active-member header on the next foreground call, for
      // whoever the person actually switches to.
      setActiveMemberIdHeaderOverride(undefined);
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
    // Was: timeInterval 1hr (a rarely-hit safety net) + distanceInterval
    // 80m as the sole real driver — a stale fix from before someone
    // stopped moving (e.g. "Driving") sat untouched for up to an hour,
    // read as live the whole time [live-reported: family members actually
    // home still showed "Driving ... 2h ago" — "I want full experience
    // like Life360, quick and real-time updates"]. Real-world Life360-
    // style tracking needs a genuine timer, not just a distance gate that
    // never fires once movement stops. 2 minutes while the OS is actually
    // willing to wake this task is a meaningful battery tradeoff (accepted
    // explicitly), still far short of turn-by-turn navigation polling.
    // distanceInterval shrunk to match — 80m was tuned for the old
    // rarely-updating model; a live-feeling map wants a much tighter
    // "did they actually move" gate too.
    timeInterval: 2 * 60_000,
    distanceInterval: 25, // ~0.015 mile — meaningfully live without every GPS jitter counting as movement
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
