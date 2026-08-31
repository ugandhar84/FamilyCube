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
    buildNumber: "35",
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
    permissions: [
      "android.permission.CAMERA",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
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
      "android.permission.BIND_TELECOM_CONNECTION_SERVICE",
      "android.permission.READ_PHONE_STATE",
      "android.permission.MANAGE_OWN_CALLS",
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
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
    "./plugins/withFirebasePodfileFixes.js",
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
