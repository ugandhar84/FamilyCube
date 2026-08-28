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
  var callObserver = CXCallObserver()
  var speechSynthesizer = AVSpeechSynthesizer()
  var pendingCallUUID: String?
  var pendingItemType: String?
  var pendingCallHandled = false
  var repeatCount: [String: Int] = [:]
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

    let voipRegistry = PKPushRegistry(queue: DispatchQueue.main)
    voipRegistry.delegate = self
    voipRegistry.desiredPushTypes = [.voIP]

    callObserver.setDelegate(self, queue: nil)
    speechSynthesizer.delegate = self

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
    guard let uuid = pendingCallUUID, call.uuid.uuidString == uuid else { return }
    if call.hasEnded {
      pendingCallUUID = nil
      pendingItemType = nil
      pendingCallHandled = false
    } else if !call.isOutgoing && !pendingCallHandled {
      pendingCallHandled = true
      guard let itemType = pendingItemType else { return }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
        self?.speakReminder(callUUID: uuid, itemType: itemType)
      }
      let defaults = UserDefaults.standard
      if let it = defaults.string(forKey: "familycube_call_itemType_\(uuid)"),
         let id = defaults.string(forKey: "familycube_call_itemId_\(uuid)") {
        defaults.set(uuid, forKey: "familycube_last_answered_call_uuid")
        defaults.set(it,   forKey: "familycube_last_answered_itemType")
        defaults.set(id,   forKey: "familycube_last_answered_itemId")
      }
    }
  }

  private func dayPartPhrase(for dueAtIso: String) -> String {
    let df = ISO8601DateFormatter()
    df.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    var date = df.date(from: dueAtIso)
    if date == nil {
      let df2 = ISO8601DateFormatter()
      df2.formatOptions = [.withInternetDateTime]
      date = df2.date(from: dueAtIso)
    }
    guard let d = date else { return "soon" }
    let hour = Calendar.current.component(.hour, from: d)
    switch hour {
    case 5..<12:  return "this morning"
    case 12..<17: return "this afternoon"
    case 17..<21: return "this evening"
    default:      return "tonight"
    }
  }

  private func speakReminder(callUUID: String, itemType: String) {
    let count = repeatCount[callUUID, default: 0]
    guard count < AppDelegate.maxRepeats else { return }
    repeatCount[callUUID] = count + 1

    let defaults = UserDefaults.standard
    let dueAt = defaults.string(forKey: "familycube_call_dueAt_\(callUUID)") ?? ""
    let phrase = dayPartPhrase(for: dueAt)
    let label: String
    switch itemType {
    case "quest":  label = "chore reminder"
    case "event":  label = "event reminder"
    default:       label = "family reminder"
    }
    let text = "Hey! You have a \(label) due \(phrase). Check the Family Cube app."
    let utterance = AVSpeechUtterance(string: text)
    utterance.rate = 0.45
    utterance.pitchMultiplier = 1.1
    utterance.volume = 1.0
    utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
    speechSynthesizer.speak(utterance)
  }

  public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    guard let uuid = pendingCallUUID, let itemType = pendingItemType else { return }
    let count = repeatCount[uuid, default: 0]
    guard count < AppDelegate.maxRepeats else { return }
    DispatchQueue.main.asyncAfter(deadline: .now() + AppDelegate.repeatGapSeconds) { [weak self] in
      self?.speakReminder(callUUID: uuid, itemType: itemType)
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

    let callerName = data["callerName"] as? String ?? "Family Cube"
    let itemType   = data["itemType"]   as? String ?? "reminder"
    let itemId     = data["itemId"]     as? String ?? ""
    let dueAtIso   = data["dueAtIso"]   as? String ?? ""

    let defaults = UserDefaults.standard
    defaults.set(itemType, forKey: "familycube_call_itemType_\(callUUID)")
    defaults.set(itemId,   forKey: "familycube_call_itemId_\(callUUID)")
    defaults.set(dueAtIso, forKey: "familycube_call_dueAt_\(callUUID)")

    pendingCallUUID    = callUUID
    pendingItemType    = itemType
    pendingCallHandled = false
    repeatCount[callUUID] = 0

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
