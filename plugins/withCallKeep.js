/**
 * Wires react-native-callkeep's PushKit wake-on-killed-app handling, the
 * CXCallObserver answer/hangup bridge, and the native (no-JS) AVSpeechSynthesizer
 * TTS reminder into the generated native project on every `expo prebuild`.
 * This is necessary because the installed react-native-callkeep version
 * (4.3.16) ships no PKPushRegistryDelegate of its own, and this app is
 * deliberately native-CallKit-only (no in-app call screen, no JS involved in
 * ring/answer/speak) — all of that logic has to live in AppDelegate.swift by
 * hand, which prebuild would otherwise silently wipe on the next
 * `expo prebuild --clean`, breaking call reminders with no error and no
 * obvious symptom until a reminder just doesn't ring or stays silent.
 *
 * ios/FamilyCube/AppDelegate.swift (gitignored, hand-edited directly when
 * iterating on the call-reminder feature) is this plugin's SINGLE SOURCE OF
 * TRUTH — this file no longer hand-duplicates Swift as template-literal
 * strings. Instead, at patch time it reads the real AppDelegate.swift off
 * disk and extracts the exact units it needs (imports, the class-conformance
 * line, the properties block, and each named method via brace-matching),
 * then ensures the generated file being patched contains an up-to-date copy
 * of each unit — inserting it if missing, replacing it if present-but-stale.
 * This removes the possibility of the plugin and the hand-written file
 * silently drifting apart (which already caused one real bug: a stray
 * `var`/`let speechSynthesizer` mismatch produced a duplicate-property
 * insertion, only caught by the idempotency test harness).
 *
 * If ios/FamilyCube/AppDelegate.swift doesn't exist yet (very first
 * prebuild, before the file has ever been generated), this plugin no-ops —
 * there is nothing to extract from. Run `npx expo prebuild` once first to
 * generate the initial file, hand-edit in the CallKit/TTS code once, and
 * from then on this plugin keeps every subsequent prebuild in sync with it.
 */
const { withAppDelegate, withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const BRIDGING_HEADER_IMPORT = '#import <RNCallKeep/RNCallKeep.h>';

const CANONICAL_APP_DELEGATE_PATH = path.join(__dirname, '..', 'ios', 'FamilyCube', 'AppDelegate.swift');

function readCanonicalSource() {
  if (!fs.existsSync(CANONICAL_APP_DELEGATE_PATH)) return null;
  return fs.readFileSync(CANONICAL_APP_DELEGATE_PATH, 'utf8');
}

// Extracts a single top-level line (e.g. an `import Foo` statement) verbatim.
function extractLine(source, linePrefix) {
  const line = source.split('\n').find((l) => l.trim().startsWith(linePrefix));
  if (!line) throw new Error(`withCallKeep: canonical AppDelegate.swift is missing expected line starting with "${linePrefix}"`);
  return line.trim();
}

// Extracts a brace-delimited unit (a function body, or the class declaration
// through its opening brace) starting at the first occurrence of `marker`,
// by counting braces from that point until they balance back to zero. This
// is what lets the plugin pull a whole method verbatim out of the real file
// regardless of how its internals have changed, rather than needing a
// separate template literal kept in sync by hand.
function extractBraceBlock(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`withCallKeep: canonical AppDelegate.swift is missing expected block starting with "${marker}"`);
  let depth = 0;
  let seenOpenBrace = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') {
      depth++;
      seenOpenBrace = true;
    } else if (ch === '}') {
      depth--;
      if (seenOpenBrace && depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  throw new Error(`withCallKeep: unbalanced braces extracting block starting with "${marker}"`);
}

// Extracts just the class declaration line (through its opening brace, but
// not the whole class body) — e.g.
// "public class AppDelegate: ExpoAppDelegate, PKPushRegistryDelegate, ... {"
function extractClassDeclarationLine(source) {
  const start = source.indexOf('public class AppDelegate:');
  if (start === -1) throw new Error('withCallKeep: canonical AppDelegate.swift is missing the AppDelegate class declaration');
  const end = source.indexOf('{', start);
  if (end === -1) throw new Error('withCallKeep: could not find opening brace of AppDelegate class declaration');
  return source.slice(start, end + 1).trim();
}

// Extracts the properties block: everything from `var reactNativeFactory`
// (a line already present in every fresh-prebuilt AppDelegate.swift) through
// the last `static let repeatGapSeconds` line this feature owns — i.e. every
// CallKit/PushKit/TTS-related stored property, verbatim, in one contiguous
// chunk.
function extractPropertiesBlock(source) {
  const startMarker = 'var reactNativeFactory: RCTReactNativeFactory?';
  const startMarkerIdx = source.indexOf(startMarker);
  if (startMarkerIdx === -1) throw new Error('withCallKeep: canonical AppDelegate.swift is missing the reactNativeFactory property');
  // Start AFTER the anchor line itself — the target file already has this
  // exact line (it ships in every fresh-prebuilt AppDelegate.swift), so the
  // extracted block must only contain what comes after it, or inserting
  // "anchor\n<block>" would duplicate the anchor line.
  const start = source.indexOf('\n', startMarkerIdx) + 1;
  const endMarker = 'static let repeatGapSeconds: TimeInterval = 2.0';
  const endIdx = source.indexOf(endMarker);
  if (endIdx === -1) throw new Error('withCallKeep: canonical AppDelegate.swift is missing the repeatGapSeconds property');
  const lineEnd = source.indexOf('\n', endIdx);
  // trimStart() too — insertion below supplies its own leading indent, and
  // the raw slice starts with the source's existing "  " (2-space) indent
  // already, which would otherwise double up to 4 spaces once spliced in.
  return source.slice(start, lineEnd === -1 ? source.length : lineEnd).trim();
}

// Extracts the two setup snippets inserted inside didFinishLaunchingWithOptions
// (RNCallKeep.setup + PushKit/CXCallObserver/speechSynthesizer wiring),
// i.e. everything between the ReactNative-bootstrap #endif and the
// `return super.application(...)` line.
function extractDidFinishLaunchingSetup(source) {
  const startMarker = '#endif';
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error('withCallKeep: canonical AppDelegate.swift is missing the #endif marker in didFinishLaunchingWithOptions');
  const contentStart = start + startMarker.length;
  const endMarker = 'return super.application(application, didFinishLaunchingWithOptions: launchOptions)';
  const end = source.indexOf(endMarker, contentStart);
  if (end === -1) throw new Error('withCallKeep: canonical AppDelegate.swift is missing the didFinishLaunchingWithOptions return statement');
  return source.slice(contentStart, end).trim();
}

function buildCanonicalUnits() {
  const source = readCanonicalSource();
  if (!source) return null;

  return {
    pushkitImport: extractLine(source, 'import PushKit'),
    callkitImport: extractLine(source, 'import CallKit'),
    avfoundationImport: extractLine(source, 'import AVFoundation'),
    classDeclarationLine: extractClassDeclarationLine(source),
    propertiesBlock: extractPropertiesBlock(source),
    setupSnippet: extractDidFinishLaunchingSetup(source),
    callObserverFn: extractBraceBlock(source, 'public func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {'),
    dayPartPhraseFn: extractBraceBlock(source, 'private func dayPartPhrase(for dueAtIso: String) -> String {'),
    speakReminderFn: extractBraceBlock(source, 'private func speakReminder(callUUID: String, itemType: String) {'),
    speechDidFinishFn: extractBraceBlock(source, 'public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {'),
    pushRegistryDidUpdateFn: extractBraceBlock(source, 'public func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {'),
    pushRegistryDidInvalidateFn: extractBraceBlock(source, 'public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {'),
    pushRegistryDidReceiveFn: extractBraceBlock(source, 'public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {'),
  };
}

// Replaces `find` with `replacement` in-place if present (staleness-repair),
// otherwise inserts `replacement` right after `anchor` (first-time
// insertion). Either way, ends with exactly one up-to-date copy of the unit.
function ensureUnit(contents, { find, anchor, replacement }) {
  if (find && contents.includes(find)) {
    if (find === replacement) return contents; // already exactly current
    return contents.replace(find, replacement);
  }
  if (contents.includes(replacement)) return contents; // already exactly current, e.g. via a different find path
  if (!contents.includes(anchor)) {
    throw new Error(`withCallKeep: could not find anchor for insertion: ${anchor.slice(0, 60)}...`);
  }
  return contents.replace(anchor, `${anchor}\n${replacement}`);
}

function withCallKeepAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    const units = buildCanonicalUnits();
    if (!units) {
      console.warn('[withCallKeep] ios/FamilyCube/AppDelegate.swift not found — skipping CallKit/TTS patch. Run prebuild once, hand-edit that file, then prebuild again.');
      return config;
    }

    let contents = config.modResults.contents;

    // ── Imports ────────────────────────────────────────────────────────────
    if (!contents.includes(units.pushkitImport)) {
      contents = contents.replace('import ReactAppDependencyProvider', `import ReactAppDependencyProvider\n${units.pushkitImport}`);
    }
    if (!contents.includes(units.callkitImport)) {
      contents = contents.replace(units.pushkitImport, `${units.pushkitImport}\n${units.callkitImport}`);
    }
    if (!contents.includes(units.avfoundationImport)) {
      contents = contents.replace(units.callkitImport, `${units.callkitImport}\n${units.avfoundationImport}`);
    }

    // ── Class conformance line ───────────────────────────────────────────────
    if (!contents.includes(units.classDeclarationLine)) {
      const existingDeclMatch = contents.match(/public class AppDelegate: ExpoAppDelegate[^{]*\{/);
      if (existingDeclMatch) {
        contents = contents.replace(existingDeclMatch[0], units.classDeclarationLine);
      } else {
        throw new Error('withCallKeep: could not find any AppDelegate class declaration to replace');
      }
    }

    // ── Stored properties block ───────────────────────────────────────────────
    // Bare-bones fresh-prebuild files only have reactNativeFactory with
    // nothing after it on subsequent lines belonging to this feature — so if
    // the canonical block isn't already there verbatim, drop any stale
    // partial version (identified by the same start/end anchors used to
    // extract it) and splice in the current one fresh, right after the
    // reactNativeFactory line.
    if (!contents.includes(units.propertiesBlock)) {
      const anchor = 'var reactNativeFactory: RCTReactNativeFactory?';
      const anchorIdx = contents.indexOf(anchor);
      if (anchorIdx === -1) throw new Error('withCallKeep: target AppDelegate.swift is missing reactNativeFactory property');
      const afterAnchor = anchorIdx + anchor.length;
      // If a previous (possibly stale) version of this plugin already
      // inserted SOME properties here, they sit between reactNativeFactory
      // and the next blank-line-then-method boundary. Find that boundary by
      // locating the next occurrence of the didFinishLaunchingWithOptions
      // function signature and cut everything between as the "existing
      // properties region" to replace wholesale.
      const nextFuncIdx = contents.indexOf('public override func application(', afterAnchor);
      if (nextFuncIdx === -1) throw new Error('withCallKeep: target AppDelegate.swift is missing didFinishLaunchingWithOptions');
      const before = contents.slice(0, afterAnchor).replace(/[ \t]+$/, '');
      const after = contents.slice(nextFuncIdx);
      contents = `${before}\n  ${units.propertiesBlock}\n\n  ${after}`;
    }

    // ── didFinishLaunchingWithOptions body (RNCallKeep.setup + PushKit + observer + speech delegate wiring) ──
    if (!contents.includes(units.setupSnippet)) {
      const endMarker = '#endif';
      const endIdx = contents.indexOf(endMarker);
      if (endIdx === -1) throw new Error('withCallKeep: target AppDelegate.swift is missing #endif in didFinishLaunchingWithOptions');
      const contentStart = endIdx + endMarker.length;
      const returnMarker = 'return super.application(application, didFinishLaunchingWithOptions: launchOptions)';
      const returnIdx = contents.indexOf(returnMarker, contentStart);
      if (returnIdx === -1) throw new Error('withCallKeep: target AppDelegate.swift is missing the didFinishLaunchingWithOptions return statement');
      const before = contents.slice(0, contentStart);
      const after = contents.slice(returnIdx);
      contents = `${before}\n\n    ${units.setupSnippet}\n\n    ${after}`;
    }

    // ── Named methods — each ensured independently via brace-matched replace-or-insert ──
    const methodAnchor = 'public override func application(\n    _ application: UIApplication,\n    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil\n  ) -> Bool {';
    const methodInsertAfter = () => {
      // Insert new methods right after didFinishLaunchingWithOptions's
      // closing brace — found by brace-matching from the anchor above,
      // since methods can vary in body content between installs.
      const idx = contents.indexOf(methodAnchor);
      if (idx === -1) return null;
      let depth = 0;
      let seenOpenBrace = false;
      for (let i = idx; i < contents.length; i++) {
        const ch = contents[i];
        if (ch === '{') { depth++; seenOpenBrace = true; }
        else if (ch === '}') {
          depth--;
          if (seenOpenBrace && depth === 0) return i + 1;
        }
      }
      return null;
    };

    function ensureMethod(fnSource, findMarker) {
      const existingStart = contents.indexOf(findMarker);
      if (existingStart !== -1) {
        // A method with this signature already exists — extract its current
        // body the same way we extracted the canonical one, and replace it
        // wholesale if different (keeps behavior changes like phrasing/
        // repeat-count tweaks flowing through without a manual patch string).
        let depth = 0;
        let seenOpenBrace = false;
        let existingEnd = -1;
        for (let i = existingStart; i < contents.length; i++) {
          const ch = contents[i];
          if (ch === '{') { depth++; seenOpenBrace = true; }
          else if (ch === '}') {
            depth--;
            if (seenOpenBrace && depth === 0) { existingEnd = i + 1; break; }
          }
        }
        if (existingEnd === -1) throw new Error(`withCallKeep: unbalanced braces in target file's existing method starting with "${findMarker}"`);
        const existingFn = contents.slice(existingStart, existingEnd);
        if (existingFn === fnSource) return; // already current
        contents = contents.slice(0, existingStart) + fnSource + contents.slice(existingEnd);
        return;
      }
      // Not present yet — insert right after didFinishLaunchingWithOptions.
      const insertAt = methodInsertAfter();
      if (insertAt === null) throw new Error('withCallKeep: could not find insertion point for new method');
      contents = `${contents.slice(0, insertAt)}\n\n  ${fnSource}${contents.slice(insertAt)}`;
    }

    ensureMethod(units.callObserverFn, 'public func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {');
    ensureMethod(units.dayPartPhraseFn, 'private func dayPartPhrase(for dueAtIso: String) -> String {');
    ensureMethod(units.speakReminderFn, 'private func speakReminder(callUUID: String, itemType: String) {');
    ensureMethod(units.speechDidFinishFn, 'public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {');
    ensureMethod(units.pushRegistryDidUpdateFn, 'public func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {');
    ensureMethod(units.pushRegistryDidInvalidateFn, 'public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {');
    ensureMethod(units.pushRegistryDidReceiveFn, 'public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {');

    config.modResults.contents = contents;
    return config;
  });
}

// PushKit hands back the VoIP token almost immediately on launch, often
// before JS/React has finished bootstrapping — so the NotificationCenter
// post in didUpdate can fire with zero listeners and the token is lost.
// This tiny native module lets JS pull the cached token (written to
// UserDefaults by AppDelegate.swift) synchronously on mount, covering that
// startup race in addition to the live-update notification path.
const VOIP_TOKEN_MODULE_M = `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(FCVoipToken, NSObject)
RCT_EXTERN_METHOD(getCachedToken:(RCTResponseSenderBlock)callback)
RCT_EXTERN_METHOD(getLastAnsweredCall:(RCTResponseSenderBlock)callback)
@end
`;

const VOIP_TOKEN_MODULE_SWIFT = `import Foundation
import React

@objc(FCVoipToken)
class FCVoipToken: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func getCachedToken(_ callback: @escaping RCTResponseSenderBlock) {
    let token = UserDefaults.standard.string(forKey: "familycube_voip_token") ?? ""
    callback([token])
  }

  // Reads back a call answered via CXCallObserver (see AppDelegate.swift's
  // callObserver(_:callChanged:)) — covers the killed-app-then-answered
  // case react-native-callkeep's own getInitialEvents()/_delayedEvents
  // replay queue cannot, since that queue is in-memory only and dies with
  // whatever process displayed/answered the call if a different process
  // ends up relaunching this JS. Consumes (clears) on read.
  @objc func getLastAnsweredCall(_ callback: @escaping RCTResponseSenderBlock) {
    let defaults = UserDefaults.standard
    guard let callUUID = defaults.string(forKey: "familycube_last_answered_call_uuid"),
          let itemType = defaults.string(forKey: "familycube_last_answered_itemType"),
          let itemId = defaults.string(forKey: "familycube_last_answered_itemId") else {
      callback([NSNull()])
      return
    }
    defaults.removeObject(forKey: "familycube_last_answered_call_uuid")
    defaults.removeObject(forKey: "familycube_last_answered_itemType")
    defaults.removeObject(forKey: "familycube_last_answered_itemId")
    defaults.removeObject(forKey: "familycube_call_itemType_\\(callUUID)")
    defaults.removeObject(forKey: "familycube_call_itemId_\\(callUUID)")
    callback([["callUUID": callUUID, "itemType": itemType, "itemId": itemId]])
  }
}
`;

function withVoipTokenNativeModuleFiles(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, config.modRequest.projectName);
      fs.writeFileSync(path.join(dir, 'FCVoipToken.m'), VOIP_TOKEN_MODULE_M);
      fs.writeFileSync(path.join(dir, 'FCVoipToken.swift'), VOIP_TOKEN_MODULE_SWIFT);
      return config;
    },
  ]);
}

// The plain (non-synchronized) FamilyCube PBXGroup doesn't auto-discover
// loose files the way widget/ does — new source files need an explicit
// PBXBuildFile + PBXFileReference + Sources-phase entry, which is what
// withXcodeProject's addSourceFile does.
function withVoipTokenNativeModuleProjectEntry(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const groupName = config.modRequest.projectName;
    for (const filename of ['FCVoipToken.m', 'FCVoipToken.swift']) {
      const alreadyPresent = Object.values(project.hash.project.objects.PBXFileReference ?? {}).some(
        (ref) => typeof ref === 'object' && ref.path === filename,
      );
      if (!alreadyPresent) {
        project.addSourceFile(`${groupName}/${filename}`, {}, project.findPBXGroupKey({ name: groupName }));
      }
    }
    return config;
  });
}

function withCallKeepBridgingHeader(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const headerPath = path.join(
        config.modRequest.platformProjectRoot,
        config.modRequest.projectName,
        `${config.modRequest.projectName}-Bridging-Header.h`,
      );
      if (fs.existsSync(headerPath)) {
        const contents = fs.readFileSync(headerPath, 'utf8');
        if (!contents.includes(BRIDGING_HEADER_IMPORT)) {
          fs.writeFileSync(headerPath, `${contents}\n${BRIDGING_HEADER_IMPORT}\n`);
        }
      }
      return config;
    },
  ]);
}

module.exports = function withCallKeep(config) {
  config = withCallKeepAppDelegate(config);
  config = withCallKeepBridgingHeader(config);
  config = withVoipTokenNativeModuleFiles(config);
  config = withVoipTokenNativeModuleProjectEntry(config);
  return config;
};
