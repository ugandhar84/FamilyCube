const IS_EAS = !!process.env.EAS_BUILD;

/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: "FamilyCube",
  slug: "familycube",
  version: "1.0.0",
  // Base value only — the actual per-idiom split (phone portrait-only, iPad
  // all orientations) lives in ios.infoPlist below.
  orientation: "default",
  icon: "./assets/icon.png",
  scheme: ["familycube"],
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    resizeMode: "cover",
    backgroundColor: "#FAF8F4",
    image: "./assets/splash-gradient-light.png",
    dark: {
      image: "./assets/splash-gradient-dark.png",
      backgroundColor: "#0E0C13",
    },
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.familycube.ios",
    buildNumber: "90",
    appleTeamId: "X4VLLWF6Q3",
    usesAppleSignIn: true,
    googleServicesFile: process.env.GOOGLE_SERVICES_PLIST ?? "./GoogleService-Info.plist",
    entitlements: {
      "com.apple.security.application-groups": ["group.com.familycube.ios"],
    },
    splash: {
      image: "./assets/splash-gradient-light.png",
      resizeMode: "cover",
      backgroundColor: "#FAF8F4",
      dark: {
        image: "./assets/splash-gradient-dark.png",
        backgroundColor: "#0E0C13",
      },
    },
    icon: {
      light: "./assets/icon-light.png",
      dark: "./assets/icon-dark.png",
      tinted: "./assets/icon-dark.png",
    },
    infoPlist: {
      // Phones stay portrait-only (unchanged). iPads — including a wall-mounted
      // "kitchen hub" scenario — can rotate to landscape. iOS reads the
      // idiom-suffixed key for iPad and falls back to the base key for iPhone,
      // so these two keys are what actually split the behavior; the top-level
      // `orientation: "default"` above just tells Expo not to force both
      // idioms to the same single value.
      UISupportedInterfaceOrientations: ["UIInterfaceOrientationPortrait"],
      "UISupportedInterfaceOrientations~ipad": [
        "UIInterfaceOrientationPortrait",
        "UIInterfaceOrientationLandscapeLeft",
        "UIInterfaceOrientationLandscapeRight",
      ],
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: "Family Cube uses your camera for profile photos and task proof submissions.",
      NSPhotoLibraryUsageDescription: "Family Cube accesses your photos for profile pictures and task completion proof.",
      NSLocationWhenInUseUsageDescription: "Family Cube uses your location to show family members on the map and set up safe zones.",
      NSLocationAlwaysAndWhenInUseUsageDescription: "Family Cube uses your location in the background to keep your family updated on where you are, even when the app isn't open.",
      NSLocationAlwaysUsageDescription: "Family Cube uses your location in the background to keep your family updated on where you are, even when the app isn't open.",
      NSFaceIDUsageDescription: "Family Cube uses Face ID to sign you in quickly and securely.",
      // Required for the core-motion module's CMMotionActivityManager/
      // CMMotionManager use (real driving/crash detection, replacing the
      // old speed-only heuristic) — without this the CoreMotion API
      // throws/instantly denies rather than showing a prompt, same story
      // as every other usage-description key on this list.
      NSMotionUsageDescription: "Family Cube uses motion & fitness data to detect driving and possible accidents for family safety alerts.",
      // Was missing entirely — chat voice notes/dictation (expo-audio's
      // AudioModule.requestRecordingPermissionsAsync, ChatScreen.tsx) is a
      // real, live mic use with no NSMicrophoneUsageDescription string at
      // all, which Apple requires; without it the request throws/instantly
      // denies rather than showing a prompt.
      NSMicrophoneUsageDescription: "Family Cube uses your microphone for voice notes and voice-to-text in Chat.",
      NSPhotoLibraryAddUsageDescription: "Family Cube saves photos to your library.",
      NSCalendarsUsageDescription: "Family Cube adds family events to Calendar so you never miss them.",
      NSCalendarsFullAccessUsageDescription: "Family Cube adds family events to Calendar so you never miss them.",
      NSRemindersUsageDescription: "Family Cube may create reminders for family tasks and events.",
      NSRemindersFullAccessUsageDescription: "Family Cube may create reminders for family tasks and events.",
      BGTaskSchedulerPermittedIdentifiers: ["com.familycube.ios.widget-refresh"],
      // ios.backgroundModes (the "shorthand" top-level key) isn't actually
      // implemented by any config plugin in this SDK — it's silently
      // ignored, which left UIBackgroundModes missing "location" entirely
      // after prebuild even though the shorthand was set. Setting the real
      // Info.plist key directly here is what config-plugins actually reads.
      // "voip" wakes the app on a PushKit VoIP push (call-reminder-sweeper
      // edge function) so CallKeep can call reportNewIncomingCall() and show
      // the native ringing UI even when the app is backgrounded/killed.
      UIBackgroundModes: ["fetch", "location", "voip"],
    },
  },
  android: {
    // Android's manifest has no per-idiom orientation split like iOS's
    // ~ipad Info.plist keys, so this locks the default (phones) to portrait;
    // lib/useDeviceClass.ts unlocks landscape at runtime specifically for
    // tablet-class Android devices via expo-screen-orientation.
    orientation: "portrait",
    // Required for @react-native-firebase/messaging (Android call-reminder
    // wake path). Download from your Firebase project's Android app
    // settings and place at this path — the build fails without it once
    // Firebase is configured, but is otherwise absent until you create the
    // Firebase project.
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#FDFBF7",
    },
    package: "com.familycube.android",
    // react-native-maps needs the Android Maps SDK API key declared in the
    // manifest — iOS uses Apple Maps by default via the same library, so
    // this is purely additive, no iOS equivalent needed. Was missing
    // entirely — live-reported crash on the GPS/FindFam tab:
    // "java.lang.RuntimeException: API key not found." Reusing the same
    // key already in google-services.json (same Firebase/GCP project,
    // family-cube-8b803) rather than provisioning a second key — if this
    // key turns out to be restricted to Firebase-only APIs, the map will
    // still fail and a dedicated Maps SDK key needs enabling in Google
    // Cloud Console for this same project.
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? "AIzaSyA8o-nMZ7QqmiHN63UtKrqzQ7Sijr8RWLc",
      },
    },
    permissions: [
      "android.permission.CAMERA",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      // Was missing entirely — live-reported crash: "Could not update
      // location sharing... Something went wrong" on the FindFam/GPS tab.
      // expo-location's requestBackgroundPermissionsAsync (called from
      // lib/locationTracking.ts's startBackgroundLocationTracking, the
      // exact same call path already working on iOS) rejects outright on
      // Android 10+ without this declared — foreground-only
      // ACCESS_FINE_LOCATION/ACCESS_COARSE_LOCATION above aren't sufficient
      // for background tracking, a real Android-specific requirement iOS's
      // permission model doesn't have.
      "android.permission.ACCESS_BACKGROUND_LOCATION",
      "android.permission.USE_BIOMETRIC",
      "android.permission.USE_FINGERPRINT",
      "android.permission.VIBRATE",
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.READ_CALENDAR",
      "android.permission.WRITE_CALENDAR",
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VIDEO",
      "android.permission.READ_MEDIA_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS",
      // Lets the call-reminder ConnectionService UI pop over the lock
      // screen like a real incoming call, instead of just a tray notification.
      "android.permission.USE_FULL_SCREEN_INTENT",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_PHONE_CALL",
      // Android 14+ (API 34, this emulator's target) requires a specific
      // foreground-service TYPE permission on top of the generic
      // FOREGROUND_SERVICE above, or expo-location's startLocationUpdatesAsync
      // (with its foregroundService option — lib/locationTracking.ts's
      // background-tracking notification) rejects with "Foreground service
      // permissions were not found in the manifest," live-reproduced on
      // this same emulator right after the ACCESS_BACKGROUND_LOCATION fix
      // resolved the previous error at this same call site.
      "android.permission.FOREGROUND_SERVICE_LOCATION",
      "android.permission.BIND_TELECOM_CONNECTION_SERVICE",
      "android.permission.READ_PHONE_STATE",
      "android.permission.MANAGE_OWN_CALLS",
      // ActivityRecognitionApi (modules/core-motion/android's driving/
      // walking/stationary classifier, Android's counterpart to iOS's
      // CMMotionActivityManager) requires this runtime permission on
      // Android 10+ or requestActivityTransitionUpdates silently never
      // delivers any results.
      "android.permission.ACTIVITY_RECOGNITION",
    ],
  },
  web: {
    bundler: "metro",
    // Was "static" — makes Expo Router SSR-prerender every route to HTML
    // via expo-router/node/render.js on every `expo start`, which crashes
    // (Supabase's AsyncStorage-backed auth client touches `window` during
    // init, undefined in that Node SSR context) and takes down the whole
    // Metro process, not just the web target — killing the iOS dev session
    // too (live-reported: tapping Scan now on iOS appeared to break, but
    // the actual cause was this background web SSR crash landing moments
    // later and killing the shared dev server). This app is iOS-only (see
    // CLAUDE.md) and never ships to web; "single" (plain SPA bundle, no
    // SSR prerender step) avoids the crash entirely.
    output: "single",
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-font",
    "expo-asset",
    "expo-router",
    "expo-secure-store",
    "expo-local-authentication",
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission: "Family Cube uses your location to show family members on the map and set up safe zones.",
        locationWhenInUsePermission: "Family Cube uses your location to display your position on the family map.",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Family Cube accesses your photos for profile pictures and task proof.",
        cameraPermission: "Family Cube uses your camera for profile photos and task completion proof.",
      },
    ],
    [
      "expo-calendar",
      {
        calendarPermission: "Family Cube adds your family event to Calendar so you never miss it.",
        remindersPermission: "Family Cube may create reminders for family tasks and events.",
      },
    ],
    "@react-native-community/datetimepicker",
    "expo-video",
    "react-native-compressor",
    [
      "expo-media-library",
      {
        photosPermission: "Family Cube saves media you download to your photo library.",
        savePhotosPermission: "Family Cube saves media you download to your photo library.",
        isAccessMediaLocationEnabled: false,
      },
    ],
    [
      "expo-build-properties",
      {
        ios: {
          deploymentTarget: "17.0",
        },
        android: {
          enableMultiDex: true,
        },
      },
    ],
    "expo-audio",
    [
      "@react-native-voice/voice",
      {
        microphonePermission: "Family Cube uses your microphone for voice messages in family chat.",
        speechRecognitionPermission: "Family Cube uses speech recognition for voice messages.",
      },
    ],
    // Android-only real fix for @react-native-voice/voice resolving to null
    // under the New Architecture — see lib/voiceCompat.ts's header comment.
    // iOS keeps using @react-native-voice/voice unchanged (plugin above),
    // so this one is additive, not a replacement.
    [
      "expo-speech-recognition",
      {
        microphonePermission: "Family Cube uses your microphone for voice messages in family chat.",
        speechRecognitionPermission: "Family Cube uses speech recognition for voice messages.",
      },
    ],
    "expo-splash-screen",
    ["@bacons/apple-targets"],
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#CD7B57",
        androidMode: "default",
        androidCollapsedTitle: "Family Cube",
      },
    ],
    "expo-web-browser",
    "@react-native-firebase/app",
    "@react-native-firebase/messaging",
    "react-native-quick-crypto",
    "./plugins/withCallKeep.js",
    "./plugins/withCallKeepAndroid.js",
    "./plugins/withFirebasePodfileFixes.js",
    "./plugins/withFmtConstevalFix.js",
    "./plugins/withAndroidJetifier.js",
    "./plugins/withAndroidSpeechQueries.js",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: "6c9a2b2c-44d1-40cf-9310-5dc37687be14",
    },
    // eas build --local was silently dropping these two EXPO_PUBLIC_* vars
    // from its own env-inlining step (confirmed in isolation: .env and
    // @expo/env both load them correctly on their own — the bug is specific
    // to the local build plugin's orchestration). Routing them through
    // extra/expo-constants instead, since app.config.js's own process.env
    // read at config-eval time is unaffected by that bug.
    googleCalendarClientId: process.env.EXPO_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID ?? null,
    msGraphClientId: process.env.EXPO_PUBLIC_MS_GRAPH_CLIENT_ID ?? null,
  },
  owner: "peopleontechs-team",
};

export default config;
