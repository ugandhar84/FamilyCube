package com.familycube.coremotion

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityRecognitionClient
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Intent
import android.content.IntentFilter
import kotlin.math.sqrt

/**
 * Android counterpart to CoreMotionModule.swift — same JS-facing event
 * names/payload shapes (onActivityUpdate, onAccelerometerData) so
 * lib/motionTracking.ts and modules/core-motion/src/index.ts need zero
 * changes; Expo's module system resolves whichever platform implementation
 * is linked automatically. iOS's own CoreMotionModule.swift is completely
 * untouched by this file.
 *
 * Two distinct Android subsystems, mirroring the iOS module's own two
 * CoreMotion subsystems combined in one module for the same reason (shared
 * lifecycle from JS's point of view):
 *
 * 1. ActivityRecognitionClient — Google Play Services' trained activity
 *    classifier (IN_VEHICLE/ON_FOOT/RUNNING/ON_BICYCLE/STILL + confidence),
 *    the direct counterpart to CMMotionActivityManager. Requires the
 *    runtime ACTIVITY_RECOGNITION permission (Android 10+) and delivers
 *    updates via a registered PendingIntent/BroadcastReceiver — unlike
 *    iOS's CMMotionActivityManager, this CAN wake the app via a real
 *    Android broadcast even when not foregrounded, a genuine advantage
 *    over the iOS limitation documented in CoreMotionModule.swift's header
 *    (no live delivery while killed) — not yet exploited beyond receiving
 *    while this module's process is alive, since the broader relaunch
 *    plumbing lives in lib/locationTracking.ts's existing background task,
 *    not duplicated here.
 *
 * 2. SensorManager + TYPE_ACCELEROMETER — raw accelerometer, real battery
 *    cost, counterpart to CMMotionManager. Deliberately NOT auto-started;
 *    gated by the same JS orchestration layer that only starts sampling
 *    once activity monitoring already reports automotive=true, exactly
 *    matching the iOS module's own design (see its header comment) — this
 *    stays a "dumb sensor bridge," decision logic lives in JS only.
 */
class CoreMotionModule : Module() {
  private var activityClient: ActivityRecognitionClient? = null
  private var isActivityMonitoring = false
  private var isAccelerometerSampling = false
  private var pendingIntent: PendingIntent? = null
  private var receiver: BroadcastReceiver? = null

  private var sensorManager: SensorManager? = null
  private var accelerometer: Sensor? = null
  private var sensorListener: SensorEventListener? = null

  private val context: Context
    get() = appContext.reactContext ?: appContext.throwingActivity.applicationContext

  override fun definition() = ModuleDefinition {
    Name("CoreMotion")

    Events("onActivityUpdate", "onAccelerometerData")

    // Sync check — JS orchestration falls back to the speed-only heuristic
    // if this is false. Google Play Services' activity recognition is
    // available on effectively all modern Android devices with Play
    // Services installed; this mirrors CMMotionActivityManager.isActivityAvailable()'s
    // role rather than iOS's specific hardware-coprocessor gate.
    Function("isActivityAvailable") {
      try {
        com.google.android.gms.common.GoogleApiAvailability.getInstance()
          .isGooglePlayServicesAvailable(context) == com.google.android.gms.common.ConnectionResult.SUCCESS
      } catch (e: Exception) {
        false
      }
    }

    // Android 10+ requires this granted at runtime, not just declared in
    // the manifest (app.config.js's android.permissions array) — mirrors
    // how ACCESS_BACKGROUND_LOCATION needs its own runtime request on top
    // of the manifest declaration. No iOS equivalent: CMMotionActivityManager
    // uses the older Info.plist-usage-description-only permission model.
    Function("isActivityPermissionGranted") {
      ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) ==
        PackageManager.PERMISSION_GRANTED
    }

    AsyncFunction("startActivityMonitoring") {
      if (isActivityMonitoring) return@AsyncFunction Unit
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) !=
        PackageManager.PERMISSION_GRANTED) {
        return@AsyncFunction Unit
      }
      val client = ActivityRecognition.getClient(context)
      activityClient = client

      val transitions = mutableListOf<ActivityTransition>()
      val types = listOf(
        DetectedActivity.IN_VEHICLE,
        DetectedActivity.ON_FOOT,
        DetectedActivity.WALKING,
        DetectedActivity.RUNNING,
        DetectedActivity.ON_BICYCLE,
        DetectedActivity.STILL,
      )
      for (type in types) {
        transitions.add(ActivityTransition.Builder().setActivityType(type)
          .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER).build())
      }
      val request = ActivityTransitionRequest(transitions)

      val intent = Intent(ACTION_ACTIVITY_UPDATE).setPackage(context.packageName)
      val pi = PendingIntent.getBroadcast(
        context, 0, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
      )
      pendingIntent = pi

      val br = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
          if (!ActivityTransitionResult.hasResult(intent)) return
          val result = ActivityTransitionResult.extractResult(intent) ?: return
          for (event in result.transitionEvents) {
            emitFromTransition(event.activityType)
          }
        }
      }
      receiver = br
      context.registerReceiver(br, IntentFilter(ACTION_ACTIVITY_UPDATE), Context.RECEIVER_NOT_EXPORTED)

      client.requestActivityTransitionUpdates(request, pi)
      isActivityMonitoring = true
      Unit
    }

    AsyncFunction("stopActivityMonitoring") {
      if (!isActivityMonitoring) return@AsyncFunction Unit
      isActivityMonitoring = false
      pendingIntent?.let { activityClient?.removeActivityTransitionUpdates(it) }
      receiver?.let { try { context.unregisterReceiver(it) } catch (e: Exception) { /* already gone */ } }
      receiver = null
      pendingIntent = null
    }

    // Gated by the JS side to only run once activity monitoring already
    // reports automotive — same design as CoreMotionModule.swift. SENSOR_DELAY_GAME
    // (~20Hz) matches the iOS module's 1/20s update interval.
    AsyncFunction("startAccelerometerSampling") {
      if (isAccelerometerSampling) return@AsyncFunction Unit
      val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return@AsyncFunction Unit
      val sensor = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return@AsyncFunction Unit
      sensorManager = sm
      accelerometer = sensor

      val listener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
          val g = sqrt(
            (event.values[0] * event.values[0] +
              event.values[1] * event.values[1] +
              event.values[2] * event.values[2]).toDouble()
          ) / SensorManager.GRAVITY_EARTH
          sendEvent("onAccelerometerData", mapOf(
            "magnitude" to g,
            "timestamp" to (event.timestamp / 1_000_000_000.0)
          ))
        }
        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
      }
      sensorListener = listener
      sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_GAME)
      isAccelerometerSampling = true
      Unit
    }

    AsyncFunction("stopAccelerometerSampling") {
      if (!isAccelerometerSampling) return@AsyncFunction Unit
      isAccelerometerSampling = false
      sensorListener?.let { sensorManager?.unregisterListener(it) }
      sensorListener = null
    }

    // No historical-reconciliation equivalent — ActivityRecognitionApi has
    // no on-device activity log query API like CMMotionActivityManager's
    // queryActivityStarting(from:to:). Android's real advantage here is the
    // opposite direction: the PendingIntent/BroadcastReceiver above CAN
    // wake this app for live delivery even when not foregrounded (unlike
    // iOS's CMMotionActivityManager, which cannot wake a killed app at
    // all) — so there is less need for historical reconciliation in the
    // first place. Resolves empty to keep the shared JS API's shape
    // identical across platforms.
    AsyncFunction("queryHistoricalActivity") { _: Double, _: Double ->
      emptyList<Map<String, Any>>()
    }
  }

  private fun emitFromTransition(activityType: Int) {
    val payload = mapOf(
      "automotive" to (activityType == DetectedActivity.IN_VEHICLE),
      "walking" to (activityType == DetectedActivity.WALKING || activityType == DetectedActivity.ON_FOOT),
      "running" to (activityType == DetectedActivity.RUNNING),
      "cycling" to (activityType == DetectedActivity.ON_BICYCLE),
      "stationary" to (activityType == DetectedActivity.STILL),
      "unknown" to (activityType == DetectedActivity.UNKNOWN || activityType == DetectedActivity.TILTING),
      // ActivityRecognitionApi's ActivityTransitionEvent carries no
      // per-event confidence score (unlike DetectedActivity.getConfidence(),
      // which only exists on the older polling API) — reported as "high"
      // since a transition event only fires once Play Services' own
      // internal confidence threshold is crossed, conceptually closest to
      // CMMotionActivityConfidence.high (3) on the iOS side.
      "confidence" to 3,
      "timestamp" to (System.currentTimeMillis() / 1000.0)
    )
    sendEvent("onActivityUpdate", payload)
  }

  companion object {
    private const val ACTION_ACTIVITY_UPDATE = "com.familycube.android.ACTIVITY_TRANSITION_UPDATE"
  }
}
