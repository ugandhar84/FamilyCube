/**
 * motionTracking — real driving/crash detection via CoreMotion (see
 * modules/core-motion). Escalates the original speed-only heuristic in
 * lib/locationTracking.ts's handleDrivingTrip, without replacing it: this
 * file's whole design is additive/best-effort, and every entry point here
 * degrades gracefully to "do nothing, let the speed heuristic run" if
 * CoreMotion is unavailable (Simulator, old hardware, permission denied,
 * or this module simply failing to load on a given build).
 *
 * Kept as a SIBLING to locationTracking.ts, not folded into it — different
 * native subsystem (CoreMotion vs CoreLocation), different lifecycle
 * (activity monitoring only matters DURING active tracking, whereas
 * location fixes drive everything). See lib/locationTracking.ts's own
 * setMotionClassification/recordHardBrakeOnActiveTrip/evaluateCrashSignal
 * exports — this file calls INTO that file, not the reverse, avoiding a
 * circular import (locationTracking.ts only reads a module-level flag this
 * file sets, never imports this file directly).
 *
 * CRITICAL LIMITATION, documented here and in CoreMotionModule.swift: real
 * -time detection only works while this JS process is actually running —
 * either foregrounded, or headless-relaunched via the EXISTING location
 * background task (lib/locationTracking.ts's LOCATION_TASK_NAME). CoreMotion
 * itself has no relaunch-on-terminate capability, unlike CoreLocation's
 * significant-location-change API. queryHistoricalReconciliation below is
 * the deliberate fallback for whatever happened while this JS process
 * was not running at all.
 */
import {
  isActivityAvailable, startActivityMonitoring, stopActivityMonitoring,
  startAccelerometerSampling, stopAccelerometerSampling,
  onActivityUpdate, onAccelerometerData, queryHistoricalActivity,
  type ActivityUpdate,
} from 'core-motion';
import { setMotionClassification, recordHardBrakeOnActiveTrip, evaluateCrashSignal } from './locationTracking';
import { supabase } from './supabase';

// Only trust automotive classification at HIGH confidence — a lower
// confidence reading is exactly the "smooth train, fast walking" ambiguity
// this whole escalation exists to resolve (see CoreMotionModule.swift's
// own comment: Apple's classifier itself doesn't distinguish a driver from
// a passenger, and low/medium confidence readings are where that
// ambiguity actually shows up in practice).
function isConfidentlyAutomotive(update: ActivityUpdate): boolean {
  return update.automotive && update.confidence === 'high';
}

let accelerometerSamplingActive = false;
let currentMemberId: string | null = null;
let stopActivitySub: (() => void) | null = null;
let stopAccelSub: (() => void) | null = null;

/**
 * Starts CoreMotion activity monitoring for the given member — mirrors
 * startBackgroundLocationTracking's own on/off lifecycle exactly (same
 * "Share My Location" toggle in GpsTab.tsx drives both), so there's no
 * separate UI control for this. No-ops entirely if CoreMotion isn't
 * available on this device (Simulator, very old hardware) — the speed-only
 * heuristic in lib/locationTracking.ts keeps working unmodified either way.
 */
export async function startMotionTracking(memberId: string): Promise<void> {
  currentMemberId = memberId;
  if (!isActivityAvailable()) {
    setMotionClassification(null);
    return;
  }
  stopActivitySub?.();
  stopActivitySub = onActivityUpdate((update) => {
    const automotive = isConfidentlyAutomotive(update);
    setMotionClassification(automotive);

    if (automotive && !accelerometerSamplingActive) {
      accelerometerSamplingActive = true;
      startAccelerometerSampling();
      stopAccelSub?.();
      stopAccelSub = onAccelerometerData((sample) => {
        if (!currentMemberId) return;
        if (sample.magnitude >= HARD_BRAKE_GFORCE_THRESHOLD) {
          recordHardBrakeOnActiveTrip().catch(() => {});
        }
        if (sample.magnitude >= CRASH_GFORCE_THRESHOLD_JS) {
          evaluateCrashSignal(currentMemberId, sample.magnitude).catch(() => {});
        }
      });
    } else if (!automotive && accelerometerSamplingActive) {
      accelerometerSamplingActive = false;
      stopAccelerometerSampling();
      stopAccelSub?.();
      stopAccelSub = null;
    }
  });
  await startActivityMonitoring();
}

export async function stopMotionTracking(): Promise<void> {
  currentMemberId = null;
  setMotionClassification(null);
  stopActivitySub?.();
  stopActivitySub = null;
  stopAccelSub?.();
  stopAccelSub = null;
  if (accelerometerSamplingActive) {
    accelerometerSamplingActive = false;
    await stopAccelerometerSampling();
  }
  await stopActivityMonitoring();
}

// Mirrors the constants in lib/locationTracking.ts — kept as separate
// constants here (not exported/shared) since they gate a different
// signal (raw accelerometer magnitude) evaluated in a different file;
// duplicating two numbers is simpler than threading a cross-file shared
// constants module for this.
const HARD_BRAKE_GFORCE_THRESHOLD = 2.5;
const CRASH_GFORCE_THRESHOLD_JS = 4.0;

const LAST_RECONCILED_KEY = 'familycube_motion_last_reconciled_at';

/**
 * Historical reconciliation — the fallback for whatever driving happened
 * while this JS process was not running at all (CoreMotion cannot wake a
 * killed app; see this file's header comment and CoreMotionModule.swift's
 * own). Call on every real app foreground/launch. De-dupes against trips
 * the speed heuristic may have already logged via the location task's own
 * headless relaunches during the same window, by skipping any historical
 * segment that overlaps an existing trip's time range for this member.
 */
export async function reconcileHistoricalDriving(memberId: string, familyId: string): Promise<void> {
  if (!isActivityAvailable()) return;
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const lastReconciledRaw = await AsyncStorage.getItem(LAST_RECONCILED_KEY);
    const from = lastReconciledRaw ? new Date(lastReconciledRaw) : new Date(Date.now() - 6 * 60 * 60_000);
    const to = new Date();

    const segments = await queryHistoricalActivity(from, to);
    const automotiveSegments = segments
      .filter(isConfidentlyAutomotive)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (automotiveSegments.length === 0) {
      await AsyncStorage.setItem(LAST_RECONCILED_KEY, to.toISOString());
      return;
    }

    // Self-review correction: CMMotionActivity readings are individual
    // POINT transitions (each has only a start timestamp, no end) — a
    // single real drive can produce several .automotive readings as
    // confidence re-evaluates along the way. Merge consecutive readings
    // less than 10 min apart into one trip span BEFORE inserting, so one
    // real drive doesn't become several duplicate driving_trips rows.
    // Mirrors TRIP_GAP_TIMEOUT_MS's own 10-min "still the same trip" gap
    // tolerance in lib/locationTracking.ts.
    const MERGE_GAP_MS = 10 * 60_000;
    const mergedSpans: { start: number; end: number }[] = [];
    for (const seg of automotiveSegments) {
      const t = seg.timestamp * 1000;
      const last = mergedSpans[mergedSpans.length - 1];
      if (last && t - last.end < MERGE_GAP_MS) {
        last.end = t;
      } else {
        mergedSpans.push({ start: t, end: t });
      }
    }

    // De-dup: fetch this member's trips that already overlap the queried
    // window (the location task's own headless relaunches may have
    // already logged some of this via the speed heuristic) — skip
    // creating a duplicate for any span inside an existing trip's range.
    const { data: existingTrips } = await supabase.from('driving_trips')
      .select('started_at, ended_at')
      .eq('member_id', memberId)
      .gte('started_at', from.toISOString());

    for (const span of mergedSpans) {
      const overlaps = (existingTrips ?? []).some(t => {
        const tStart = new Date(t.started_at).getTime();
        const tEnd = t.ended_at ? new Date(t.ended_at).getTime() : Date.now();
        return span.start <= tEnd && span.end >= tStart;
      });
      if (overlaps) continue;
      // Historical spans have no distance/max-speed data (CoreMotion's
      // activity log doesn't carry that) — logged as a real trip record
      // regardless, since "a drive happened here" is still meaningful
      // even without those stats; report UI shows them distinctly via
      // detection_method.
      await supabase.from('driving_trips').insert({
        member_id: memberId, family_id: familyId,
        started_at: new Date(span.start).toISOString(),
        ended_at: new Date(span.end).toISOString(),
        detection_method: 'motion_classifier',
      });
    }

    await AsyncStorage.setItem(LAST_RECONCILED_KEY, to.toISOString());
  } catch (e: any) {
    console.warn('[motionTracking] reconcileHistoricalDriving failed:', e?.message);
  }
}
