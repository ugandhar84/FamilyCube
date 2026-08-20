/**
 * Wires react-native-callkeep's PushKit wake-on-killed-app handling into
 * the generated native project on every `expo prebuild`. This is necessary
 * because the installed react-native-callkeep version (4.3.16) ships no
 * PKPushRegistryDelegate of its own — that delegate has to live in
 * AppDelegate.swift by hand, which prebuild would otherwise silently wipe
 * on the next `expo prebuild --clean` (per the project's documented clean-
 * build workflow), breaking call reminders with no error and no obvious
 * symptom until a reminder just doesn't ring.
 *
 * Reapplies:
 *  - `#import <RNCallKeep/RNCallKeep.h>` in the Swift bridging header
 *  - PushKit import, PKPushRegistryDelegate conformance, RNCallKeep.setup(),
 *    and the didReceiveIncomingPushWith handler in AppDelegate.swift
 *
 * See ios/FamilyCube/AppDelegate.swift for the canonical hand-written
 * version this plugin mirrors — keep the two in sync if the delegate logic
 * changes.
 */
const { withAppDelegate, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const BRIDGING_HEADER_IMPORT = '#import <RNCallKeep/RNCallKeep.h>';

const PUSHKIT_IMPORT = 'import PushKit';

const DELEGATE_CONFORMANCE_OLD = 'public class AppDelegate: ExpoAppDelegate {';
const DELEGATE_CONFORMANCE_NEW = 'public class AppDelegate: ExpoAppDelegate, PKPushRegistryDelegate {';

const PROPERTY_MARKER = 'var reactNativeFactory: RCTReactNativeFactory?';
const PROPERTY_ADDITION = `${PROPERTY_MARKER}\n  var voipRegistry: PKPushRegistry?`;

const SETUP_MARKER = 'return super.application(application, didFinishLaunchingWithOptions: launchOptions)\n  }';
const SETUP_ADDITION = `RNCallKeep.setup([
      "appName": "Family Cube",
      "supportsVideo": false,
      "maximumCallGroups": 1,
      "maximumCallsPerCallGroup": 1,
    ])

    let registry = PKPushRegistry(queue: DispatchQueue.main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    voipRegistry = registry

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // ── PushKit — VoIP call-reminder wake ──────────────────────────────────────
  public func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    guard type == .voIP else { return }
    let tokenHex = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    NotificationCenter.default.post(name: NSNotification.Name("VoipTokenUpdated"), object: nil, userInfo: ["token": tokenHex])
  }

  public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    guard type == .voIP else { return }
    NotificationCenter.default.post(name: NSNotification.Name("VoipTokenUpdated"), object: nil, userInfo: ["token": ""])
  }

  public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
    guard type == .voIP else { completion(); return }
    let callerName = (payload.dictionaryPayload["callerName"] as? String) ?? "Family Cube Reminder"
    let itemType = (payload.dictionaryPayload["itemType"] as? String) ?? ""
    let itemId = (payload.dictionaryPayload["itemId"] as? String) ?? ""
    let dueAtIso = (payload.dictionaryPayload["dueAtIso"] as? String) ?? ""
    let callUUID = UUID().uuidString
    RNCallKeep.reportNewIncomingCall(
      callUUID,
      handle: callerName,
      handleType: "generic",
      hasVideo: false,
      localizedCallerName: callerName,
      supportsHolding: false,
      supportsDTMF: false,
      supportsGrouping: false,
      supportsUngrouping: false,
      fromPushKit: true,
      payload: ["itemType": itemType, "itemId": itemId, "dueAtIso": dueAtIso, "callUUID": callUUID],
      withCompletionHandler: completion
    )
  }`;

function withCallKeepAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes(PUSHKIT_IMPORT)) {
      contents = contents.replace('import ReactAppDependencyProvider', `import ReactAppDependencyProvider\n${PUSHKIT_IMPORT}`);
    }
    if (!contents.includes('PKPushRegistryDelegate')) {
      contents = contents.replace(DELEGATE_CONFORMANCE_OLD, DELEGATE_CONFORMANCE_NEW);
    }
    if (!contents.includes('var voipRegistry')) {
      contents = contents.replace(PROPERTY_MARKER, PROPERTY_ADDITION);
    }
    if (!contents.includes('RNCallKeep.setup(')) {
      contents = contents.replace(SETUP_MARKER, SETUP_ADDITION);
    }

    config.modResults.contents = contents;
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
  return config;
};
