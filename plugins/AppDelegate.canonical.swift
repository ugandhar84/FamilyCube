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
  // Ends the call natively once the repeat loop has spoken its 3 passes —
  // live-reported: a reminder call that finished speaking still had to be
  // hung up manually, unlike a real voicemail-style message that ends
  // itself. CXCallController submits a real CXEndCallAction transaction,
  // the same underlying CallKit API RNCallKeep's own JS-facing endCall()
  // uses (see RNCallKeep.m) — done directly in Swift here since this runs
  // natively right as the last repeat finishes, with no need to round-trip
  // through JS just to ask RNCallKeep to do it.
  let callController = CXCallController()
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
  // Marked the moment speakReminder() is first entered for a call — lets
  // handleAudioSessionInterruption's recovery path (below) tell "this call
  // hasn't spoken even once yet, the already-scheduled first speakReminder
  // call will handle it" apart from "this call has spoken before and looks
  // genuinely stuck now," without which the synthetic .ended interruption
  // RNCallKeep posts on every single answer (see didActivateAudioSession)
  // could race the 0.5s-delayed first speakReminder call and double-fire it.
  var hasStartedSpeaking = Set<String>()
  // TEMP diagnostic instrumentation (see traceLog/getLastCallDebugTrace) —
  // two previous fix attempts (setActive(true) reassertion, then the
  // AVAudioSessionModeSpokenAudio mode fix) were both confirmed live to NOT
  // resolve "reminder speaks once then goes silent for the rest of the
  // call." Rather than ship a third blind guess, this repeat-loop code now
  // appends a timestamped breadcrumb at every meaningful lifecycle point
  // (see trace(_:) below) so the NEXT test call produces hard evidence
  // instead of another live/fail report. Ripe for deletion once the actual
  // root cause is confirmed and fixed — search "TEMP diagnostic" in this
  // file and in plugins/withCallKeep.js / lib/callAlert.ts for every piece.
  var callDebugTrace: [String] = []

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

    // audioSession.mode defaults to AVAudioSessionModeDefault (a two-way
    // telephony mode meant for an actual voice call) when omitted — that is
    // what this app was silently getting, since no audioSession block was
    // ever passed here. .default + .playAndRecord is a documented source of
    // AVSpeechSynthesizer.speak() silently failing to (re)start playback
    // ("_BeginSpeaking: couldn't begin playback" / "[AXTTSCommon] Failure
    // starting audio queue alp!" in the system log, no error, no delegate
    // callback) once the session has already been active/routed for a
    // while — matching exactly what was live-reported: the repeat loop's
    // first speak() (right after CallKit freshly activates the session)
    // plays fine, every speak() after that goes silent with the call still
    // connected. AVAudioSessionModeSpokenAudio is Apple's own mode for
    // exactly this use case (one-way announcement/TTS layered over an
    // otherwise-active audio session, the same mode VoiceOver/turn-by-turn
    // apps use) — RNCallKeep persists this into NSUserDefaults and
    // configureAudioSession() (called on every provider:didActivateAudioSession:
    // and every answer) re-applies it every time, so this single setup()
    // call fixes every subsequent repeat pass, not just the first.
    RNCallKeep.setup([
      "appName": "Family Cube",
      "supportsVideo": false,
      "maximumCallGroups": "1",
      "maximumCallsPerCallGroup": "1",
      "audioSession": [
        "mode": "AVAudioSessionModeSpokenAudio",
      ],
    ])

    let registry = PKPushRegistry(queue: DispatchQueue.main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    voipRegistry = registry

    let observer = CXCallObserver()
    observer.setDelegate(self, queue: nil)
    callObserver = observer

    speechSynthesizer.delegate = self

    // TEMP diagnostic + real-recovery hook (see callDebugTrace comment
    // above). RNCallKeep's own CXProviderDelegate implementation
    // (provider:didActivateAudioSession:) posts a SYNTHETIC
    // AVAudioSessionInterruptionNotification (.ended/.shouldResume) every
    // time CallKit (re)activates the audio session — which happens once on
    // answer AND can happen again later in a call. A REAL interruption
    // (e.g. Siri, another app's audio, a route change while the OS is
    // re-negotiating) can also land here independent of that synthetic
    // one. Either kind arriving while AVSpeechSynthesizer is mid-utterance
    // is a documented way for speech to be silently cut off without ever
    // calling speechSynthesizer(_:didFinish:) — see speechSynthesizer
    // (_:didCancel:) below for why that alone would fully explain "plays
    // once, then permanently silent, call stays connected, no error."
    // Listening here lets the repeat loop actually recover (re-assert the
    // session and resume) instead of just logging that it happened.
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAudioSessionInterruption(_:)),
      name: AVAudioSession.interruptionNotification,
      object: nil
    )

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // TEMP diagnostic instrumentation — appends a timestamped breadcrumb to an
  // in-memory array AND persists it to UserDefaults after every append
  // (survives the app being killed mid-call, same as the existing
  // familycube_last_answered_* keys) so it's readable even if the process
  // dies before call.hasEnded ever fires. Capped at 200 entries so a
  // pathological loop can't grow this unboundedly.
  private func trace(_ message: String) {
    let ts = ISO8601DateFormatter().string(from: Date())
    let line = "\(ts)  \(message)"
    callDebugTrace.append(line)
    if callDebugTrace.count > 200 { callDebugTrace.removeFirst(callDebugTrace.count - 200) }
    UserDefaults.standard.set(callDebugTrace, forKey: "familycube_call_debug_trace")
    #if DEBUG
    print("[FamilyCube CallTrace] \(line)")
    #endif
  }

  // Ends the reminder call natively once all repeat passes have finished
  // speaking — a voicemail-style message hangs up when it's done, rather
  // than leaving the person to notice and manually end it. uuid must be a
  // valid CXCall.uuid (NSUUID re-serializes as uppercase; CXEndCallAction
  // takes the UUID type directly, not the lowercased string form used
  // elsewhere in this file for UserDefaults keys — see callObserver's own
  // comment on that mismatch).
  private func endReminderCall(uuid: String) {
    guard let callUUID = UUID(uuidString: uuid) else { return }
    let endCallAction = CXEndCallAction(call: callUUID)
    let transaction = CXTransaction(action: endCallAction)
    callController.request(transaction) { [weak self] error in
      if let error = error {
        self?.trace("endReminderCall — CXEndCallAction failed for uuid=\(uuid): \(error.localizedDescription)")
      } else {
        self?.trace("endReminderCall — CXEndCallAction succeeded for uuid=\(uuid)")
      }
    }
  }

  // TEMP diagnostic + real-recovery hook. See the interruptionNotification
  // registration above for why this fires and what it would explain.
  // AVAudioSessionInterruptionTypeBegan means playback was just cut off;
  // .ended means the session is clear to resume. RNCallKeep's own
  // didActivateAudioSession handler always posts a synthetic .ended event
  // (see its comment), which this can't tell apart from a real one — so
  // this logs BOTH kinds and, on .ended, re-asserts the session and — if a
  // pass looks stuck (activeCallUUIDs still contains the uuid but nothing
  // is currently speaking) — proactively resumes speaking, since waiting
  // for didFinish/didCancel to fire is exactly what's failing.
  @objc private func handleAudioSessionInterruption(_ note: Notification) {
    guard let info = note.userInfo,
          let typeRaw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeRaw) else {
      trace("interruptionNotification fired with no usable type")
      return
    }
    if type == .began {
      trace("interruptionNotification BEGAN — audio session was just interrupted")
      return
    }
    trace("interruptionNotification ENDED — reasserting session, checking for a stuck call")
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playAndRecord, mode: .spokenAudio, options: [.allowBluetooth, .allowBluetoothA2DP])
    try? session.setActive(true, options: [])
    // This fires on EVERY .ended interruption, including the SYNTHETIC one
    // RNCallKeep posts on every single didActivateAudioSession call — which
    // includes the very first one, moments after answer, racing against
    // the 0.5s-delayed first speakReminder() call already scheduled by
    // callObserver. Three guards keep this from double-firing speakReminder
    // concurrently with work that's already scheduled/in-flight:
    // hasStartedSpeaking.contains(uuid) rules out that initial 0.5s window
    // (repeatsRemaining is already set by then, but speakReminder hasn't
    // run yet — the ONLY gap none of the other guards would catch);
    // lastUtterancePerCall[uuid] == nil rules out a pass currently awaiting
    // its own didFinish/didCancel; !isSpeaking rules out mid-utterance.
    for uuid in activeCallUUIDs {
      guard repeatsRemaining[uuid] != nil,
            hasStartedSpeaking.contains(uuid),
            lastUtterancePerCall[uuid] == nil,
            !speechSynthesizer.isSpeaking else { continue }
      trace("interruption recovery: call \(uuid) has repeatsRemaining=\(repeatsRemaining[uuid] ?? -1) but synthesizer is idle with no pass in flight — resuming speakReminder")
      let itemType = UserDefaults.standard.string(forKey: "familycube_call_itemType_\(uuid)") ?? "reminder"
      speakReminder(callUUID: uuid, itemType: itemType)
    }
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
      // TEMP diagnostic — logged BEFORE any cleanup/flush below so the
      // trace still captures the exact repeatsRemaining/activeCallUUIDs
      // state at the moment the call ended, then flush to UserDefaults
      // (trace() already persists on every call, but this call is the
      // last guaranteed chance before callDebugTrace's in-memory copy is
      // moot — the process may be torn down moments after the user hangs
      // up on a backgrounded call).
      if surfacedCallUUIDs.contains(uuid) {
        trace("call.hasEnded uuid=\(uuid) repeatsRemaining=\(repeatsRemaining[uuid].map(String.init) ?? "nil") wasActive=\(activeCallUUIDs.contains(uuid)) synthesizerSpeaking=\(speechSynthesizer.isSpeaking)")
      }
      activeCallUUIDs.remove(uuid)
      repeatsRemaining.removeValue(forKey: uuid)
      repeatGapSeconds.removeValue(forKey: uuid)
      lastUtterancePerCall.removeValue(forKey: uuid)
      hasStartedSpeaking.remove(uuid)
      if surfacedCallUUIDs.contains(uuid) {
        // Live-reported gap: wasReminderCallJustAnswered()'s recency flag is
        // stamped at ANSWER time (both here via CallReminderAnswered below,
        // and by checkLastAnsweredCallOnColdStart), with a fixed window from
        // that moment. The in-call TTS alone (3 repeat passes, ~3s gaps) can
        // run 20-30+ seconds, and the person may keep listening/talking
        // after that — so by the time they actually hang up and the app
        // foregrounds, answer-to-now can already exceed the window, and the
        // Face ID/PIN re-lock check in app/_layout.tsx and
        // AppPinLockOverlay.tsx runs anyway, right back into the exact hang
        // this mechanism exists to prevent (Face ID can't reliably run while
        // CallKit is still tearing down). Posting a second event HERE, at
        // the real end of the call — the moment CXCallObserver confirms
        // hasEnded, which is essentially simultaneous with the app
        // foregrounding — lets JS re-stamp that recency flag from hang-up
        // time instead of answer time, so the window is measured from the
        // instant that actually matters. Only fires for a call this app
        // itself surfaced (TTS-answered), never for a real unrelated call.
        NotificationCenter.default.post(
          name: NSNotification.Name("CallReminderEnded"),
          object: nil,
          userInfo: ["callUUID": uuid]
        )
        // Also cached to UserDefaults (not just the live NotificationCenter
        // post above) for the same reason familycube_last_answered_* exists:
        // if JS gets killed/backgrounded for the entire duration of the call
        // and only relaunches once the call actually ends (app foregrounding
        // is often what triggers that relaunch), no listener was attached in
        // time to receive the live post either — same structural gap the
        // answered-event cache was built to cover. checkLastAnsweredCallOnColdStart
        // reads this alongside the answer-time fields so a cold boot picks
        // the freshest of the two timestamps.
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "familycube_last_answered_endedAt")
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
      // Cached into the STABLE familycube_last_answered_* keys (not just the
      // per-uuid familycube_call_dueAtIso_<uuid> one) because the call.hasEnded
      // branch above deletes every familycube_call_*_<uuid> key the moment this
      // call ends — which, for the common case of a reminder call answered while
      // the app is backgrounded/killed, happens well before JS ever boots back
      // up to read it. Without a copy that survives hasEnded's cleanup,
      // getLastAnsweredCall() (FCVoipToken, read by
      // checkLastAnsweredCallOnColdStart() in lib/callAlert.ts) would find
      // itemType/itemId but a already-gone dueAtIso on every cold-start check —
      // and mark-call-reminder-answered requires dueAtIso to find the right
      // call_reminder_log row.
      if let id = itemId, let due = dueAtIso {
        UserDefaults.standard.set(uuid, forKey: "familycube_last_answered_call_uuid")
        UserDefaults.standard.set(itemType, forKey: "familycube_last_answered_itemType")
        UserDefaults.standard.set(id,   forKey: "familycube_last_answered_itemId")
        UserDefaults.standard.set(due,  forKey: "familycube_last_answered_dueAtIso")
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
      // TEMP diagnostic — new call, reset the trace so it only ever holds
      // this one call's lifecycle (avoids interleaving stale data from a
      // previous test call with the one currently under test), and record
      // OUR OWN copy of itemId/dueAtIso (familycube_call_debug_trace_*, not
      // familycube_last_answered_*) so JS can correlate this trace to the
      // right call_reminder_log row once it ships. Deliberately a separate
      // pair of keys from familycube_last_answered_itemId/dueAtIso just
      // above — those are consumed (deleted) by getLastAnsweredCall, and
      // checkLastAnsweredCallOnColdStart() / this trace-shipper can run in
      // either order on a given resume, so sharing keys would mean
      // whichever one runs second reads back nil.
      callDebugTrace = []
      UserDefaults.standard.removeObject(forKey: "familycube_call_debug_trace")
      if let id = itemId, let due = dueAtIso {
        UserDefaults.standard.set(id,       forKey: "familycube_call_debug_trace_itemId")
        UserDefaults.standard.set(due,      forKey: "familycube_call_debug_trace_dueAtIso")
        UserDefaults.standard.set(itemType, forKey: "familycube_call_debug_trace_itemType")
      }
      trace("callObserver: answered uuid=\(uuid) itemType=\(itemType) itemId=\(itemId ?? "nil") dueAtIso=\(dueAtIso ?? "nil") — scheduling first speakReminder in 0.5s")
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
        guard let self = self else { return }
        self.trace("first speakReminder closure FIRED for uuid=\(uuid)")
        self.speakReminder(callUUID: uuid, itemType: itemType)
      }
    }
  }

  // Fires once per utterance. Only the LAST utterance of a pass is tracked
  // in lastUtterancePerCall, so this only reacts when an entire pass (all
  // segments: greeting+main line, optional notes/location aside) has
  // actually finished playing — not after just the first segment.
  public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    let matched = lastUtterancePerCall.first(where: { $0.value === utterance })
    // TEMP diagnostic — logs whether this callback fired at all (it did,
    // since we're inside it) and, critically, whether the lastUtterancePerCall
    // lookup actually matched something. A miss here (matched == nil) means
    // didFinish fired for a NON-final segment (expected/normal — greeting
    // vs. main line) or for an utterance this dictionary never tracked; it
    // is NOT itself evidence of a bug. What matters is whether this callback
    // fires AT ALL for utterance #2+ of a pass — if the trace shows the
    // scheduling closure ran and speakReminder was entered, but no
    // corresponding didFinish/didCancel line ever follows for that pass,
    // that pinpoints the utterance as silently dropped between speak() and
    // any delegate callback.
    trace("speechSynthesizer didFinish — matchedUuid=\(matched?.key ?? "none/non-final-segment")")
    guard let (uuid, _) = matched else { return }
    lastUtterancePerCall.removeValue(forKey: uuid)
    let remaining = (repeatsRemaining[uuid] ?? 1) - 1
    repeatsRemaining[uuid] = remaining
    let stillActive = activeCallUUIDs.contains(uuid)
    trace("speechSynthesizer didFinish — pass complete for uuid=\(uuid), remaining=\(remaining), activeCallUUIDs.contains=\(stillActive)")
    guard remaining > 0, stillActive else {
      repeatsRemaining.removeValue(forKey: uuid)
      repeatGapSeconds.removeValue(forKey: uuid)
      // Live-reported: after speaking all 3 passes, the call just sat there
      // connected/silent until the person noticed and hung up manually.
      // Only end it here if repeats actually ran out (remaining <= 0) and
      // the call is still active — NOT if stillActive is what failed the
      // guard (that path means the call already ended some other way, e.g.
      // the person hung up mid-repeat, and there is nothing left to end).
      if remaining <= 0, stillActive {
        trace("speechSynthesizer didFinish — all repeats exhausted, ending call uuid=\(uuid)")
        endReminderCall(uuid: uuid)
      }
      return
    }
    let gap = repeatGapSeconds[uuid] ?? 3.0
    let itemType = UserDefaults.standard.string(forKey: "familycube_call_itemType_\(uuid)") ?? "reminder"
    trace("speechSynthesizer didFinish — scheduling next pass for uuid=\(uuid) in \(gap)s")
    DispatchQueue.main.asyncAfter(deadline: .now() + gap) { [weak self] in
      guard let self = self else { return }
      guard self.activeCallUUIDs.contains(uuid) else {
        self.trace("repeat-scheduling closure fired for uuid=\(uuid) but call is no longer active — skipping")
        return
      }
      self.trace("repeat-scheduling closure FIRED for uuid=\(uuid) — calling speakReminder")
      self.speakReminder(callUUID: uuid, itemType: itemType)
    }
  }

  // Fires instead of didFinish when an utterance is interrupted/cancelled
  // rather than allowed to play to completion — e.g. speechSynthesizer.
  // stopSpeaking(), or (per Apple's own AVAudioSession interruption
  // handling guidance) when the audio session is interrupted mid-speech.
  // This app's repeat-chaining logic previously lived ENTIRELY inside
  // didFinish — if utterance #2+ of any pass was ever silently cancelled
  // instead of finishing normally, didFinish would simply never fire for
  // it, lastUtterancePerCall would never clear, and the call would sit
  // connected with no further speech and no error: exactly the reported
  // symptom, on both previous "fixed" builds. Handling didCancel the same
  // way didFinish handles a completed pass (treat "cancelled" as "this
  // segment is done, decide whether to continue") means a mid-speech
  // interruption can no longer permanently wedge the repeat loop — this is
  // a real recovery path, not just a diagnostic.
  public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
    let matched = lastUtterancePerCall.first(where: { $0.value === utterance })
    trace("speechSynthesizer didCancel — matchedUuid=\(matched?.key ?? "none/non-final-segment") — an utterance was interrupted/cancelled rather than finishing normally")
    guard let (uuid, _) = matched else { return }
    lastUtterancePerCall.removeValue(forKey: uuid)
    guard activeCallUUIDs.contains(uuid) else {
      repeatsRemaining.removeValue(forKey: uuid)
      repeatGapSeconds.removeValue(forKey: uuid)
      return
    }
    // Don't consume a repeat count for a cancelled pass — the person never
    // actually heard it, so retry the SAME pass (not the next one) shortly
    // after re-asserting the audio session, rather than either skipping
    // ahead or (the old, buggy-by-omission behavior) doing nothing forever.
    let itemType = UserDefaults.standard.string(forKey: "familycube_call_itemType_\(uuid)") ?? "reminder"
    trace("speechSynthesizer didCancel — retrying the same pass for uuid=\(uuid) in 1.5s (repeatsRemaining unchanged at \(repeatsRemaining[uuid].map(String.init) ?? "nil"))")
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
      guard let self = self, self.activeCallUUIDs.contains(uuid) else { return }
      let session = AVAudioSession.sharedInstance()
      try? session.setCategory(.playAndRecord, mode: .spokenAudio, options: [.allowBluetooth, .allowBluetoothA2DP])
      try? session.setActive(true, options: [])
      self.trace("didCancel retry closure FIRED for uuid=\(uuid) — calling speakReminder")
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
    // TEMP diagnostic — logs the exact moment speakReminder is entered and
    // the repeatsRemaining value at that instant, plus the audio session's
    // own reported state right before this function (re-)configures it.
    // Distinguishes "speakReminder was never called" from "it was called
    // but speak() itself was a no-op" once cross-referenced with the
    // didFinish/didCancel trace lines above.
    let sessionBefore = AVAudioSession.sharedInstance()
    trace("speakReminder ENTERED uuid=\(callUUID) repeatsRemaining=\(repeatsRemaining[callUUID].map(String.init) ?? "nil") category=\(sessionBefore.category.rawValue) mode=\(sessionBefore.mode.rawValue) isOtherAudioPlaying=\(sessionBefore.isOtherAudioPlaying) synthesizerIsSpeaking=\(speechSynthesizer.isSpeaking)")
    // Marks this call as having spoken at least once — see hasStartedSpeaking's
    // property comment for why handleAudioSessionInterruption's recovery
    // path needs this to avoid double-firing during the 0.5s window between
    // answer and the first scheduled speakReminder call.
    hasStartedSpeaking.insert(callUUID)
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
    // though the call stayed connected. The earlier fix here (just
    // `setActive(true)`) did NOT resolve it — confirmed via a live retest —
    // because `setActive` on an already-active session doesn't touch its
    // category/mode/route, and the real root cause turned out to be
    // upstream of all of this: plugins/withCallKeep.js was silently never
    // patching speechSynthesizer(_:didFinish:) — the entire repeat-
    // continuation callback — into the generated AppDelegate.swift at all
    // (now fixed). RNCallKeep.setup()'s audioSession.mode =
    // AVAudioSessionModeSpokenAudio (set in didFinishLaunchingWithOptions)
    // is a real, separate improvement for TTS-over-an-active-call audio
    // quality, kept regardless.
    //
    // Neither setCategory NOR setActive are called here anymore. Both were
    // tried as defense-in-depth reassertions on every repeat pass and both
    // were live-reported to independently break speaker-route behavior:
    // putting the call on speaker reverted to the earpiece (and got
    // progressively quieter) on every subsequent repeat. setActive(true)
    // on an already-active session is a known trigger for iOS's "duck and
    // restore" gain staging; setCategory — even with category/mode
    // UNCHANGED — is separately documented to silently clear a manual
    // output-route override (like a user's own tap to Speaker) back to the
    // default route, which is exactly the earpiece-revert symptom. Neither
    // call is needed on every repeat now that didFinish actually fires and
    // chains correctly (the actual repeat-loop bug): the session is set up
    // once at answer (see callObserver, ~line 208-209) and the genuine
    // interruption-recovery path (handleAudioSessionInterruption below)
    // still reasserts both when a REAL interruption is detected — that
    // path, and the didCancel retry path above, are the only places this
    // should ever need to happen again mid-call.

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
      // TEMP diagnostic — confirms speak() was actually called for this
      // segment (as opposed to the loop body never running at all) and
      // whether the synthesizer immediately reports itself as speaking
      // right after — a false report here (isSpeaking == false right after
      // speak()) would point at speak() itself silently no-op'ing rather
      // than at a later interruption/cancellation.
      trace("speakReminder segment \(i+1)/\(segments.count) queued via speak() uuid=\(callUUID) isLast=\(isLastSegment) synthesizerIsSpeakingNow=\(speechSynthesizer.isSpeaking)")
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
