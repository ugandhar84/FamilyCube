/**
 * @react-native-firebase's iOS pods resolve Firebase via Swift Package
 * Manager by default. Each firebase pod embeds its own copy of the SPM
 * products, which collide at link time as duplicate symbols as soon as any
 * `use_frameworks!` linkage is active elsewhere in the Podfile (static or
 * dynamic). Setting `$RNFirebaseDisableSPM = true` makes react-native-firebase
 * fall back to CocoaPods-resolved Firebase instead, which doesn't hit this
 * collision.
 *
 * Must be set before any `target` block runs, so it's injected at the very
 * top of the generated Podfile. Native folders are gitignored/regenerated
 * via `expo prebuild --clean`, so this has to be a config plugin rather than
 * a one-off hand edit.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SPM_MARKER = '$RNFirebaseDisableSPM = true';
const MODULAR_HEADERS_MARKER = 'use_modular_headers!';

module.exports = function withFirebasePodfileFixes(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (!contents.includes(SPM_MARKER)) {
        contents = `${SPM_MARKER}\n${contents}`;
      }

      // Firebase's Swift pods (e.g. FirebaseCoreInternal) depend on
      // GoogleUtilities, which doesn't define Clang modules — without this,
      // static-library builds fail with "cannot yet be integrated as static
      // libraries" for any Swift pod pulling in a non-modular dependency.
      if (!contents.includes(MODULAR_HEADERS_MARKER)) {
        contents = contents.replace(
          /(use_frameworks!.*\n(?:.*use_frameworks!.*\n)*)/,
          `$1  ${MODULAR_HEADERS_MARKER}\n`,
        );
        if (!contents.includes(MODULAR_HEADERS_MARKER)) {
          // No use_frameworks! line present (pure static build) — add before use_react_native!
          contents = contents.replace(
            /(\n\s*use_react_native!\()/,
            `\n  ${MODULAR_HEADERS_MARKER}\n$1`,
          );
        }
      }

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
