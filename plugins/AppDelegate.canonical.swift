import Expo
import FirebaseCore
import React
import ReactAppDependencyProvider
import PushKit
import CallKit
import AVFoundation

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate, PKPushRegistryDelegate, CXCallObserverDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
  var voipRegistry: PKPushRegistry?
  var callObserver: CXCallObserver?
  var surfacedCallUUIDs = Set<String>()
  let speechSynthesizer = AVSpeechSynthesizer()

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
        let d = UserDefaults.standard
        for key in ["itemType","itemId","dueAtIso","title","recipient","notes","location","category"] {
          d.removeObject(forKey: "familycube_call_\(key)_\(uuid)")
        }
        speechSynthesizer.stopSpeaking(at: .immediate)
        surfacedCallUUIDs.remove(uuid)
      }
    } else if !call.isOutgoing && call.hasConnected && !surfacedCallUUIDs.contains(uuid) {
      // callChanged fires on EVERY state transition of a call, not just
      // answered — for an incoming call that includes the initial
      // "ringing" state, which arrives as its own callChanged event before
      // any answer happens. Without checking hasConnected, that first
      // (ringing) event satisfied !isOutgoing && !surfacedCallUUIDs and got
      // marked "surfaced" immediately — so by the time the real answer
      // transition fired moments later, surfacedCallUUIDs already
      // contained this uuid and speakReminder() never ran at all
      // (confirmed live: the call rang correctly, but no voice ever
      // played on answer). hasConnected is false while ringing and only
      // becomes true once actually answered — gating on it means this
      // branch now only ever fires on the real answer.
      //
      // CXCallObserver also reports EVERY call on the device, not just
      // this app's own VoIP reminder calls — a genuine incoming call from
      // anyone (a real person, a robocall, anything) hits this exact
      // branch too. Without the itemId guard below, the itemType ??
      // "reminder" fallback meant speakReminder() ran for real, unrelated
      // phone calls the instant they were answered, speaking "This is a
      // reminder for..." over someone else's actual call (confirmed live).
      // itemId only ever gets written to UserDefaults by THIS app's own
      // pushRegistry(didReceiveIncomingPushWith:) handler above — its
      // absence is the reliable signal this call has nothing to do with
      // Family Cube.
      guard UserDefaults.standard.string(forKey: "familycube_call_itemId_\(uuid)") != nil else {
        surfacedCallUUIDs.insert(uuid)
        return
      }
      surfacedCallUUIDs.insert(uuid)
      let itemType = UserDefaults.standard.string(forKey: "familycube_call_itemType_\(uuid)") ?? "reminder"
      let itemId   = UserDefaults.standard.string(forKey: "familycube_call_itemId_\(uuid)")
      let dueAtIso = UserDefaults.standard.string(forKey: "familycube_call_dueAtIso_\(uuid)")
      if let id = itemId {
        UserDefaults.standard.set(uuid, forKey: "familycube_last_answered_call_uuid")
        UserDefaults.standard.set(itemType, forKey: "familycube_last_answered_itemType")
        UserDefaults.standard.set(id,   forKey: "familycube_last_answered_itemId")
      }
      // Reaching this branch (non-outgoing, not yet surfaced, not hasEnded)
      // is CallKit's answered transition — tells the JS side (which holds
      // the actual auth session; the native side makes no network calls of
      // its own, matching the VoipTokenUpdated pattern above) to mark this
      // reminder answered server-side, so call-reminder-sweeper's missed-
      // call follow-up never fires for a call the person actually picked up.
      if let id = itemId, let due = dueAtIso {
        NotificationCenter.default.post(
          name: NSNotification.Name("CallReminderAnswered"),
          object: nil,
          userInfo: ["itemType": itemType, "itemId": id, "dueAtIso": due]
        )
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
        self?.speakReminder(callUUID: uuid, itemType: itemType)
      }
    }
  }

  // Returns a greeting time-of-day phrase based on the stored dueAtIso.
  // Used only when the call comes through the answered path (callObserver)
  // so the device's local clock is already running — falls back to an
  // empty string (no "good morning/afternoon/evening" prefix) rather than
  // a stale or wrong phrase if the ISO string is unparseable.
  private func timeOfDayGreeting() -> String {
    let hour = Calendar.current.component(.hour, from: Date())
    switch hour {
    case 5..<12:  return "Good morning"
    case 12..<18: return "Good afternoon"
    case 18..<22: return "Good evening"
    default:      return "Hey"
    }
  }

  private func speakReminder(callUUID: String, itemType: String) {
    let d             = UserDefaults.standard
    let title         = d.string(forKey: "familycube_call_title_\(callUUID)") ?? "your reminder"
    let recipientName = d.string(forKey: "familycube_call_recipient_\(callUUID)")
    let notes         = d.string(forKey: "familycube_call_notes_\(callUUID)")
    let location      = d.string(forKey: "familycube_call_location_\(callUUID)")
    let category      = d.string(forKey: "familycube_call_category_\(callUUID)") ?? ""
    let dueAtIso      = d.string(forKey: "familycube_call_dueAtIso_\(callUUID)") ?? ""

    // ── Time-of-day aware greeting ─────────────────────────────────────────
    let greeting = timeOfDayGreeting()
    let name = recipientName.flatMap { $0.isEmpty ? nil : $0 }
    let greetingLine: String
    if let name = name {
      greetingLine = "\(greeting) \(name)."
    } else {
      greetingLine = "\(greeting)."
    }

    // ── Minutes until due (urgency) ────────────────────────────────────────
    var minutesUntilDue: Int? = nil
    let df = ISO8601DateFormatter()
    df.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let due = df.date(from: dueAtIso) ?? ISO8601DateFormatter().date(from: dueAtIso) {
      let mins = Int(due.timeIntervalSinceNow / 60)
      if mins >= 0 && mins <= 60 { minutesUntilDue = mins }
    }

    let urgencyPhrase: String
    if let mins = minutesUntilDue {
      if mins <= 2 { urgencyPhrase = "right now" }
      else if mins <= 10 { urgencyPhrase = "in about \(mins) minutes" }
      else { urgencyPhrase = "soon" }
    } else {
      urgencyPhrase = ""
    }

    // ── Category + title → main sentence ──────────────────────────────────
    let lowerTitle    = title.lowercased()
    let lowerCategory = category.lowercased()

    // Detect medication regardless of category (chore title overrides category)
    let isMedication = lowerTitle.contains("medic") || lowerTitle.contains("pill") ||
                       lowerTitle.contains("dose")  || lowerTitle.contains("vitamin") ||
                       lowerTitle.contains("drug")  || lowerTitle.contains("prescription")

    // Common verb prefixes already in the title — strip them so we don't
    // say "Time to clean your room" when the title IS "Clean your room"
    let verbPrefixes = ["clean ", "wash ", "feed ", "take ", "do ", "make ",
                        "pick up ", "drop off ", "water ", "check ", "finish ",
                        "pack ", "prepare ", "study ", "complete ", "pay "]
    let titleStartsWithVerb = verbPrefixes.contains(where: { lowerTitle.hasPrefix($0) })

    let mainLine: String
    if itemType == "chore" {
      if isMedication {
        let medPhrasings = ["It's time to take \(title).",
                            "Don't forget \(title).",
                            "Time for \(title)."]
        mainLine = medPhrasings[abs(title.hashValue) % medPhrasings.count]
      } else if titleStartsWithVerb {
        // Title already reads as a command — just wrap it
        let chorePhrasings = ["Time to \(title.prefix(1).lowercased() + title.dropFirst()).",
                              "Don't forget to \(lowerTitle).",
                              "You've got \(title) on your list."]
        mainLine = chorePhrasings[abs(title.hashValue) % chorePhrasings.count]
      } else {
        let chorePhrasings = ["Don't forget: \(title).",
                              "It's time for \(title).",
                              "You've got \(title) coming up."]
        mainLine = chorePhrasings[abs(title.hashValue) % chorePhrasings.count]
      }
    } else {
      // Event — category-specific phrasing
      switch lowerCategory {
      case "medical":
        let u = urgencyPhrase.isEmpty ? "" : " \(urgencyPhrase)"
        mainLine = "You have a medical appointment — \(title)\(u)."
      case "sports":
        let u = urgencyPhrase.isEmpty ? "" : " \(urgencyPhrase)"
        mainLine = "Get ready for \(title)\(u)."
      case "study":
        let u = urgencyPhrase.isEmpty ? "" : " \(urgencyPhrase)"
        mainLine = "Time to get your books out — \(title)\(u)."
      case "birthday":
        mainLine = "Don't forget — it's \(title) today!"
      case "ride":
        let u = urgencyPhrase.isEmpty ? "" : " \(urgencyPhrase)"
        mainLine = "Your ride for \(title) is\(u.isEmpty ? " coming up" : u)."
      case "work":
        let u = urgencyPhrase.isEmpty ? "" : " \(urgencyPhrase)"
        mainLine = "Work reminder: \(title)\(u)."
      default:
        let u = urgencyPhrase.isEmpty ? "" : " \(urgencyPhrase)"
        mainLine = "It's time for \(title)\(u)."
      }
    }

    // ── Notes / location as a natural aside ───────────────────────────────
    var asideLine: String? = nil
    let loc  = location.flatMap { $0.isEmpty ? nil : $0 }
    let note = notes.flatMap    { $0.isEmpty ? nil : $0 }
    if let loc = loc, let note = note {
      asideLine = "Also — \(loc). \(note)."
    } else if let loc = loc {
      asideLine = "It's at \(loc)."
    } else if let note = note {
      asideLine = "Also — \(note)."
    }

    // ── Build segment list ─────────────────────────────────────────────────
    var segments: [String] = ["\(greetingLine) \(mainLine)"]
    if let aside = asideLine { segments.append(aside) }

    // ── Voice selection — prefer Siri premium/enhanced over compact ────────
    let langCode = AVSpeechSynthesisVoice.currentLanguageCode()
    let voices = AVSpeechSynthesisVoice.speechVoices().filter { $0.language == langCode }
    let voice = voices.first(where: { $0.quality == .premium })
      ?? voices.first(where: { $0.quality == .enhanced })
      ?? AVSpeechSynthesisVoice(language: langCode)

    for (i, segment) in segments.enumerated() {
      let u = AVSpeechUtterance(string: segment)
      u.voice = voice
      u.rate = AVSpeechUtteranceDefaultSpeechRate * 0.97
      u.pitchMultiplier = i == 0 ? 1.0 : 0.97
      u.postUtteranceDelay = i < segments.count - 1 ? 0.45 : 0
      speechSynthesizer.speak(u)
    }
  }

  public func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    guard type == .voIP else { return }
    let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    UserDefaults.standard.set(token, forKey: "familycube_voip_token")
    NotificationCenter.default.post(name: NSNotification.Name("VoipTokenUpdated"), object: nil, userInfo: ["token": token])
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
    let category      = data["category"]      as? String
    let notes         = data["notes"]         as? String
    let location      = data["location"]      as? String

    let d = UserDefaults.standard
    d.set(itemType,   forKey: "familycube_call_itemType_\(callUUID)")
    d.set(itemId,     forKey: "familycube_call_itemId_\(callUUID)")
    d.set(dueAtIso,   forKey: "familycube_call_dueAtIso_\(callUUID)")
    d.set(callerName, forKey: "familycube_call_title_\(callUUID)")
    if let v = recipientName { d.set(v, forKey: "familycube_call_recipient_\(callUUID)") }
    if let v = category      { d.set(v, forKey: "familycube_call_category_\(callUUID)") }
    if let v = notes         { d.set(v, forKey: "familycube_call_notes_\(callUUID)") }
    if let v = location      { d.set(v, forKey: "familycube_call_location_\(callUUID)") }

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
