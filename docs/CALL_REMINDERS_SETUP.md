# Call-Style Reminder Alerts — Setup Guide

Native CallKit (iOS) / ConnectionService (Android) ringing alerts for
assigned chores and calendar events, opt-in per item with a configurable
lead time (on-time / 5 min / 10 min before due). Not a real phone call —
uses CallKit/ConnectionService purely for the native ringing UI, delivered
via a VoIP push (iOS) / high-priority FCM data message (Android), never
touching a real phone number.

This doc is the full record of what was built and, more importantly, the
exact Apple/Firebase portal steps required to make it actually deliver —
those steps are easy to get subtly wrong and don't show up as code.

---

## Why not a real phone call, and why not skip CallKit entirely

Two designs were considered and rejected before this one:

1. **A real carrier phone call** — rejected outright. No legitimate way to
   place a call to a family member's real number without their consent
   being questionable, and it doesn't fit "the assignee opted into a
   reminder for their own chore."
2. **A big in-app "ringing" screen triggered by a normal push, no
   CallKit** — this was the initial recommendation (Life360-style: loud
   push + full-screen intent). It avoids CallKit's App Store review risk
   entirely. **Rejected** because it cannot auto-open/auto-ring when the
   app is backgrounded or killed — the user has to tap the push
   notification first. That's a real ceiling of non-CallKit pushes on
   both platforms, and defeats the actual goal ("ring like a call, even
   if the phone is in someone's pocket with the app closed").

CallKit/ConnectionService is the only way to get true auto-ring with the
app closed. The tradeoff is a real one: Apple's guidelines are written for
apps whose primary purpose is calling, and a reminder-only use of CallKit
carries genuine App Store review risk. Decision: proceed anyway, since
auto-ring-when-closed was the actual requirement. If Family Cube ever adds
real family-to-family voice calling (the `call_sessions` table already
exists in the schema, unused — see below), that would make the CallKit
usage much easier to defend at review, since it'd power a real calling
feature too, not just reminders.

---

## Architecture

```
Chore/Event with alert_call=true, due in `alert_call_lead_minutes`
        │
        ▼
call-reminder-sweeper edge function (cron, every minute)
        │
        ├─ iOS  → APNs VoIP push (JWT/token auth) ──► PushKit wakes app
        │                                              (even if killed)
        │                                              → AppDelegate.swift's
        │                                                PKPushRegistryDelegate
        │                                                → RNCallKeep.reportNewIncomingCall
        │                                                  (native, no JS needed)
        │
        └─ Android → FCM high-priority data message ──► index.js's
                                                          setBackgroundMessageHandler
                                                          (background/killed) or
                                                          lib/callAlert.ts's onMessage
                                                          (foreground)
                                                          → RNCallKeep.displayIncomingCall

User taps Answer (native CallKit/ConnectionService UI)
        │
        ▼
lib/callAlert.ts's onCallAnswered() → router.push('/call-alert')
        │
        ▼
app/call-alert.tsx — TTS readout (expo-speech) + Snooze (0/5/10 min) or Done
```

Dedup: `call_reminder_log` table, one row per `(item_type, item_id)` —
Snooze deletes its row so the sweeper re-fires on the next tick.

---

## Files

| File | Purpose |
|---|---|
| `supabase/migrations/20260819080000_call_reminder_alerts.sql` | `alert_call`/`alert_call_lead_minutes` columns on `chore_tasks`/`calendar_events`, `voip_push_tokens` table, `call_reminder_log` dedup table, RLS |
| `supabase/migrations/20260819081000_call_reminder_cron.sql` | Registers the 1-minute cron |
| `supabase/functions/call-reminder-sweeper/index.ts` | Sweep logic — finds due items, resolves tokens, dedupes |
| `supabase/functions/call-reminder-sweeper/apns.ts` | APNs (JWT) + FCM delivery |
| `plugins/withCallKeep.js` | Expo config plugin — re-injects the PushKit delegate into `AppDelegate.swift` on every `expo prebuild` (survives `--clean`) |
| `ios/FamilyCube/AppDelegate.swift` | Hand-written `PKPushRegistryDelegate` (native-generated file, gitignored — the plugin above is the durable source of truth) |
| `ios/FamilyCube/FamilyCube-Bridging-Header.h` | Imports `RNCallKeep.h` so Swift can call `RNCallKeep.reportNewIncomingCall` natively |
| `index.js` | Custom entry point (replaces `expo-router/entry` as `main`) — registers Firebase's background message handler before React Native boots, required for Android reliability |
| `lib/callAlert.ts` | CallKeep JS setup, VoIP/FCM token registration, answer/decline event bridging |
| `app/call-alert.tsx` | Post-answer screen — TTS + Snooze |
| `app/_layout.tsx` | Wires `setupCallAlerts()`, token registration, `onCallAnswered` → navigation |
| `store/choreStore.ts`, `store/eventStore.ts`, `store/questStore.ts`, `store/choreAdapter.ts` | `alertCall`/`alertCallLeadMinutes` field plumbing |
| `features/quests/components/AddQuestModal.tsx`, `EditQuestModal.tsx`, `features/calendar/EventFormModal.tsx` | "Call to remind" toggle + lead-time picker UI |

---

## Apple Developer Portal setup

### 1. App ID — enable Push Notifications

`Certificates, Identifiers & Profiles → Identifiers → com.familycube.ios`
→ check **Push Notifications** capability → Save.

(No separate identifier needed for VoIP — it rides on the same App ID's
Push Notifications capability.)

### 2. APNs auth — use a token-based (.p8) key, NOT a certificate

**This is the one mistake worth calling out explicitly**, because it cost
real time working around it: a **certificate-based VoIP Services
Certificate** (the CSR → `.cer` → `.p12` flow) requires **mutual-TLS**
client-certificate authentication when calling Apple's APNs HTTP/2 API.

Supabase Edge Functions run on a Deno-based sandboxed runtime that does
**not** reliably support this — plain `fetch()` has no client-cert option,
`Deno.createHttpClient({cert,key})` exists but isn't documented/verified
as working with HTTP/2 ALPN inside Supabase's *hosted* edge-runtime
specifically (as opposed to raw Deno CLI/Deploy), and hand-rolling HTTP/2
framing over `Deno.connectTls()` is impractical. Confirmed via direct
research against Deno's docs, GitHub issues, and Supabase's edge-runtime
repo — no reliable path exists for certificate-based APNs auth from a
Supabase Edge Function today.

**Use token-based (JWT) auth instead** — this works fine with plain
`fetch()`, which is what `apns.ts` is actually written for.

If you already have a certificate-based VoIP cert (we did, initially —
see the `.p12`/`.pem` extraction steps that were later abandoned), it's
safe to ignore; the `.p8` key described below is what actually gets used.

**Steps** (`Certificates, Identifiers & Profiles → Keys`):

1. Click **+** to register a new key.
2. Check **Apple Push Notifications service (APNs)**.
3. **Continue → Register**.
4. **Download the `.p8` file immediately** — Apple only allows this
   download once, at creation time. If you navigate away first, you have
   to revoke and create a new key.
5. Note the **Key ID** shown on the confirmation page (short alphanumeric
   string, e.g. `QUCU522FT3`).

**If you hit "You have already reached the maximum allowed number of team
scoped Keys"**: Apple caps APNs-capable keys per team. Check
`Keys` in the portal for an existing key with **APNs** already listed
under Services and **Team Scoped (All topics)** — that scope means it's
valid for any app under the team, including this one, so an existing key
from another project on the same team can be reused. In this project's
case, EAS/Expo had already provisioned one (`QUCU522FT3`, "Expo Push
Notifications Key...") for the app's existing push-notification setup —
its `.p8` was recoverable from local disk (`~/AuthKey_QUCU522FT3.p8`,
EAS had saved it during an earlier `expo-notifications` setup) rather
than needing a fresh Apple download.

### 3. Team ID

`developer.apple.com` portal, top-right, or Membership Details page.
Already present in this repo as `appleTeamId` in `app.config.js`
(`X4VLLWF6Q3`).

### 4. Topic

The VoIP push topic is the bundle ID + `.voip` suffix:
`com.familycube.ios.voip`.

---

## Supabase secrets

Set these via the CLI, reading the key file directly from disk — **never
paste the raw private key or any password into a chat/AI conversation**,
even when asking an AI assistant to help; treat those the same as any
other production secret.

```bash
supabase secrets set APNS_PRIVATE_KEY="$(cat /path/to/AuthKey_XXXXXXXXXX.p8)" --project-ref gqzdbxrqpkwvwcwvdnix
supabase secrets set APNS_KEY_ID="XXXXXXXXXX" APNS_TEAM_ID="X4VLLWF6Q3" APNS_TOPIC="com.familycube.ios.voip" --project-ref gqzdbxrqpkwvwcwvdnix
```

Then redeploy the sweeper so it picks up the new secrets:

```bash
supabase functions deploy call-reminder-sweeper --project-ref gqzdbxrqpkwvwcwvdnix
```

`supabase secrets list` will show the secret **names** are set but never
the values (shown as hashes) — that's expected and correct.

---

## Android — Firebase Cloud Messaging setup

Android's background/killed-app wake path needs
`@react-native-firebase/messaging`, which needs a real Firebase project.
**A dedicated project was created for this app** — `family-cube-8b803` —
kept separate from any other app on this Apple/Google team, for the same
reason keys/certs weren't reused across apps elsewhere in this setup.

### 1. Create the project + register the Android app

1. [Firebase Console](https://console.firebase.google.com) → **Add
   project** → name it "Family Cube".
2. **Add app → Android**, package name `com.familycube.android` (must
   match `app.config.js`'s `android.package` exactly).
3. Skip the SHA-1 fingerprint step (only needed for Google Sign-In, not
   FCM).
4. Download `google-services.json`, place it at the **repo root**
   (`app.config.js`'s `android.googleServicesFile` points here).
5. This file is gitignored — **it was previously accidentally committed
   under a different, unrelated app's identity** (`petkoinia`, from an
   earlier rebrand of this codebase) with a live API key exposed in git
   history. That old file was untracked (`git rm --cached`) when Family
   Cube's real one was added; the old key in history is a separate
   pre-existing issue, not introduced by this feature.

### 2. FCM delivery auth — V1 API (service account), not Legacy

**The Legacy HTTP API (`FCM_SERVER_KEY`, `key=...` auth) is deprecated
(sunset 2024-06-20) and disabled by default on new Firebase projects** —
confirmed by checking this project's Cloud Messaging tab directly: "Cloud
Messaging API (Legacy): Disabled." Enabling a deprecated API just to match
older tutorials/code isn't worth it — `apns.ts` was written (and later
rewritten, see below) against the current **V1 API**, which needs OAuth2
service-account auth instead of a static key.

**Don't confuse this with "Web Push certificates" (VAPID keys)** — that's
a different section of the same Cloud Messaging tab, for browser web push
specifically, and doesn't work as FCM server-side auth. Easy to grab by
mistake since it's the first key-looking value on that page.

**Steps**:

1. Firebase Console → **Project Settings** (gear icon) → **Service
   accounts** tab.
2. Click **"Generate new private key"** → confirms a warning → downloads
   a JSON file (`family-cube-8b803-firebase-adminsdk-...json`).
3. This file is a **full Firebase Admin credential**, not scoped to just
   push — treat it with the same care as the APNs `.p8` key. Never paste
   its contents into chat/AI conversations.

```bash
supabase secrets set FCM_SERVICE_ACCOUNT="$(cat /path/to/family-cube-8b803-firebase-adminsdk-....json)" --project-ref gqzdbxrqpkwvwcwvdnix
supabase functions deploy call-reminder-sweeper --project-ref gqzdbxrqpkwvwcwvdnix
```

`apns.ts`'s `getFcmAccessToken()` signs a JWT with this service account's
private key (RS256), exchanges it for an OAuth2 bearer token via Google's
token endpoint, and calls
`https://fcm.googleapis.com/v1/projects/{project_id}/messages:send` —
caches the bearer token in memory for its ~1hr lifetime rather than
re-signing per request, same pattern as the APNs JWT caching.

---

## Rebuild required

Both the iOS `AppDelegate.swift` changes and the CallKeep/Firebase native
modules require a full native rebuild — this is not a JS-only change and
won't show up via Metro/Fast Refresh.

```bash
rm -rf ios android
npx expo prebuild --clean
cd ios && pod install && cd ..
npx expo run:ios --device 00008120-00110DE634BB601E
```

**CallKit cannot be tested in iOS Simulator** — physical device only, for
every test iteration.

---

## Known gaps / not yet done as of this doc

- Not yet tested end-to-end on a physical device (native rebuild not yet
  run after this wiring was completed) — both platforms' credentials are
  set, but nothing has actually rung on a device yet.
- `call_sessions` table (real family-to-family WebRTC calling) exists in
  the schema but is unused by any app code — noted above as a future
  angle that would strengthen the CallKit App Store review story if ever
  built.
