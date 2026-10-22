/**
 * locationPower — decides how hard the phone's GPS should work, the way Life360 does: almost nothing while someone is
 * stationary, steady tracking while they walk, tighter while they drive, a short burst when a family member is actively
 * looking at the map, and a gentle saver mode when the battery is low. Pure logic (no native imports) so it can be tested.
 *
 * Why each mode exists:
 *  stationary  Someone sitting at home/school needs no GPS stream. Balanced accuracy, a 100 m gate and a 10 minute timer,
 *              and iOS is allowed to pause updates until the phone really moves (the biggest battery saving).
 *  walking     A 20 m / 45 s cadence is enough to show a believable walking dot.
 *  driving     Tighter (40 m / 15 s) so a drive, speeding and crash signals stay accurate. Safety wins over battery.
 *  live        Someone has the Find Family map open (or just asked for this phone's location): 8 m / 5 s for 2 minutes at a
 *              time, then it falls back by itself.
 *  saver       Battery under 15% (not charging) or iOS Low Power Mode: walking and stationary both relax; driving does not.
 */
export type PowerMode = 'stationary' | 'walking' | 'driving' | 'live' | 'saver';

export interface PowerConfig {
  accuracy: 'balanced' | 'high';
  timeInterval: number;
  distanceInterval: number;
  activity: 'other' | 'fitness' | 'automotive';
  pauses: boolean;
}

export const POWER_CONFIG: Record<PowerMode, PowerConfig> = {
  stationary: { accuracy: 'balanced', timeInterval: 10 * 60_000, distanceInterval: 100, activity: 'other',      pauses: false },
  saver:      { accuracy: 'balanced', timeInterval: 15 * 60_000, distanceInterval: 200, activity: 'other',      pauses: false },
  walking:    { accuracy: 'high',     timeInterval: 45_000,      distanceInterval: 20,  activity: 'fitness',    pauses: false },
  driving:    { accuracy: 'high',     timeInterval: 15_000,      distanceInterval: 40,  activity: 'automotive', pauses: false },
  live:       { accuracy: 'high',     timeInterval: 5_000,       distanceInterval: 8,   activity: 'other',      pauses: false },
};

/** A drive that pauses at a light or a walk that stops for a moment must not flip the mode back and forth. */
export const KEEP_DRIVING_MS = 150_000;
export const KEEP_WALKING_MS = 90_000;
export const LIVE_WINDOW_MS = 120_000;
const DRIVING_MPH = 8;
const WALKING_MPH = 1.5;
const SAVER_BATTERY = 15;
const LIVE_MIN_BATTERY = 8;

export interface PowerState {
  mode: PowerMode;
  lastDrivingAt: number;
  lastWalkingAt: number;
  liveUntil: number;
}

export function initialPowerState(): PowerState {
  return { mode: 'stationary', lastDrivingAt: 0, lastWalkingAt: 0, liveUntil: 0 };
}

export interface PowerInput {
  now: number;
  speedMph: number;
  /** A real motion-sensor reading says "in a vehicle" (more reliable than speed alone at low speed). */
  automotive?: boolean | null;
  batteryLevel: number | null;
  isCharging: boolean | null;
  lowPowerMode?: boolean | null;
}

/** Returns the next state. The caller restarts the native task only when `mode` changed. */
export function nextPowerState(prev: PowerState, input: PowerInput): PowerState {
  const s: PowerState = { ...prev };
  const { now, speedMph } = input;
  if (input.automotive === true || speedMph >= DRIVING_MPH) s.lastDrivingAt = now;
  else if (speedMph >= WALKING_MPH) s.lastWalkingAt = now;

  const lowBattery = input.batteryLevel != null && input.batteryLevel < SAVER_BATTERY && !input.isCharging;
  const critical = input.batteryLevel != null && input.batteryLevel < LIVE_MIN_BATTERY && !input.isCharging;
  const saver = lowBattery || !!input.lowPowerMode;

  const driving = now - s.lastDrivingAt < KEEP_DRIVING_MS;
  const walking = now - s.lastWalkingAt < KEEP_WALKING_MS;
  if (driving) s.mode = 'driving';
  else if (s.liveUntil > now && !critical) s.mode = 'live';
  else if (walking && !saver) s.mode = 'walking';
  else s.mode = saver ? 'saver' : 'stationary';
  return s;
}

/** Someone opened the map or tapped refresh: go live for a short window. */
export function enterLive(prev: PowerState, now: number): PowerState {
  return { ...prev, liveUntil: Math.max(prev.liveUntil, now + LIVE_WINDOW_MS) };
}
