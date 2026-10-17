/**
 * tripGeofencing — real GPS-driven trip automation.
 *
 * Live direction: "as parent starts a trip ... it should automatically do
 * all its own." tripStore.ts's dispatch() already auto-starts a trip at
 * phase 'en_route' (no manual tap needed for that first transition); THIS
 * file handles the two phases that genuinely need to know where the
 * driver physically is — 'picked_up' (arrived at the pickup point) and
 * 'arrived' (arrived back home) — by registering a real
 * expo-location geofence and calling advance_trip_phase automatically on
 * entry, instead of waiting for the driver to remember to tap a button.
 *
 * Structurally mirrors lib/storeGeofencing.ts (same startGeofencingAsync /
 * TaskManager / requireOptionalNativeModule pattern, same
 * degrades-to-no-op-until-native-rebuild story) — that file proved this
 * exact approach already works for store-arrival detection; this reuses
 * it for trip pickup/arrival instead of reinventing geofencing from
 * scratch. A SEPARATE expo-location geofencing "session" from
 * storeGeofencing's (independent task name/region set) since
 * startGeofencingAsync replaces the whole region set per task on every
 * call — trip regions and store regions must not fight over the same task.
 *
 * Only ever registers a geofence for a trip that has a pinned pickup
 * point (trips.pickup_lat/pickup_lng — see
 * 20260987000000_trips_pickup_coordinates.sql). A trip with no pinned
 * point never calls into this file at all and stays on the existing
 * fully-manual advance_trip_phase tap flow (ActiveTripDetailScreen).
 */
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as Location from 'expo-location';
import { supabase, withSuppressedNetworkBanner } from './supabase';

export const TRIP_GEOFENCE_TASK_NAME = 'family-cube-trip-geofence';

// 150m — a driver is genuinely "there" within this radius of the pinned
// pickup point. Tighter than storeGeofencing's 1-mile "passing by" radius
// on purpose: that feature wants an early heads-up; this one is asserting
// "the kid is actually in the car now," so it should only fire once the
// driver has actually arrived, not just driven past nearby.
const PICKUP_GEOFENCE_RADIUS_METERS = 150;

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

// Region identifier -> which trip it belongs to, which phase entering it
// should advance to, and its own coordinates (needed to rebuild the full
// region list on each call — see registerTripGeofence's own comment).
// TaskManager callbacks can't close over component/store state (same
// constraint storeGeofencing.ts and locationTracking.ts both document).
const regionTripMap: Record<string, { tripId: string; nextPhase: 'picked_up' | 'arrived'; latitude: number; longitude: number }> = {};
const alreadyAdvanced = new Set<string>();

let taskDefined = false;
function ensureTaskDefined(tm: TaskManagerAPI) {
  if (taskDefined || tm.isTaskDefined(TRIP_GEOFENCE_TASK_NAME)) { taskDefined = true; return; }
  tm.defineTask(TRIP_GEOFENCE_TASK_NAME, async ({ data, error }) => {
    if (error) { console.error('[tripGeofencing] task error:', error.message); return; }
    const { eventType, region } = (data as { eventType: number; region: Location.LocationRegion }) ?? {};
    if (eventType !== Location.GeofencingEventType.Enter) return;
    if (!region?.identifier) return;

    const meta = regionTripMap[region.identifier];
    if (!meta) return;
    if (alreadyAdvanced.has(region.identifier)) return;

    try {
      // Mirrors advance_trip_phase's own forward-only guard server-side —
      // this just avoids firing the RPC at all for a trip that's already
      // moved on (reassigned, cancelled, or a phase the driver already
      // advanced manually before the geofence caught up).
      const { data: trip } = await withSuppressedNetworkBanner(() =>
        supabase.from('trips').select('phase, completed_at').eq('id', meta.tripId).maybeSingle()
      );
      if (!trip || trip.completed_at) return;

      alreadyAdvanced.add(region.identifier);

      const { error: rpcError } = await withSuppressedNetworkBanner(() =>
        supabase.rpc('advance_trip_phase', { p_trip_id: meta.tripId, p_new_phase: meta.nextPhase })
      );
      if (rpcError) {
        // Forward-only guard rejecting a stale/out-of-order geofence
        // delivery is an expected, silent case (the driver likely already
        // tapped past this stage manually) — not worth surfacing as an
        // error the way a genuine write failure would be.
        if (!rpcError.message?.includes('backwards')) {
          console.warn('[tripGeofencing] advance_trip_phase failed', rpcError.message);
        }
      }
    } catch (e) {
      console.warn('[tripGeofencing] enter-handler failed', e);
    }
  });
  taskDefined = true;
}

/** True once expo-task-manager's native module is actually available (post-rebuild). */
export function isTripGeofencingSupported(): boolean {
  return getTaskManager() !== null;
}

/**
 * Registers a single geofence region at the trip's pinned pickup point.
 * Call right after tripStore.dispatch() creates the trip row — a no-op
 * (resolves immediately) if expo-task-manager isn't available yet or
 * location permission is denied, same degrade-gracefully story
 * storeGeofencing.ts already follows.
 *
 * Only handles the PICKUP leg (→ 'picked_up') for now — the return-home
 * leg has no fixed "home" coordinate captured anywhere in this app yet
 * (no per-family home address field), so 'picked_up' → 'arrived' stays
 * the existing manual tap until that's added.
 */
export async function registerTripGeofence(tripId: string, lat: number, lng: number): Promise<void> {
  const tm = getTaskManager();
  if (!tm) return;

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return;
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return;

  ensureTaskDefined(tm);

  const identifier = `trip:${tripId}:pickup`;
  regionTripMap[identifier] = { tripId, nextPhase: 'picked_up', latitude: lat, longitude: lng };
  alreadyAdvanced.delete(identifier);

  // startGeofencingAsync replaces ALL regions for this task on every call
  // (per its own docs, same note storeGeofencing.ts's registration makes)
  // — rebuild the full region list from everything currently tracked in
  // regionTripMap (every still-active trip's own pinned point, including
  // ones registered by earlier calls this session) rather than passing
  // only this one trip's region, which would silently drop a sibling
  // trip's geofence the instant a second trip starts.
  const regions: Location.LocationRegion[] = Object.entries(regionTripMap).map(([id, meta]) => ({
    identifier: id, latitude: meta.latitude, longitude: meta.longitude,
    radius: PICKUP_GEOFENCE_RADIUS_METERS, notifyOnEnter: true, notifyOnExit: false,
  }));

  await Location.startGeofencingAsync(TRIP_GEOFENCE_TASK_NAME, regions);
}

/** Stops watching a specific trip's geofence — call once its phase has advanced past what it was watching for, or the trip completes/cancels. */
export async function clearTripGeofence(tripId: string): Promise<void> {
  const identifier = `trip:${tripId}:pickup`;
  delete regionTripMap[identifier];
  alreadyAdvanced.delete(identifier);
  if (!getTaskManager()) return;
  const started = await Location.hasStartedGeofencingAsync(TRIP_GEOFENCE_TASK_NAME).catch(() => false);
  if (!started) return;
  const remaining = Object.keys(regionTripMap);
  if (remaining.length === 0) {
    await Location.stopGeofencingAsync(TRIP_GEOFENCE_TASK_NAME);
  }
  // Note: expo-location has no incremental "remove one region" API (same
  // constraint storeGeofencing.ts documents) — a trip completing while a
  // SIBLING trip's geofence is still active just leaves this one's region
  // registered until the whole task is next re-armed; alreadyAdvanced
  // being cleared above means it won't double-fire, it just won't be
  // actively watched for either, which is fine since the trip is done.
}
