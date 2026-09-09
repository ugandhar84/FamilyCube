/**
 * React Native's own transitive `fmt` pod (pulled in by Folly/Hermes) fails
 * to compile against newer Apple Clang toolchains (confirmed on Xcode 26.6)
 * with errors like:
 *   call to consteval function 'fmt::basic_format_string<...>::
 *   basic_format_string<FMT_COMPILE_STRING, 0>' is not a constant expression
 *
 * This is fmt's compile-time format-string validation (a C++20 consteval
 * check) tripping over a stricter/newer consteval implementation than the
 * version of fmt bundled with this React Native release was written
 * against — a known upstream incompatibility, not anything in this app's
 * own code. Defining FMT_USE_CONSTEVAL=0 makes fmt skip that compile-time
 * check (falling back to its runtime format-string path instead), which is
 * the documented workaround for this exact error class.
 *
 * Must be applied via post_install on the `fmt` pod target specifically —
 * native folders are gitignored/regenerated via `expo prebuild --clean`,
 * so this has to be a config plugin (same pattern as
 * withFirebasePodfileFixes.js) rather than a one-off Podfile hand edit.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = 'FMT_USE_CONSTEVAL=0';

module.exports = function withFmtConstevalFix(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes(MARKER)) return config;

      const hook = `
    installer.pods_project.targets.each do |target|
      if target.name == 'fmt'
        target.build_configurations.each do |bc|
          bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
          bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << '${MARKER}'
        end
      end
    end
`;

      if (contents.includes('post_install do')) {
        // Splice into the existing post_install block, right after its
        // opening line — same insertion point withFirebasePodfileFixes.js
        // uses for its own per-target build-setting patch.
        contents = contents.replace(
          /post_install do \|installer\|/,
          `post_install do |installer|\n${hook}`,
        );
      } else {
        contents = contents + `\npost_install do |installer|\n${hook}\nend\n`;
      }

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
