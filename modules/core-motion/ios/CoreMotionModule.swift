import ExpoModulesCore
import CoreMotion

// Bridges Apple's CoreMotion framework for real driving/crash detection —
// see lib/motionTracking.ts for the JS-side orchestration and the plan's
// own rationale (this was a deliberate escalation from a speed-only
// heuristic; expo-sensors was confirmed a non-starter since its
// Accelerometer/DeviceMotion wrappers are foreground-only).
//
// Two distinct CoreMotion subsystems, kept in ONE module (not split) since
// they share a single lifecycle from the JS side's point of view:
//
// 1. CMMotionActivityManager — Apple's own trained activity classifier
//    (automotive/walking/running/stationary/cycling + confidence). Runs on
//    the motion coprocessor, near-zero battery cost, always safe to leave
//    running for as long as location-sharing is on. THIS is what answers
//    "is this actually driving, not walking fast or a train passenger" —
//    no custom ML needed, Apple already solved it.
//
// 2. CMMotionManager — raw accelerometer, real battery cost. Deliberately
//    NOT auto-started by this module; the JS orchestration layer only
//    calls startAccelerometerSampling while activity monitoring has
//    already reported .automotive, so the expensive sampling is scoped to
//    actual drive time, not run continuously. This module stays a "dumb
//    sensor bridge" — it does not itself decide when to sample, keeping
//    the actual driving/crash decision logic in one place (JS), not
//    split across Swift and JS.
//
// CRITICAL LIMITATION (documented here so it isn't lost on the next
// person reading this file): CoreMotion has NO relaunch-on-terminate
// capability, unlike CoreLocation's significant-location-change API (see
// lib/locationTracking.ts's own header comment on how THAT relaunch
// works). CMMotionActivityManager only delivers live callbacks while this
// process is already resident — it cannot wake a fully-killed app. Its
// only "what happened while dead" capability is queryHistoricalActivity
// below, which reconstructs past segments after the fact, not a live
// alert. Real-time detection here only works while the app is at least
// headless-relaunched via the EXISTING location task, or foregrounded.
public class CoreMotionModule: Module {
  private let activityManager = CMMotionActivityManager()
  private let motionManager = CMMotionManager()
  private var isActivityMonitoring = false
  private var isAccelerometerSampling = false

  public func definition() -> ModuleDefinition {
    Name("CoreMotion")

    Events("onActivityUpdate", "onAccelerometerData")

    // Sync check — the JS orchestration layer (lib/motionTracking.ts)
    // falls back entirely to the old speed-only heuristic if this is
    // false (simulator has no real motion coprocessor; very old hardware
    // predating the M-series coprocessor also reports false here), so the
    // feature degrades gracefully rather than silently doing nothing.
    Function("isActivityAvailable") { () -> Bool in
      CMMotionActivityManager.isActivityAvailable()
    }

    AsyncFunction("startActivityMonitoring") { () in
      guard CMMotionActivityManager.isActivityAvailable() else { return }
      guard !self.isActivityMonitoring else { return }
      self.isActivityMonitoring = true
      self.activityManager.startActivityUpdates(to: .main) { activity in
        guard let activity = activity else { return }
        self.sendEvent("onActivityUpdate", [
          "automotive": activity.automotive,
          "walking": activity.walking,
          "running": activity.running,
          "cycling": activity.cycling,
          "stationary": activity.stationary,
          "unknown": activity.unknown,
          // 0 = unknown, 1 = low, 2 = medium, 3 = high — mirrors
          // CMMotionActivityConfidence's own raw values, translated in
          // src/index.ts rather than re-declaring the enum on both sides.
          "confidence": activity.confidence.rawValue,
          "timestamp": activity.timestamp,
        ])
      }
    }

    AsyncFunction("stopActivityMonitoring") { () in
      guard self.isActivityMonitoring else { return }
      self.isActivityMonitoring = false
      self.activityManager.stopActivityUpdates()
    }

    // Gated by the JS side to only run while activity monitoring already
    // reports .automotive — see this file's own header comment. 20Hz is
    // fast enough to catch a real hard-brake/crash G-force spike (which
    // happens over a fraction of a second) without being needlessly
    // wasteful; a real crash-detection app would tune this further with
    // on-device testing, not a first-pass constant.
    AsyncFunction("startAccelerometerSampling") { () in
      guard self.motionManager.isAccelerometerAvailable else { return }
      guard !self.isAccelerometerSampling else { return }
      self.isAccelerometerSampling = true
      self.motionManager.accelerometerUpdateInterval = 1.0 / 20.0
      self.motionManager.startAccelerometerUpdates(to: .main) { data, _ in
        guard let data = data else { return }
        let g = sqrt(
          data.acceleration.x * data.acceleration.x +
          data.acceleration.y * data.acceleration.y +
          data.acceleration.z * data.acceleration.z
        )
        self.sendEvent("onAccelerometerData", [
          "magnitude": g,
          "timestamp": data.timestamp,
        ])
      }
    }

    AsyncFunction("stopAccelerometerSampling") { () in
      guard self.isAccelerometerSampling else { return }
      self.isAccelerometerSampling = false
      self.motionManager.stopAccelerometerUpdates()
    }

    // Historical reconciliation — the only way to learn what happened
    // while the app was fully killed (see this file's header comment on
    // why live delivery can't reach that state). Called from JS on every
    // real app foreground/launch (app/_layout.tsx). CoreMotion's own
    // on-device activity log (coreduetd) is populated continuously by the
    // OS regardless of this app's own state, so this can retroactively
    // see activity from before this app was ever relaunched.
    AsyncFunction("queryHistoricalActivity") { (fromMs: Double, toMs: Double, promise: Promise) in
      guard CMMotionActivityManager.isActivityAvailable() else {
        promise.resolve([])
        return
      }
      let from = Date(timeIntervalSince1970: fromMs / 1000)
      let to = Date(timeIntervalSince1970: toMs / 1000)
      self.activityManager.queryActivityStarting(from: from, to: to, to: .main) { activities, error in
        if error != nil {
          promise.resolve([])
          return
        }
        let result = (activities ?? []).map { activity -> [String: Any] in
          [
            "automotive": activity.automotive,
            "walking": activity.walking,
            "running": activity.running,
            "cycling": activity.cycling,
            "stationary": activity.stationary,
            "confidence": activity.confidence.rawValue,
            "timestamp": activity.timestamp,
          ]
        }
        promise.resolve(result)
      }
    }
  }
}
