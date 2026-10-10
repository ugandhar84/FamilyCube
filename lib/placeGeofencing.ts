/**
 * placeGeofencing — family Places (Home, schools, workplaces, other) as native
 * geofences. Entering/leaving a place checks THIS device's member in/out through
 * the record_place_event RPC, which updates their status ("At School") and logs it.
 *
 * Separate expo-location geofencing task from storeGeofencing.ts (grocery
 * proximity). The task is defined at module load (imported from app/_layout.tsx)
 * so the OS can wake a killed app and still deliver enter/exit events; the
 * member id is persisted because a headless task can't read store state.
 *
 * iOS monitors at most 20 regions per app across all tasks, so places are capped
 * (Home first) to leave room for the grocery store geofences.
 */
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, withSuppressedNetworkBanner } from './supabase';

export const PLACE_GEOFENCE_TASK = 'family-cube-place-geofence';
const MEMBER_KEY = '@familycube_place_geofence_member_v1';
const MAX_PLACE_REGIONS = 12;

export interface GeofencePlace {
  id: string; kind: string; latitude: number; longitude: number; radiusM: number; memberIds: string[];
}

type TaskManagerAPI = typeof import('expo-task-manager');
let _tm: TaskManagerAPI | null | undefined;
function getTaskManager(): TaskManagerAPI | null {
  if (_tm !== undefined) return _tm;
  if (!requireOptionalNativeModule('ExpoTaskManager')) { _tm = null; return null; }
  try { _tm = require('expo-task-manager') as TaskManagerAPI; } catch { _tm = null; }
  return _tm;
}

function ensureTaskDefined(tm: TaskManagerAPI) {
  if (tm.isTaskDefined(PLACE_GEOFENCE_TASK)) return;
  tm.defineTask(PLACE_GEOFENCE_TASK, async ({ data, error }) => {
    if (error) { console.warn('[placeGeofencing] task error:', error.message); return; }
    const { eventType, region } = (data as { eventType: number; region: Location.LocationRegion }) ?? {};
    if (!region?.identifier) return;
    const memberId = await AsyncStorage.getItem(MEMBER_KEY).catch(() => null);
    if (!memberId) return;
    const event = eventType === Location.GeofencingEventType.Enter ? 'enter' : 'exit';
    try {
      // Headless transport hiccups are normal here — don't feed the app-wide offline banner.
      await withSuppressedNetworkBanner(async () => {
        const { error: rpcErr } = await supabase.rpc('record_place_event', {
          p_member_id: memberId, p_place_id: region.identifier, p_event: event,
        });
        if (rpcErr) console.warn('[placeGeofencing] record_place_event failed', rpcErr.message);
      });
    } catch (e) {
      console.warn('[placeGeofencing] enter/exit handler failed', e);
    }
  });
}

// Define at import time so a cold-start geofence wake finds the task.
const _boot = getTaskManager();
if (_boot) ensureTaskDefined(_boot);

export function isPlaceGeofencingSupported(): boolean {
  return getTaskManager() !== null;
}

/** Background ("Always") permission already granted — never prompts. */
export async function hasPlaceGeofencePermission(): Promise<boolean> {
  try {
    const bg = await Location.getBackgroundPermissionsAsync();
    return bg.status === 'granted';
  } catch { return false; }
}

/** Asks for the permissions geofencing needs (call from a user action, not at launch). */
export async function requestPlaceGeofencePermission(): Promise<boolean> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;
    const bg = await Location.requestBackgroundPermissionsAsync();
    return bg.status === 'granted';
  } catch { return false; }
}

/**
 * Replaces this device's place geofences. Only places that apply to `memberId`
 * (no assignment = everyone, or the member is listed) are registered. A no-op
 * until background permission has been granted.
 */
export async function syncPlaceGeofences(places: GeofencePlace[], memberId: string): Promise<void> {
  const tm = getTaskManager();
  if (!tm) return;
  ensureTaskDefined(tm);

  const mine = places
    .filter(p => p.memberIds.length === 0 || p.memberIds.includes(memberId))
    .sort((a, b) => (a.kind === 'home' ? -1 : 0) - (b.kind === 'home' ? -1 : 0))
    .slice(0, MAX_PLACE_REGIONS);

  if (mine.length === 0) { await stopPlaceGeofences(); return; }
  if (!(await hasPlaceGeofencePermission())) return;

  await AsyncStorage.setItem(MEMBER_KEY, memberId).catch(() => {});
  await Location.startGeofencingAsync(PLACE_GEOFENCE_TASK, mine.map(p => ({
    identifier: p.id, latitude: p.latitude, longitude: p.longitude, radius: p.radiusM,
    notifyOnEnter: true, notifyOnExit: true,
  })));
}

export async function stopPlaceGeofences(): Promise<void> {
  if (!getTaskManager()) return;
  const started = await Location.hasStartedGeofencingAsync(PLACE_GEOFENCE_TASK).catch(() => false);
  if (started) await Location.stopGeofencingAsync(PLACE_GEOFENCE_TASK);
}
