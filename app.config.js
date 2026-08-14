const IS_EAS = !!process.env.EAS_BUILD;

/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: "FamilyCube",
  slug: "family-cube",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: ["familycube"],
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    resizeMode: "cover",
    backgroundColor: "#6C5CE7",
    image: "./assets/splash-gradient-light.png",
    dark: {
      image: "./assets/splash-gradient-dark.png",
      backgroundColor: "#1A0E3D",
    },
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.familycube.ios",
    buildNumber: "1",
    appleTeamId: "X4VLLWF6Q3",
    usesAppleSignIn: true,
    backgroundModes: ["fetch"],
    entitlements: {
      "com.apple.security.application-groups": ["group.com.familycube.ios"],
    },
    splash: {
      image: "./assets/splash-gradient-light.png",
      resizeMode: "cover",
      backgroundColor: "#6C5CE7",
      dark: {
        image: "./assets/splash-gradient-dark.png",
        backgroundColor: "#1A0E3D",
      },
    },
    icon: {
      light: "./assets/icon-light.png",
      dark: "./assets/icon-dark.png",
      tinted: "./assets/icon-dark.png",
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: "Family Cube uses your camera for profile photos and task proof submissions.",
      NSPhotoLibraryUsageDescription: "Family Cube accesses your photos for profile pictures and task completion proof.",
      NSLocationWhenInUseUsageDescription: "Family Cube uses your location to show family members on the map and set up safe zones.",
      NSFaceIDUsageDescription: "Family Cube uses Face ID to sign you in quickly and securely.",
      NSPhotoLibraryAddUsageDescription: "Family Cube saves photos to your library.",
      NSCalendarsUsageDescription: "Family Cube adds family events to Calendar so you never miss them.",
      NSCalendarsFullAccessUsageDescription: "Family Cube adds family events to Calendar so you never miss them.",
      NSRemindersUsageDescription: "Family Cube may create reminders for family tasks and events.",
      NSRemindersFullAccessUsageDescription: "Family Cube may create reminders for family tasks and events.",
      BGTaskSchedulerPermittedIdentifiers: ["com.familycube.ios.widget-refresh"],
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#6C5CE7",
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
          deploymentTarget: "16.0",
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
        color: "#6C5CE7",
        androidMode: "default",
        androidCollapsedTitle: "Family Cube",
      },
    ],
    "expo-web-browser",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: "75404fcd-d3a5-4f5d-bcb2-465fb6009ede",
    },
  },
  owner: "peopleontechs-team",
};

export default config;
