import { requireNativeModule } from 'expo-modules-core';

// CMMotionActivityConfidence's own raw values (0-3) — see
// CoreMotionModule.swift's own comment on why this is translated here
// instead of re-declared on both the Swift and JS sides independently.
export type ActivityConfidence = 'unknown' | 'low' | 'medium' | 'high';
const CONFIDENCE_BY_RAW: Record<number, ActivityConfidence> = {
  0: 'unknown', 1: 'low', 2: 'medium', 3: 'high',
};

export interface ActivityUpdate {
  automotive: boolean;
  walking: boolean;
  running: boolean;
  cycling: boolean;
  stationary: boolean;
  unknown: boolean;
  confidence: ActivityConfidence;
  timestamp: number;
}

export interface AccelerometerSample {
  /** G-force magnitude, sqrt(x²+y²+z²) — 1.0 at rest (gravity alone). */
  magnitude: number;
  timestamp: number;
}

let _mod: any = null;
let _loggedModuleWarning = false;
function mod() {
  if (!_mod) {
    try { _mod = requireNativeModule('CoreMotion'); } catch (e) {
      _mod = null;
      if (!_loggedModuleWarning) {
        _loggedModuleWarning = true;
        console.error('[core-motion] ⚠️ Native module "CoreMotion" not available:', (e as any)?.message);
      }
    }
  }
  return _mod;
}

/** False on the Simulator (no real motion coprocessor) or pre-M-series hardware — callers should fall back to the speed-only heuristic rather than assume this is always true. */
export function isActivityAvailable(): boolean {
  const m = mod();
  if (!m) return false;
  try { return !!m.isActivityAvailable(); } catch { return false; }
}

function toActivityUpdate(raw: any): ActivityUpdate {
  return {
    automotive: !!raw.automotive, walking: !!raw.walking, running: !!raw.running,
    cycling: !!raw.cycling, stationary: !!raw.stationary, unknown: !!raw.unknown,
    confidence: CONFIDENCE_BY_RAW[raw.confidence] ?? 'unknown',
    timestamp: raw.timestamp,
  };
}

export async function startActivityMonitoring(): Promise<void> {
  const m = mod();
  if (!m) return;
  try { await m.startActivityMonitoring(); } catch (e: any) {
    console.error('[core-motion] startActivityMonitoring failed:', e?.message);
  }
}

export async function stopActivityMonitoring(): Promise<void> {
  const m = mod();
  if (!m) return;
  try { await m.stopActivityMonitoring(); } catch { /* best-effort */ }
}

export async function startAccelerometerSampling(): Promise<void> {
  const m = mod();
  if (!m) return;
  try { await m.startAccelerometerSampling(); } catch (e: any) {
    console.error('[core-motion] startAccelerometerSampling failed:', e?.message);
  }
}

export async function stopAccelerometerSampling(): Promise<void> {
  const m = mod();
  if (!m) return;
  try { await m.stopAccelerometerSampling(); } catch { /* best-effort */ }
}

/** Reconstructs activity segments from before this app was (re)launched — the only way to learn what happened while fully killed, since live delivery can't reach that state (see CoreMotionModule.swift's header comment). */
export async function queryHistoricalActivity(from: Date, to: Date): Promise<ActivityUpdate[]> {
  const m = mod();
  if (!m) return [];
  try {
    const raw = await m.queryHistoricalActivity(from.getTime(), to.getTime());
    return (raw ?? []).map(toActivityUpdate);
  } catch (e: any) {
    console.error('[core-motion] queryHistoricalActivity failed:', e?.message);
    return [];
  }
}

let activitySubscription: { remove: () => void } | null = null;
export function onActivityUpdate(callback: (update: ActivityUpdate) => void): () => void {
  const m = mod();
  if (!m) return () => {};
  activitySubscription?.remove();
  activitySubscription = m.addListener('onActivityUpdate', (raw: any) => callback(toActivityUpdate(raw)));
  return () => { activitySubscription?.remove(); activitySubscription = null; };
}

let accelerometerSubscription: { remove: () => void } | null = null;
export function onAccelerometerData(callback: (sample: AccelerometerSample) => void): () => void {
  const m = mod();
  if (!m) return () => {};
  accelerometerSubscription?.remove();
  accelerometerSubscription = m.addListener('onAccelerometerData', (raw: any) => callback({ magnitude: raw.magnitude, timestamp: raw.timestamp }));
  return () => { accelerometerSubscription?.remove(); accelerometerSubscription = null; };
}
