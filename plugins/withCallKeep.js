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
const { withAppDelegate, withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const BRIDGING_HEADER_IMPORT = '#import <RNCallKeep/RNCallKeep.h>';

const PUSHKIT_IMPORT = 'import PushKit';
const CALLKIT_IMPORT = 'import CallKit';
const AVFOUNDATION_IMPORT = 'import AVFoundation';

const DELEGATE_CONFORMANCE_OLD = 'public class AppDelegate: ExpoAppDelegate {';
const DELEGATE_CONFORMANCE_NEW = 'public class AppDelegate: ExpoAppDelegate, PKPushRegistryDelegate, CXCallObserverDelegate {';

const PROPERTY_MARKER = 'var reactNativeFactory: RCTReactNativeFactory?';
const PROPERTY_ADDITION = `${PROPERTY_MARKER}\n  var voipRegistry: PKPushRegistry?\n  var callObserver: CXCallObserver?\n  // CXCallObserver's callChanged delegate fires on EVERY state transition\n  // of a call, not just once on connect — a call reliably re-fires this\n  // with hasConnected still true / hasEnded still false more than once\n  // over its lifetime (e.g. audio-route changes, hold/mute toggles, or\n  // just a redundant re-notify from CallKit's own internals). Each such\n  // re-fire used to unconditionally rewrite familycube_last_answered_* to\n  // UserDefaults again — so if JS had already consumed (cleared) that\n  // pointer via getLastAnsweredCall once the user handled the call, a\n  // LATER redundant callChanged for that same already-answered call would\n  // resurrect it, and the app would show the call-alert banner again on\n  // next reopen for a call that was already over. This set tracks which\n  // callUUIDs have already been surfaced to JS so a repeat delivery for\n  // the same call is a no-op instead of a phantom re-answer.\n  var surfacedCallUUIDs = Set<String>()\n  // Speaks the reminder once CallKit reports the call connected — the\n  // actual TTS this whole call-reminder feature is FOR. This app is\n  // deliberately native-CallKit-only (no in-app call screen, no JS\n  // involved in ring/answer/speak at all), so this has to live here, not\n  // in a JS effect — and needs to work even before React Native has\n  // booted (a VoIP push can answer straight into this delegate from a\n  // killed app). AVSpeechSynthesizer shares the call's own already-active\n  // AVAudioSession automatically once CallKit hands control back\n  // (didActivateAudioSession), so speech comes out the same earpiece/\n  // speaker the call itself is using.\n  let speechSynthesizer = AVSpeechSynthesizer()`;

const SPEAK_REMINDER_FUNCTION = `\n  // Builds and speaks the reminder as several short, separately-queued\n  // AVSpeechUtterances rather than one long comma-joined sentence — the\n  // synthesizer paces on utterance boundaries far better than on internal\n  // punctuation alone, so this reads with natural pauses between the\n  // greeting, the reminder itself, and any notes, instead of one flat\n  // run-on at a constant clip (mirrors the pacing the app's old in-app\n  // call screen achieved via repeated Speech.speak() calls in JS, before\n  // that screen was removed in favor of a fully native-CallKit-only flow).\n  private func speakReminder(callUUID: String, itemType: String) {\n    let title = UserDefaults.standard.string(forKey: "familycube_call_title_\\(callUUID)") ?? "your reminder"\n    let recipientName = UserDefaults.standard.string(forKey: "familycube_call_recipient_\\(callUUID)")\n    let notes = UserDefaults.standard.string(forKey: "familycube_call_notes_\\(callUUID)")\n\n    var segments: [String] = []\n    if let recipientName = recipientName, !recipientName.isEmpty {\n      segments.append("Hi \\(recipientName).")\n    }\n    segments.append("This is your Family Cube reminder.")\n    segments.append(\n      itemType == "event"\n        ? "It's time for \\(title)."\n        : "Don't forget: \\(title)."\n    )\n    if let notes = notes, !notes.isEmpty {\n      segments.append(notes)\n    }\n\n    // Prefer a Siri-quality voice (.premium, falling back to .enhanced)\n    // over the default ".default" compact system voice — same preference\n    // lib/units.ts's resolveBestVoiceId() already applies for the (now-\n    // removed) JS speech path; mirrored here since that logic no longer\n    // runs. Enhanced/Premium voices must be downloaded on-device\n    // (Settings > Accessibility > Spoken Content > Voices) — if none are\n    // installed for the current language, this correctly falls back to\n    // whatever default voice AVSpeechSynthesisVoice(language:) returns.\n    let languageCode = AVSpeechSynthesisVoice.currentLanguageCode()\n    let candidates = AVSpeechSynthesisVoice.speechVoices().filter { $0.language == languageCode }\n    let voice = candidates.first(where: { $0.quality == .premium })\n      ?? candidates.first(where: { $0.quality == .enhanced })\n      ?? AVSpeechSynthesisVoice(language: languageCode)\n\n    for segment in segments {\n      let utterance = AVSpeechUtterance(string: segment)\n      utterance.voice = voice\n      utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.97\n      utterance.postUtteranceDelay = 0.35\n      speechSynthesizer.speak(utterance)\n    }\n  }`;

const SETUP_MARKER = 'return super.application(application, didFinishLaunchingWithOptions: launchOptions)\n  }';
// react-native-callkeep's answerCall/getInitialEvents replay queue
// (_delayedEvents in RNCallKeep.m) is a plain in-memory array with no
// persistence — if the process that displayed the CallKit call and captured
// the answer action gets torn down before this app relaunches (the
// documented, still-open killed-app-then-answer-from-lock-screen case —
// react-native-webrtc/react-native-callkeep#844, #190, #682), that queue is
// gone and JS never learns the call was answered. CXCallObserver asks iOS's
// own CallKit call registry directly, independent of which process is
// running; UserDefaults survives the process boundary the in-memory array
// doesn't. See callObserver(_:callChanged:) below and FCVoipToken's
// getLastAnsweredCall.
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

    let observer = CXCallObserver()
    observer.setDelegate(self, queue: nil)
    callObserver = observer

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  public func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {
    let uuid = call.uuid.uuidString
    // A call ending is the one transition that must actually clear state,
    // not just be ignored — otherwise the per-UUID payload cache
    // (familycube_call_itemType_/itemId_) outlives the call itself and can
    // still be read back by a later, unrelated callChanged delivery for
    // the same now-dead CXCall object.
    if call.hasEnded {
      UserDefaults.standard.removeObject(forKey: "familycube_call_itemType_\\(uuid)")
      UserDefaults.standard.removeObject(forKey: "familycube_call_itemId_\\(uuid)")
      UserDefaults.standard.removeObject(forKey: "familycube_call_title_\\(uuid)")
      UserDefaults.standard.removeObject(forKey: "familycube_call_recipient_\\(uuid)")
      UserDefaults.standard.removeObject(forKey: "familycube_call_notes_\\(uuid)")
      speechSynthesizer.stopSpeaking(at: .immediate)
      surfacedCallUUIDs.remove(uuid)
      // Was: nothing here told JS a call had ended if it happened while no
      // JS runtime was alive to receive the live 'endCall' RNCallKeep
      // event — hanging up from the lock screen / native call UI while the
      // app was backgrounded/suspended left the post-answer /call-alert
      // screen stuck on screen indefinitely; reopening the app just
      // resumed exactly where it was left, with no cleanup ever having
      // run (live-reported). Mirrors the existing
      // familycube_last_answered_call_uuid pattern for the answered case —
      // FCVoipToken.getLastEndedCall reads this back on next launch/
      // foreground so JS can close a stale screen for a call that's
      // already over.
      UserDefaults.standard.set(uuid, forKey: "familycube_last_ended_call_uuid")
      return
    }
    guard call.hasConnected else { return }
    // Already surfaced this exact call to JS once — a repeat hasConnected
    // delivery for the same UUID (CallKit re-fires callChanged for
    // unrelated state changes while a call stays connected) must not
    // resurrect an already-handled call.
    guard !surfacedCallUUIDs.contains(uuid) else { return }
    guard let itemType = UserDefaults.standard.string(forKey: "familycube_call_itemType_\\(uuid)"),
          let itemId = UserDefaults.standard.string(forKey: "familycube_call_itemId_\\(uuid)") else {
      // No cached payload for this call — either it's a real phone call
      // (this app has no other CallKit use) or the payload was already
      // consumed. Nothing to answer-notify JS about.
      return
    }
    surfacedCallUUIDs.insert(uuid)
    UserDefaults.standard.set(uuid, forKey: "familycube_last_answered_call_uuid")
    UserDefaults.standard.set(itemType, forKey: "familycube_last_answered_itemType")
    UserDefaults.standard.set(itemId, forKey: "familycube_last_answered_itemId")
    NotificationCenter.default.post(name: NSNotification.Name("FCCallAnswered"), object: nil,
      userInfo: ["callUUID": uuid, "itemType": itemType, "itemId": itemId])

    speakReminder(callUUID: uuid, itemType: itemType)
  }
${SPEAK_REMINDER_FUNCTION}

  // ── PushKit — VoIP call-reminder wake ──────────────────────────────────────
  public func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    guard type == .voIP else { return }
    let tokenHex = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    // FCVoipToken.swift's getCachedToken() reads this key to cover the
    // race where PushKit hands the token to iOS before JS has booted far
    // enough to attach its listener, or to re-deliver the same token when
    // the JS effect re-runs after a profile switch — this write was
    // missing entirely, so getCachedToken() always returned empty and only
    // a live NotificationCenter post (a one-time, easy-to-miss event) ever
    // actually delivered a token to JS.
    UserDefaults.standard.set(tokenHex, forKey: "familycube_voip_token")
    NotificationCenter.default.post(name: NSNotification.Name("VoipTokenUpdated"), object: nil, userInfo: ["token": tokenHex])
  }

  public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    guard type == .voIP else { return }
    UserDefaults.standard.removeObject(forKey: "familycube_voip_token")
    NotificationCenter.default.post(name: NSNotification.Name("VoipTokenUpdated"), object: nil, userInfo: ["token": ""])
  }

  public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
    guard type == .voIP else { completion(); return }
    let callerName = (payload.dictionaryPayload["callerName"] as? String) ?? "Family Cube Reminder"
    let itemType = (payload.dictionaryPayload["itemType"] as? String) ?? ""
    let itemId = (payload.dictionaryPayload["itemId"] as? String) ?? ""
    let dueAtIso = (payload.dictionaryPayload["dueAtIso"] as? String) ?? ""
    let recipientName = payload.dictionaryPayload["recipientName"] as? String
    let notes = payload.dictionaryPayload["notes"] as? String
    let callUUID = UUID().uuidString
    UserDefaults.standard.set(itemType, forKey: "familycube_call_itemType_\\(callUUID)")
    UserDefaults.standard.set(itemId, forKey: "familycube_call_itemId_\\(callUUID)")
    UserDefaults.standard.set(callerName, forKey: "familycube_call_title_\\(callUUID)")
    if let recipientName = recipientName {
      UserDefaults.standard.set(recipientName, forKey: "familycube_call_recipient_\\(callUUID)")
    }
    if let notes = notes {
      UserDefaults.standard.set(notes, forKey: "familycube_call_notes_\\(callUUID)")
    }
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
    if (!contents.includes(CALLKIT_IMPORT)) {
      contents = contents.replace(PUSHKIT_IMPORT, `${PUSHKIT_IMPORT}\n${CALLKIT_IMPORT}`);
    }
    if (!contents.includes(AVFOUNDATION_IMPORT)) {
      contents = contents.replace(CALLKIT_IMPORT, `${CALLKIT_IMPORT}\n${AVFOUNDATION_IMPORT}`);
    }
    if (!contents.includes('CXCallObserverDelegate')) {
      contents = contents.replace(DELEGATE_CONFORMANCE_OLD, DELEGATE_CONFORMANCE_NEW);
      // Older builds may already have the PKPushRegistryDelegate-only
      // conformance from before this fix — upgrade that variant too.
      contents = contents.replace(
        'public class AppDelegate: ExpoAppDelegate, PKPushRegistryDelegate {',
        DELEGATE_CONFORMANCE_NEW,
      );
    }
    if (!contents.includes('var voipRegistry')) {
      contents = contents.replace(PROPERTY_MARKER, PROPERTY_ADDITION);
    } else if (!contents.includes('var callObserver')) {
      contents = contents.replace('var voipRegistry: PKPushRegistry?', 'var voipRegistry: PKPushRegistry?\n  var callObserver: CXCallObserver?\n  var surfacedCallUUIDs = Set<String>()');
    } else if (!contents.includes('var surfacedCallUUIDs')) {
      // callObserver property already applied by an older version of this
      // plugin/fix but missing the surfacedCallUUIDs de-dup tracking set —
      // insert just that piece.
      contents = contents.replace('var callObserver: CXCallObserver?', 'var callObserver: CXCallObserver?\n  var surfacedCallUUIDs = Set<String>()');
    }
    if (contents.includes('var surfacedCallUUIDs') && !contents.includes('let speechSynthesizer')) {
      // surfacedCallUUIDs already applied by an older version of this
      // plugin but missing the AVSpeechSynthesizer property added for the
      // native-only TTS fix — insert just that piece.
      contents = contents.replace(
        'var surfacedCallUUIDs = Set<String>()',
        'var surfacedCallUUIDs = Set<String>()\n  let speechSynthesizer = AVSpeechSynthesizer()',
      );
    }
    if (!contents.includes('RNCallKeep.setup(')) {
      contents = contents.replace(SETUP_MARKER, SETUP_ADDITION);
    } else if (!contents.includes('callObserver(_ callObserver: CXCallObserver')) {
      // setup() already applied by an older version of this plugin but
      // missing the CXCallObserver addition — insert just that piece rather
      // than re-running the whole block (which would duplicate setup()).
      contents = contents.replace(
        'let registry = PKPushRegistry(queue: DispatchQueue.main)\n    registry.delegate = self\n    registry.desiredPushTypes = [.voIP]\n    voipRegistry = registry\n',
        'let registry = PKPushRegistry(queue: DispatchQueue.main)\n    registry.delegate = self\n    registry.desiredPushTypes = [.voIP]\n    voipRegistry = registry\n\n    let observer = CXCallObserver()\n    observer.setDelegate(self, queue: nil)\n    callObserver = observer\n',
      );
      if (!contents.includes('func callObserver(_ callObserver: CXCallObserver')) {
        contents = contents.replace(
          '  // ── PushKit — VoIP call-reminder wake ──────────────────────────────────────',
          '  public func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {\n    let uuid = call.uuid.uuidString\n    if call.hasEnded {\n      UserDefaults.standard.removeObject(forKey: "familycube_call_itemType_\\(uuid)")\n      UserDefaults.standard.removeObject(forKey: "familycube_call_itemId_\\(uuid)")\n      surfacedCallUUIDs.remove(uuid)\n      return\n    }\n    guard call.hasConnected else { return }\n    guard !surfacedCallUUIDs.contains(uuid) else { return }\n    guard let itemType = UserDefaults.standard.string(forKey: "familycube_call_itemType_\\(uuid)"),\n          let itemId = UserDefaults.standard.string(forKey: "familycube_call_itemId_\\(uuid)") else {\n      return\n    }\n    surfacedCallUUIDs.insert(uuid)\n    UserDefaults.standard.set(uuid, forKey: "familycube_last_answered_call_uuid")\n    UserDefaults.standard.set(itemType, forKey: "familycube_last_answered_itemType")\n    UserDefaults.standard.set(itemId, forKey: "familycube_last_answered_itemId")\n    NotificationCenter.default.post(name: NSNotification.Name("FCCallAnswered"), object: nil,\n      userInfo: ["callUUID": uuid, "itemType": itemType, "itemId": itemId])\n  }\n\n  // ── PushKit — VoIP call-reminder wake ──────────────────────────────────────',
        );
      }
    } else if (!contents.includes('surfacedCallUUIDs.contains(uuid)')) {
      // setup() AND callObserver both already present, but callObserver
      // still has the old unguarded version (this plugin's own previously-
      // generated template, from before the hasEnded-clears-state /
      // surfacedCallUUIDs de-dup fix) — replace that exact old function
      // body in place. A literal string match (not a brace-counting regex)
      // — the function contains nested `guard ... else { }` blocks whose
      // inner closing braces are indistinguishable from the outer one to a
      // non-greedy [\s\S]*? pattern, which previously stopped at the wrong
      // `}` and silently left the old body untouched.
      const OLD_CALLOBSERVER_BODY = 'public func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {\n    guard call.hasConnected, !call.hasEnded else { return }\n    let uuid = call.uuid.uuidString\n    guard let itemType = UserDefaults.standard.string(forKey: "familycube_call_itemType_\\(uuid)"),\n          let itemId = UserDefaults.standard.string(forKey: "familycube_call_itemId_\\(uuid)") else {\n      return\n    }\n    UserDefaults.standard.set(uuid, forKey: "familycube_last_answered_call_uuid")\n    UserDefaults.standard.set(itemType, forKey: "familycube_last_answered_itemType")\n    UserDefaults.standard.set(itemId, forKey: "familycube_last_answered_itemId")\n    NotificationCenter.default.post(name: NSNotification.Name("FCCallAnswered"), object: nil,\n      userInfo: ["callUUID": uuid, "itemType": itemType, "itemId": itemId])\n  }';
      const NEW_CALLOBSERVER_BODY = 'public func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {\n    let uuid = call.uuid.uuidString\n    if call.hasEnded {\n      UserDefaults.standard.removeObject(forKey: "familycube_call_itemType_\\(uuid)")\n      UserDefaults.standard.removeObject(forKey: "familycube_call_itemId_\\(uuid)")\n      surfacedCallUUIDs.remove(uuid)\n      return\n    }\n    guard call.hasConnected else { return }\n    guard !surfacedCallUUIDs.contains(uuid) else { return }\n    guard let itemType = UserDefaults.standard.string(forKey: "familycube_call_itemType_\\(uuid)"),\n          let itemId = UserDefaults.standard.string(forKey: "familycube_call_itemId_\\(uuid)") else {\n      return\n    }\n    surfacedCallUUIDs.insert(uuid)\n    UserDefaults.standard.set(uuid, forKey: "familycube_last_answered_call_uuid")\n    UserDefaults.standard.set(itemType, forKey: "familycube_last_answered_itemType")\n    UserDefaults.standard.set(itemId, forKey: "familycube_last_answered_itemId")\n    NotificationCenter.default.post(name: NSNotification.Name("FCCallAnswered"), object: nil,\n      userInfo: ["callUUID": uuid, "itemType": itemType, "itemId": itemId])\n  }';
      if (contents.includes(OLD_CALLOBSERVER_BODY)) {
        contents = contents.replace(OLD_CALLOBSERVER_BODY, NEW_CALLOBSERVER_BODY);
      }
    }
    if (!contents.includes('familycube_call_itemType_')) {
      contents = contents.replace(
        'let callUUID = UUID().uuidString\n    RNCallKeep.reportNewIncomingCall(',
        'let callUUID = UUID().uuidString\n    UserDefaults.standard.set(itemType, forKey: "familycube_call_itemType_\\(callUUID)")\n    UserDefaults.standard.set(itemId, forKey: "familycube_call_itemId_\\(callUUID)")\n    RNCallKeep.reportNewIncomingCall(',
      );
    }
    // Upgrade path: didReceiveIncomingPushWith already caches itemType/
    // itemId (the branch above) but not yet the title/recipient/notes TTS
    // needs — insert those three cache writes right after the existing
    // itemId one, and read the two new payload fields at the top of the
    // function alongside the existing ones.
    if (contents.includes('familycube_call_itemType_') && !contents.includes('familycube_call_title_')) {
      contents = contents.replace(
        'let dueAtIso = (payload.dictionaryPayload["dueAtIso"] as? String) ?? ""',
        'let dueAtIso = (payload.dictionaryPayload["dueAtIso"] as? String) ?? ""\n    let recipientName = payload.dictionaryPayload["recipientName"] as? String\n    let notes = payload.dictionaryPayload["notes"] as? String',
      );
      contents = contents.replace(
        'UserDefaults.standard.set(itemId, forKey: "familycube_call_itemId_\\(callUUID)")\n    RNCallKeep.reportNewIncomingCall(',
        'UserDefaults.standard.set(itemId, forKey: "familycube_call_itemId_\\(callUUID)")\n    UserDefaults.standard.set(callerName, forKey: "familycube_call_title_\\(callUUID)")\n    if let recipientName = recipientName {\n      UserDefaults.standard.set(recipientName, forKey: "familycube_call_recipient_\\(callUUID)")\n    }\n    if let notes = notes {\n      UserDefaults.standard.set(notes, forKey: "familycube_call_notes_\\(callUUID)")\n    }\n    RNCallKeep.reportNewIncomingCall(',
      );
    }
    // Upgrade path: callObserver's hasEnded branch already clears
    // itemType/itemId but not yet the newer title/recipient/notes keys or
    // stops any in-flight speech — insert those right after the existing
    // itemId cleanup.
    if (contents.includes('familycube_call_title_') && contents.includes('UserDefaults.standard.removeObject(forKey: "familycube_call_itemId_\\(uuid)")') && !contents.includes('UserDefaults.standard.removeObject(forKey: "familycube_call_title_\\(uuid)")')) {
      contents = contents.replace(
        'UserDefaults.standard.removeObject(forKey: "familycube_call_itemId_\\(uuid)")\n      surfacedCallUUIDs.remove(uuid)',
        'UserDefaults.standard.removeObject(forKey: "familycube_call_itemId_\\(uuid)")\n      UserDefaults.standard.removeObject(forKey: "familycube_call_title_\\(uuid)")\n      UserDefaults.standard.removeObject(forKey: "familycube_call_recipient_\\(uuid)")\n      UserDefaults.standard.removeObject(forKey: "familycube_call_notes_\\(uuid)")\n      speechSynthesizer.stopSpeaking(at: .immediate)\n      surfacedCallUUIDs.remove(uuid)',
      );
    }
    // Upgrade path: callObserver already posts FCCallAnswered but doesn't
    // yet call speakReminder — the actual TTS fix. Insert the call right
    // after the notification post, and append the speakReminder function
    // itself once, right after callObserver's closing brace.
    if (contents.includes('NotificationCenter.default.post(name: NSNotification.Name("FCCallAnswered")') && !contents.includes('speakReminder(callUUID:')) {
      contents = contents.replace(
        'NotificationCenter.default.post(name: NSNotification.Name("FCCallAnswered"), object: nil,\n      userInfo: ["callUUID": uuid, "itemType": itemType, "itemId": itemId])\n  }',
        'NotificationCenter.default.post(name: NSNotification.Name("FCCallAnswered"), object: nil,\n      userInfo: ["callUUID": uuid, "itemType": itemType, "itemId": itemId])\n\n    speakReminder(callUUID: uuid, itemType: itemType)\n  }\n' + SPEAK_REMINDER_FUNCTION,
      );
    }
    // Upgrade path for installs that already have pushRegistry(didUpdate:)
    // from before this fix — it only ever posted the live
    // NotificationCenter event, never wrote the UserDefaults key
    // FCVoipToken.swift's getCachedToken() reads. Confirmed live on a real
    // device: getCachedToken() always resolved {hasToken:false}, even on a
    // session whose voip_push_tokens DB row was already populated — that
    // row could only have arrived via the live notification's lucky
    // timing on some earlier cold launch, never via this "reliable"
    // fallback path the surrounding comments describe. Breaks re-
    // registration after a profile switch on a shared device, since the
    // JS effect that re-runs on activeMemberId change relies on
    // getCachedToken() to re-deliver the same physical token.
    if (!contents.includes('UserDefaults.standard.set(tokenHex, forKey: "familycube_voip_token")')) {
      const OLD_DIDUPDATE = 'public func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {\n    guard type == .voIP else { return }\n    let tokenHex = pushCredentials.token.map { String(format: "%02x", $0) }.joined()\n    NotificationCenter.default.post(name: NSNotification.Name("VoipTokenUpdated"), object: nil, userInfo: ["token": tokenHex])\n  }';
      const NEW_DIDUPDATE = 'public func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {\n    guard type == .voIP else { return }\n    let tokenHex = pushCredentials.token.map { String(format: "%02x", $0) }.joined()\n    UserDefaults.standard.set(tokenHex, forKey: "familycube_voip_token")\n    NotificationCenter.default.post(name: NSNotification.Name("VoipTokenUpdated"), object: nil, userInfo: ["token": tokenHex])\n  }';
      if (contents.includes(OLD_DIDUPDATE)) {
        contents = contents.replace(OLD_DIDUPDATE, NEW_DIDUPDATE);
      }
      const OLD_DIDINVALIDATE = 'public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {\n    guard type == .voIP else { return }\n    NotificationCenter.default.post(name: NSNotification.Name("VoipTokenUpdated"), object: nil, userInfo: ["token": ""])\n  }';
      const NEW_DIDINVALIDATE = 'public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {\n    guard type == .voIP else { return }\n    UserDefaults.standard.removeObject(forKey: "familycube_voip_token")\n    NotificationCenter.default.post(name: NSNotification.Name("VoipTokenUpdated"), object: nil, userInfo: ["token": ""])\n  }';
      if (contents.includes(OLD_DIDINVALIDATE)) {
        contents = contents.replace(OLD_DIDINVALIDATE, NEW_DIDINVALIDATE);
      }
    }

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
