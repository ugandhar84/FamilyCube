/**
 * @react-native-voice/voice's Android implementation uses
 * SpeechRecognizer/RecognizerIntent.ACTION_RECOGNIZE_SPEECH, which requires
 * a <queries> package-visibility declaration on Android 11+ (targetSdk 30+)
 * or the app cannot resolve any speech recognition service at all — the
 * live-reported crash ("Cannot read property 'startSpeech' of null") is
 * this native module failing to do anything useful without it. No config
 * plugin ships this by default; expo prebuild has no other way to know.
 *
 * iOS is entirely unaffected — this plugin only ever touches the Android
 * manifest.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAndroidSpeechQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest.queries) manifest.queries = [];

    const alreadyDeclared = manifest.queries.some((q) =>
      q.intent?.some((i) => i.action?.some((a) => a.$?.['android:name'] === 'android.speech.RecognitionService'))
    );

    if (!alreadyDeclared) {
      manifest.queries.push({
        intent: [
          {
            action: [{ $: { 'android:name': 'android.speech.RecognitionService' } }],
          },
        ],
      });
    }

    return config;
  });
};
