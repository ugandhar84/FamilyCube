import Expo
import FirebaseCore
import React
import ReactAppDependencyProvider
import PushKit
import CallKit
import AVFoundation

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate, PKPushRegistryDelegate, CXCallObserverDelegate, AVSpeechSynthesizerDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
  var voipRegistry: PKPushRegistry?
  var callObserver: CXCallObserver?
  var surfacedCallUUIDs = Set<String>()
  let speechSynthesizer = AVSpeechSynthesizer()
  static let maxRepeats: Int = 3
  static let repeatGapSeconds: TimeInterval = 2.0

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
// @generated begin @react-native-firebase/app-didFinishLaunchingWithOptions - expo prebuild (DO NOT MODIFY) sync-10e8520570672fd76b2403b7e1e27f5198a6349a
FirebaseApp.configure()
// @generated end @react-native-firebase/app-didFinishLaunchingWithOptions
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    RNCallKeep.setup([
      "appName": "Family Cube",
      "supportsVideo": false,
      "maximumCallGroups": "1",
      "maximumCallsPerCallGroup": "1",
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

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }

  public func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {
    let uuid = call.uuid.uuidString
    if call.hasEnded {
      if surfacedCallUUIDs.contains(uuid) {
        UserDefaults.standard.removeObject(forKey: "familycube_call_itemType_\(uuid)")
        UserDefaults.standard.removeObject(forKey: "familycube_call_itemId_\(uuid)")
        UserDefaults.standard.removeObject(forKey: "familycube_call_title_\(uuid)")
        UserDefaults.standard.removeObject(forKey: "familycube_call_recipient_\(uuid)")
        UserDefaults.standard.removeObject(forKey: "familycube_call_notes_\(uuid)")
        speechSynthesizer.stopSpeaking(at: .immediate)
        surfacedCallUUIDs.remove(uuid)
      }
    } else if !call.isOutgoing && !surfacedCallUUIDs.contains(uuid) {
      surfacedCallUUIDs.insert(uuid)
      let itemType = UserDefaults.standard.string(forKey: "familycube_call_itemType_\(uuid)") ?? "reminder"
      if let it = UserDefaults.standard.string(forKey: "familycube_call_itemType_\(uuid)"),
         let id = UserDefaults.standard.string(forKey: "familycube_call_itemId_\(uuid)") {
        UserDefaults.standard.set(uuid, forKey: "familycube_last_answered_call_uuid")
        UserDefaults.standard.set(it,   forKey: "familycube_last_answered_itemType")
        UserDefaults.standard.set(id,   forKey: "familycube_last_answered_itemId")
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
        self?.speakReminder(callUUID: uuid, itemType: itemType)
      }
    }
  }

  private func speakReminder(callUUID: String, itemType: String) {
    let title         = UserDefaults.standard.string(forKey: "familycube_call_title_\(callUUID)") ?? "your reminder"
    let recipientName = UserDefaults.standard.string(forKey: "familycube_call_recipient_\(callUUID)")
    let notes         = UserDefaults.standard.string(forKey: "familycube_call_notes_\(callUUID)")

    var greetingPart = ""
    if let recipientName = recipientName, !recipientName.isEmpty {
      greetingPart = "Hi \(recipientName), this is your Family Cube reminder — "
    } else {
      greetingPart = "This is your Family Cube reminder — "
    }

    let lowerTitle = title.lowercased()
    let isMedication = lowerTitle.contains("medic") || lowerTitle.contains("pill") || lowerTitle.contains("dose") || lowerTitle.contains("vitamin")
    let chorePhrasings = isMedication
      ? ["it's time to take \(title).", "don't forget \(title).", "time for \(title)."]
      : ["don't forget: \(title).", "it's time for \(title).", "you've got \(title) coming up."]
    let phrasingIndex = abs(title.hashValue) % chorePhrasings.count
    let mainSentence = greetingPart + (
      itemType == "event"
        ? "it's time for \(title)."
        : chorePhrasings[phrasingIndex]
    )
    var segments: [String] = [mainSentence]
    if let notes = notes, !notes.isEmpty {
      segments.append("Also, \(notes)")
    }

    let languageCode = AVSpeechSynthesisVoice.currentLanguageCode()
    let candidates = AVSpeechSynthesisVoice.speechVoices().filter { $0.language == languageCode }
    let voice = candidates.first(where: { $0.quality == .premium })
      ?? candidates.first(where: { $0.quality == .enhanced })
      ?? AVSpeechSynthesisVoice(language: languageCode)

    for (index, segment) in segments.enumerated() {
      let utterance = AVSpeechUtterance(string: segment)
      utterance.voice = voice
      utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.97
      utterance.pitchMultiplier = index == 0 ? 1.0 : 0.97
      utterance.postUtteranceDelay = index < segments.count - 1 ? 0.45 : 0
      speechSynthesizer.speak(utterance)
    }
  }

  public func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    guard type == .voIP else { return }
    let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    UserDefaults.standard.set(token, forKey: "familycube_voip_token")
    NotificationCenter.default.post(name: NSNotification.Name("VoipTokenUpdated"), object: nil, userInfo: ["token": token])
    RNCallKeep.didUpdatePush(credentials: pushCredentials)
  }

  public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    guard type == .voIP else { return }
    UserDefaults.standard.removeObject(forKey: "familycube_voip_token")
  }

  public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
    guard type == .voIP else { completion(); return }
    let data = payload.dictionaryPayload
    guard let callUUID = data["callUUID"] as? String ?? (data["aps"] as? [String: Any])?["callUUID"] as? String
    else { completion(); return }

    let callerName    = data["callerName"]    as? String ?? "Family Cube"
    let itemType      = data["itemType"]      as? String ?? "reminder"
    let itemId        = data["itemId"]        as? String ?? ""
    let dueAtIso      = data["dueAtIso"]      as? String ?? ""
    let recipientName = data["recipientName"] as? String
    let notes         = data["notes"]         as? String

    let defaults = UserDefaults.standard
    defaults.set(itemType,  forKey: "familycube_call_itemType_\(callUUID)")
    defaults.set(itemId,    forKey: "familycube_call_itemId_\(callUUID)")
    defaults.set(dueAtIso,  forKey: "familycube_call_dueAt_\(callUUID)")
    defaults.set(callerName, forKey: "familycube_call_title_\(callUUID)")
    if let recipientName = recipientName {
      defaults.set(recipientName, forKey: "familycube_call_recipient_\(callUUID)")
    }
    if let notes = notes {
      defaults.set(notes, forKey: "familycube_call_notes_\(callUUID)")
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
      payload: data as [AnyHashable: Any],
      withCompletionHandler: completion
    )
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
