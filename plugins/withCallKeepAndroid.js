/**
 * react-native-callkeep ships a complete, working Android ConnectionService
 * implementation (io.wazo.callkeep.VoiceConnectionService,
 * RNCallKeepBackgroundMessagingService — see node_modules/react-native-callkeep/
 * android/src/main/java/io/wazo/callkeep/) but does NOT ship its own Expo
 * config plugin, unlike most Expo-aware libraries. Its own manual-install
 * docs require two <service> declarations in AndroidManifest.xml that
 * `expo prebuild` has no other way to know about. Without them,
 * TelecomManager.addNewIncomingCall (RNCallKeepModule.java's
 * displayIncomingCall) and the killed-app FCM wake path
 * (RNCallKeepBackgroundMessagingService, referenced from lib/callAlert.ts's
 * own header comment) both silently fail to register.
 *
 * iOS is entirely unaffected — this plugin only ever touches the Android
 * manifest (see withDangerousMod's ['android', ...] scope below); iOS's own
 * CallKit/PushKit wiring lives in plugins/withCallKeep.js's
 * withCallKeepAppDelegate (a completely separate function, untouched here).
 *
 * android/ is gitignored/regenerated on every `expo prebuild --clean`, so
 * this has to be a config plugin, same reasoning as every other
 * plugins/with*.js file in this repo.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const VOICE_CONNECTION_SERVICE = 'io.wazo.callkeep.VoiceConnectionService';
const BACKGROUND_MESSAGING_SERVICE = 'io.wazo.callkeep.RNCallKeepBackgroundMessagingService';

module.exports = function withCallKeepAndroid(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;

    if (!application.service) application.service = [];

    const hasService = (name) =>
      application.service.some((s) => s.$?.['android:name'] === name);

    if (!hasService(VOICE_CONNECTION_SERVICE)) {
      application.service.push({
        $: {
          'android:name': VOICE_CONNECTION_SERVICE,
          'android:label': 'Family Cube',
          'android:permission': 'android.permission.BIND_TELECOM_CONNECTION_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.telecom.ConnectionService' } }],
          },
        ],
      });
    }

    if (!hasService(BACKGROUND_MESSAGING_SERVICE)) {
      application.service.push({
        $: {
          'android:name': BACKGROUND_MESSAGING_SERVICE,
          'android:exported': 'false',
        },
      });
    }

    return config;
  });
};
