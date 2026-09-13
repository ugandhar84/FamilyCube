/**
 * @react-native-voice/voice depends on the ancient pre-AndroidX
 * `com.android.support:appcompat-v7:28.0.0` (and its whole legacy
 * transitive tree), which coexists on the classpath alongside the app's
 * modern AndroidX dependencies — the manifest merger then fails outright:
 * `application@appComponentFactory` is declared twice with two different
 * values (androidx.core's vs. the legacy support library's), one from
 * each dependency. This is a real, first-time-ever Android build failure
 * (confirmed live via `expo run:android` — this app has never actually
 * built on Android before), not a config typo.
 *
 * `android.enableJetifier=true` is the standard, correct fix — it rewrites
 * legacy support-library references to their AndroidX equivalents at
 * build time, resolving the duplicate-declaration conflict without
 * touching react-native-voice's own (unmaintained) source. `useAndroidX`
 * is already true; `enableJetifier` was simply never added.
 *
 * gradle.properties lives in the gitignored, regenerated `android/`
 * directory (wiped on every `expo prebuild --clean`), so this has to be a
 * config plugin, same reasoning as plugins/withFirebasePodfileFixes.js's
 * own header comment about ios/Podfile.
 */
const { withGradleProperties } = require('@expo/config-plugins');

// Jetifying react-android's own large debug AAR ran the Gradle daemon out
// of heap at the default 2048m (`JetifyTransform ... Java heap space`,
// confirmed live) — 4096m is a standard bump for this exact known
// interaction (jetifier transforms on a big react-native-core AAR),
// not an arbitrary increase.
const JVM_ARGS_KEY = 'org.gradle.jvmargs';
const JVM_ARGS_VALUE = '-Xmx4096m -XX:MaxMetaspaceSize=512m';

module.exports = function withAndroidJetifier(config) {
  return withGradleProperties(config, (config) => {
    const setProp = (key, value) => {
      const existing = config.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) existing.value = value;
      else config.modResults.push({ type: 'property', key, value });
    };
    setProp('android.enableJetifier', 'true');
    setProp(JVM_ARGS_KEY, JVM_ARGS_VALUE);
    return config;
  });
};
