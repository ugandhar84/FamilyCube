/**
 * React Native's own transitive `fmt` pod (11.0.2, pulled in by Folly/
 * Hermes) fails to compile against newer Apple Clang toolchains (confirmed
 * on Xcode 26.6) with errors like:
 *   call to consteval function 'fmt::basic_format_string<...>::
 *   basic_format_string<FMT_COMPILE_STRING, 0>' is not a constant expression
 *
 * This is a confirmed upstream fmt/Apple-Clang incompatibility (see
 * fmtlib/fmt#4264, fmtlib/fmt#4740, expo/expo#44229) — fmt's own Apple-
 * Clang-version detection in include/fmt/base.h considers this compiler new
 * enough to enable consteval-based compile-time format-string validation,
 * but that specific consteval usage doesn't actually satisfy this
 * compiler's stricter C++20 consteval rules. Not fixed upstream until fmt
 * 12.1.0 (React Native >= 0.83.9), not backported to the 0.81.x line this
 * app is on.
 *
 * A first attempt tried injecting `-DFMT_USE_CONSTEVAL=0` via
 * GCC_PREPROCESSOR_DEFINITIONS — that does NOT work: fmt/base.h
 * unconditionally `#define`s FMT_USE_CONSTEVAL itself with no `#ifndef`
 * guard (confirmed by reading fmt 11.0.2's actual source), so an
 * externally-injected define is immediately clobbered by fmt's own
 * detection logic and the consteval path stays enabled regardless. The
 * only mechanism that actually works (same one the community's
 * expo-fmt-consteval-fix package uses) is rewriting the vendored header
 * file's own hardcoded `#define FMT_USE_CONSTEVAL 1` line directly, which
 * has to happen in `post_install` (after `pod install` has actually
 * fetched/vendored the fmt pod's source — there's nothing to patch before
 * that point).
 *
 * Native folders are gitignored/regenerated via `expo prebuild --clean`,
 * so this has to be a config plugin (same pattern as
 * withFirebasePodfileFixes.js) rather than a one-off Podfile/header edit.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = 'FMT_CONSTEVAL_PATCHED_BY_WITHFMTCONSTEVALFIX';

module.exports = function withFmtConstevalFix(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes(MARKER)) return config;

      // Runs after CocoaPods has already vendored fmt's source (post_install
      // fires after pod install's own file-copy step), so Pods/fmt/include/
      // fmt/base.h is guaranteed to exist at this point. Rewriting the
      // header's own hardcoded define is idempotent (gsub only matches the
      // "1" variant), so re-running pod install without a clean fmt
      // checkout is safe too.
      const hook = `
    # ${MARKER}
    fmt_base_h = File.join(installer.sandbox.pod_dir('fmt'), 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base_h)
      contents = File.read(fmt_base_h)
      patched = contents.gsub(/#\\s*define\\s+FMT_USE_CONSTEVAL\\s+1/, '#define FMT_USE_CONSTEVAL 0')
      File.write(fmt_base_h, patched) if patched != contents
    end
`;

      if (contents.includes('post_install do')) {
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
