# App Review notes — location sharing (Find Family)

Paste the block below into **App Store Connect → App Review Information → Notes**, and attach a short screen recording.

---

**Where the background-location feature is:** open the **Family** tab → **Find Family** (map). Tap the **Share my location** switch.

**It is opt-in and off by default.** Nothing is collected until the person turns it on. When they do, a full-screen explanation appears first (what is collected, when, who can see it, what it is not used for, how to stop). Only after they tap **I agree, continue** does iOS show its own location prompt.

**Why background location is needed (guideline 2.5.4):** the feature's purpose is to let family members see each other on a map and be alerted when someone arrives at or leaves a saved place (home, school), including when the app is closed. The same location also powers an optional driving summary for teen drivers. Foreground-only location cannot do this, because family members need to see where someone is when their phone is in a pocket. iOS shows its blue "using your location" indicator while this runs, and the app does not use location for anything else.

**How the app limits battery and data:** it adapts like other family-locator apps. While someone is still it uses almost no GPS (iOS may pause updates until the phone moves), it tracks more closely only while the person walks or drives, and it speeds up for about two minutes only while another family member has the map open. It reduces further when battery is low.

**Data use (5.1.1 / 5.1.2):** precise location, speed and battery level are stored against the person's account and are visible only to members of the same family group. They are not used for advertising, not sold, not shared with third parties, and not used to track across other companies' apps or websites. Location is declared in the privacy manifest and in the App Privacy answers as Precise Location, linked to the user, not used for tracking, purpose App Functionality.

**How to stop:** switch **Share my location** off in Find Family at any time, or change access in iOS Settings → Family Cube → Location. Deleting the account removes the stored location.

**To test:** sign in with the demo account below, open Family → Find Family, turn on **Share my location**, read the explanation, tap **I agree, continue**, choose **Always** (or "Allow While Using" then "Always" when iOS asks later), then background the app. A second device signed in to the same family shows the pin updating.

Demo account: `<email>` / `<password>` (a family with two members so a second device or simulated member can view the map).

---

## App Privacy answers to check in App Store Connect (must match the app)

| Data type | Collected | Linked to user | Used to track | Purpose |
|---|---|---|---|---|
| Precise Location | Yes | Yes | No | App Functionality |
| Coarse Location | Yes | Yes | No | App Functionality |
| Other data you already declare (name, email, user ID, photos, messages) | keep as is | | | |

## Capabilities
- `UIBackgroundModes`: `location` (this feature), `fetch`, `voip` (call-style reminders). Be ready to explain each one if asked.
- iOS shows the blue background-location indicator (`showsBackgroundLocationIndicator: true`).


---

# Also paste into the review notes: calls, AI, children

**Call-style reminders (CallKit / VoIP push, guideline 2.5.4 and 5):** an optional reminder feature. When a person turns on "Call to remind" for a chore or event, the app rings the phone at the chosen time and reads the reminder aloud, so a task is not missed. It is controlled per person in Settings → Notifications → Call alerts and per item, and can be switched off at any time. Every VoIP push immediately reports a call to CallKit. CallKit is disabled entirely on devices in China. Call alerts are never used for marketing.

**AI features (5.1.1(i), 5.1.2(i)):** Ask Cube and the scanners (flyers, receipts, prescriptions, medical records, doctor-visit recordings) send only what the person types or scans, plus the minimum family context needed to answer, to Google (Gemini), a third-party AI service, with a backup provider if needed. Names, locations and health details are replaced with neutral labels before they are sent. A consent screen naming the provider is shown before first use, and the consent is stored with the exact text that was shown. The provider does not use the data for advertising.

**Children (5.1.4, 1.3):** the app is for families and is not a children's app or in the Kids category. A child cannot consent for themselves to location sharing or to AI features: both are off until a parent turns them on for that child in Settings → Children's privacy, and the server enforces it for AI. Children's accounts are created and managed by a parent. Location is shared only with the child's own family group, never advertising, never sold. Parents can delete a child's profile and data (Settings → Danger zone).

**Age rating:** answer the questionnaire to match: the app contains AI-generated text responses (an assistant), no unrestricted web access, no user-to-user public content (chat is limited to the family group).
