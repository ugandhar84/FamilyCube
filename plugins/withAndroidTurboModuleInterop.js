/**
 * @react-native-voice/voice ships only a legacy ReactPackage (no TurboModule
 * spec/codegen — confirmed via its package.json and VoicePackage.java), and
 * this app runs with newArchEnabled: true. Under the New Architecture,
 * NativeModules.Voice resolves to null unless React Native's own legacy-
 * module interop layer is turned on — this is a real, documented RN 0.81
 * feature flag (useTurboModuleInterop, off by default under
 * ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android, but on under the
 * ..._Canary_Android variant) — confirmed by reading DefaultNewArchitectureEntryPoint.kt
 * and ReactNativeFeatureFlagsOverrides_RNOSS_Canary_Android.kt directly, not
 * assumed. No manifest/permission change (see withAndroidSpeechQueries.js,
 * a separate, real but insufficient fix for this same live crash) can
 * address this.
 *
 * First attempt called ReactNativeFeatureFlags.override(...) directly in
 * onCreate() before loadReactNative(this) — crashed live on the emulator
 * twice: once with "SoLoader.init() not yet called" (fixed by initializing
 * SoLoader first), then with "Feature flags cannot be overridden more than
 * once" once DefaultNewArchitectureEntryPoint.load() (called internally by
 * loadReactNative) tried to install ITS OWN override on top. The actually-
 * supported mechanism is simpler: MainApplication.kt already sets
 * DefaultNewArchitectureEntryPoint.releaseLevel from BuildConfig before
 * loadReactNative(this) runs, and that releaseLevel is what
 * DefaultNewArchitectureEntryPoint.load() itself uses to pick which
 * Overrides_RNOSS_* class to install — CANARY is the one with
 * useTurboModuleInterop() = true. Forcing releaseLevel to CANARY needs no
 * separate override call and can't double-override anything.
 *
 * iOS is entirely unaffected — @react-native-voice/voice's iOS side has no
 * equivalent New Architecture interop gap (iOS's voice/speech-to-text
 * already works, per this app's own CLAUDE.md constraint to never disturb
 * what's already working there), and this plugin only ever touches
 * android/app/src/main/java/.../MainApplication.kt.
 */
const { withMainApplication } = require('@expo/config-plugins');

module.exports = function withAndroidTurboModuleInterop(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    // Overrides whatever BuildConfig.REACT_NATIVE_RELEASE_LEVEL resolved to
    // (normally STABLE) — this one line right after that assignment is the
    // entire fix, no new imports needed since ReleaseLevel is already
    // imported for the try/catch above it.
    if (!contents.includes('// withAndroidTurboModuleInterop')) {
      contents = contents.replace(
        /(DefaultNewArchitectureEntryPoint\.releaseLevel = try \{[\s\S]*?\} catch \(e: IllegalArgumentException\) \{[\s\S]*?\n    \})/,
        `$1\n    // withAndroidTurboModuleInterop: force CANARY so DefaultNewArchitectureEntryPoint.load()\n    // installs ReactNativeFeatureFlagsOverrides_RNOSS_Canary_Android, the only stock\n    // variant with useTurboModuleInterop() = true — required for @react-native-voice/voice\n    // (a legacy-bridge-only module) to register under the New Architecture.\n    DefaultNewArchitectureEntryPoint.releaseLevel = com.facebook.react.common.ReleaseLevel.CANARY`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};
