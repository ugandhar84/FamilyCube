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
  // Calls currently ringing/connected — the repeat-speak loop checks this
  // before each replay and stops the instant the call ends, so it never
  // fires into dead air or a call the person already hung up.
  var activeCallUUIDs = Set<String>()
  // How many more times to repeat the reminder for a given call, keyed by
  // uuid — decremented in speechSynthesizer(_:didFinish:) once the current
  // pass's utterances have ALL actually finished playing (didFinish fires
  // once per utterance, so this only reacts on the last one of a pass).
  var repeatsRemaining: [String: Int] = [:]
  var repeatGapSeconds: [String: TimeInterval] = [:]
  // Set on the LAST utterance of each pass so didFinish knows that firing
  // means "the whole pass is done," not just "one segment of it is."
  var lastUtterancePerCall: [String: AVSpeechUtterance] = [:]
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
    // NSUUID always re-serializes .uuidString as UPPERCASE, regardless of
    // the case it was originally parsed from — but the UserDefaults keys
    // below were written using the RAW lowercase string straight from the
    // push payload's JSON (crypto.randomUUID() in apns.ts produces
    // lowercase hex). Without lowercasing here, every lookup below was a
    // case-sensitive miss against a key that does exist, so the itemId
    // guard treated every one of this app's own reminder calls as an
    // unrelated real call and silently returned — confirmed as the actual
    // cause of "call rings, no TTS voice" (hasConnected fix alone did not
    // resolve it, because this lookup never found the app's own itemId).
    let uuid = call.uuid.uuidString.lowercased()
    if call.hasEnded {
      activeCallUUIDs.remove(uuid)
      repeatsRemaining.removeValue(forKey: uuid)
      repeatGapSeconds.removeValue(forKey: uuid)
      lastUtterancePerCall.removeValue(forKey: uuid)
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
      activeCallUUIDs.insert(uuid)
      // 3 total plays, 3 seconds of silence between each — matches the
      // original tuned behavior that existed before an earlier cleanup
      // pass mistakenly deleted the whole repeat mechanism believing it
      // wasn't part of "the real implementation." It was real; restored
      // here using AVSpeechSynthesizerDelegate's didFinish callback (see
      // below) instead of the previous word-count time estimate, since
      // didFinish tells us exactly when speech actually completes.
      repeatsRemaining[uuid] = 3
      repeatGapSeconds[uuid] = 3.0
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
        self?.speakReminder(callUUID: uuid, itemType: itemType)
      }
    }
  }

  // Fires once per utterance. Only the LAST utterance of a pass is tracked
  // in lastUtterancePerCall, so this only reacts when an entire pass (all
  // segments: greeting+main line, optional notes/location aside) has
  // actually finished playing — not after just the first segment.
  public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    guard let (uuid, _) = lastUtterancePerCall.first(where: { $0.value === utterance }) else { return }
    lastUtterancePerCall.removeValue(forKey: uuid)
    let remaining = (repeatsRemaining[uuid] ?? 1) - 1
    repeatsRemaining[uuid] = remaining
    guard remaining > 0, activeCallUUIDs.contains(uuid) else {
      repeatsRemaining.removeValue(forKey: uuid)
      repeatGapSeconds.removeValue(forKey: uuid)
      return
    }
    let gap = repeatGapSeconds[uuid] ?? 3.0
    let itemType = UserDefaults.standard.string(forKey: "familycube_call_itemType_\(uuid)") ?? "reminder"
    DispatchQueue.main.asyncAfter(deadline: .now() + gap) { [weak self] in
      guard let self = self, self.activeCallUUIDs.contains(uuid) else { return }
      self.speakReminder(callUUID: uuid, itemType: itemType)
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
    default:      return "Hi"
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
                        "pack ", "prepare ", "study ", "complete ", "pay ",
                        "tidy ", "organize ", "empty ", "put away ", "vacuum ",
                        "sweep ", "mop ", "walk ", "brush ", "fold ", "load ",
                        "unload ", "throw out "]
    let matchedVerbPrefix = verbPrefixes.first(where: { lowerTitle.hasPrefix($0) })
    let titleStartsWithVerb = matchedVerbPrefix != nil

    let mainLine: String
    if itemType == "chore" {
      if isMedication {
        // Medication titles that ALSO start with a verb (e.g. "Take medicine",
        // "Pick up prescription") used to double up: "It's time to take Take
        // medicine." / "It's time to take Pick up prescription." — strip the
        // matched verb prefix first so the wrapping phrase is the only verb.
        let medTitle = matchedVerbPrefix.map { String(title.dropFirst($0.count)) } ?? title
        let medPhrasings = ["It's time to take \(medTitle).",
                            "Don't forget \(medTitle).",
                            "Time for \(medTitle)."]
        mainLine = medPhrasings[abs(title.hashValue) % medPhrasings.count]
      } else if titleStartsWithVerb {
        // Title already reads as a command — just wrap it. Lowercase the
        // WHOLE remainder, not just the first character — "Do Homework"
        // used to become "Time to do Homework." (capitalized "Homework"
        // mid-sentence) since only title[0] was folded.
        let chorePhrasings = ["Time to \(lowerTitle).",
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
        // Strip a redundant leading "ride to"/"ride for"/"ride" from the
        // title — "Ride to soccer" used to produce "Your ride for Ride to
        // soccer is..." since the category word and the title's own first
        // word said the same thing.
        var rideTitle = title
        for prefix in ["ride to ", "ride for ", "ride "] {
          if lowerTitle.hasPrefix(prefix) { rideTitle = String(title.dropFirst(prefix.count)); break }
        }
        let u = urgencyPhrase.isEmpty ? "" : " \(urgencyPhrase)"
        mainLine = "Your ride for \(rideTitle) is\(u.isEmpty ? " coming up" : u)."
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
    // .premium/.enhanced only exist on-device if the user has actually
    // downloaded that voice pack (Settings > Accessibility > Spoken
    // Content > Voices) — a device without one installed silently falls
    // through every candidate below to the flat, robotic default compact
    // voice. That's a device setting, not something this code can force;
    // logging which tier we actually got makes that distinguishable from a
    // real code regression next time someone reports "sounds robotic."
    let langCode = AVSpeechSynthesisVoice.currentLanguageCode()
    let voices = AVSpeechSynthesisVoice.speechVoices().filter { $0.language == langCode }
    let voice = voices.first(where: { $0.quality == .premium })
      ?? voices.first(where: { $0.quality == .enhanced })
      ?? AVSpeechSynthesisVoice(language: langCode)
    #if DEBUG
    let qualityLabel = voice.map { v -> String in
      switch v.quality {
      case .premium: return "premium"
      case .enhanced: return "enhanced"
      default: return "default/compact"
      }
    } ?? "none"
    print("[FamilyCube TTS] using voice quality: \(qualityLabel) (\(voice?.name ?? "nil")) — download an Enhanced/Premium voice in Settings > Accessibility > Spoken Content > Voices if this says default/compact")
    #endif

    // Live-reported: the repeat loop played once then went silent even
    // though the call stayed connected. RNCallKeep activates the
    // AVAudioSession exactly once, when the call is first answered
    // (provider:didActivateAudioSession: in RNCallKeep.m) — nothing
    // re-asserts it afterward. If iOS reclaims/reconfigures the shared
    // audio session in the ~3s gap between repeats (a real possibility
    // during an active CallKit call, since the session is shared with the
    // telephony stack), AVSpeechSynthesizer.speak() silently no-ops with
    // no delegate callback to explain why — there is no "failed to speak"
    // error, just quiet. Re-asserting setActive(true) immediately before
    // every speak pass (not just the first) costs nothing when the
    // session is already active, and recovers it when it isn't.
    try? AVAudioSession.sharedInstance().setActive(true, options: [])

    // speechSynthesizer(_:didFinish:) fires once per utterance in this
    // pass; only the LAST one is registered in lastUtterancePerCall, so
    // the repeat-chaining logic there only reacts once the whole pass
    // (greeting+main line, plus the notes/location aside if present) has
    // actually finished speaking, not after just the first segment.
    for (i, segment) in segments.enumerated() {
      let u = AVSpeechUtterance(string: segment)
      u.voice = voice
      u.rate = AVSpeechUtteranceDefaultSpeechRate * 0.97
      u.pitchMultiplier = i == 0 ? 1.0 : 0.97
      let isLastSegment = i == segments.count - 1
      u.postUtteranceDelay = isLastSegment ? 0 : 0.45
      if isLastSegment { lastUtterancePerCall[callUUID] = u }
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
