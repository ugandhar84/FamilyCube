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
// Was a blanket `use_modular_headers!` — applies modular headers to EVERY
// pod in the Podfile, including React Native's own internal pods, which
// collides with them on newer Xcode/Clang (confirmed: "Redefinition of
// module 'react_runtime'" between React-jsitooling and React-RuntimeHermes
// once modular headers are on globally — this is a well-documented React
// Native + use_modular_headers! interaction, see facebook/react-native#44502
// and expo/expo#29004, not something specific to this app). Scoping
// `:modular_headers => true` to just the Firebase/GoogleUtilities
// dependency chain (the actual pods that need it — GoogleUtilities'
// non-modular headers are what FirebaseCoreInternal's Swift code needs
// modular access to) avoids touching React's own pods entirely. Pod list
// confirmed via a community fix for this exact collision (expo/expo#29004).
const MODULAR_HEADERS_PODS = [
  'FirebaseCoreInternal', 'FirebaseCrashlytics', 'GoogleUtilities', 'nanopb',
  'FirebaseCore', 'FirebaseInstallations', 'GoogleDataTransport',
  'FirebaseSessions', 'FirebaseCoreExtension', 'FirebaseRemoteConfig',
  'FirebaseABTesting',
];
const MODULAR_HEADERS_MARKER = MODULAR_HEADERS_PODS.map(p => `pod '${p}', :modular_headers => true`).join('\n  ');

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

      // RNCallKeep doesn't ship a Clang module map, so Swift can't import it
      // via the bridging header — DEFINES_MODULE tells CocoaPods to generate
      // one for this specific target, independent of whether modular headers
      // are on globally or scoped (see MODULAR_HEADERS_PODS above).
      const RN_CALLKEEP_MODULEMAP_MARKER = 'RNCallKeep.modulemap';
      if (!contents.includes(RN_CALLKEEP_MODULEMAP_MARKER)) {
        const postInstallHook = `
post_install do |installer|
  installer.pods_project.targets.each do |target|
    if target.name == 'RNCallKeep'
      target.build_configurations.each do |config|
        config.build_settings['DEFINES_MODULE'] = 'YES'
        config.build_settings['SWIFT_OBJC_BRIDGING_HEADER'] = ''
      end
    end
  end
end
`;
        if (!contents.includes('post_install do')) {
          contents = contents + postInstallHook;
        } else {
          // Splice into existing post_install block
          contents = contents.replace(
            /post_install do \|installer\|/,
            `post_install do |installer|
  installer.pods_project.targets.each do |target|
    if target.name == 'RNCallKeep'
      target.build_configurations.each do |config|
        config.build_settings['DEFINES_MODULE'] = 'YES'
      end
    end
  end`,
          );
        }
      }

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
