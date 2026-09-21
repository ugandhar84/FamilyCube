Reply to App Store Connect — Submission b5534727-30fa-42d8-a243-4de9373b9fb4

---

**Guideline 2.5.4 — Background location**

The app does have a real, ongoing feature that uses persistent background
location: Family Cube's "Find Fam" tab lets a parent turn on live location
sharing so other family members can see their position on a map in real
time, including while the app is backgrounded — and the same location
stream also powers automatic driving-trip and speeding alerts.

This is an opt-in feature (the "Share My Location" toggle inside Find
Fam), not something enabled by default, which is likely why it wasn't
found during the review pass. I've attached a screen recording on a
physical device showing: enabling location sharing in Find Fam → the
background location permission prompt → backgrounding the app → a second
device's map showing the live pin continuing to update.

[Attach screen recording here, then reference it:]
Recording attached above / linked: <VIDEO LINK>

If it would help for future reviews, I'm also including these notes in
the App Review Information field so reviewers can find the feature
directly: enable location sharing from the Find Fam tab (bottom nav),
then background the app — the shared pin keeps updating for other family
members.

---

**Guideline 5 — CallKit in China**

Thank you for flagging this. We've corrected it: CallKit setup is now
skipped entirely for any device whose region is China (detected via
`expo-localization`'s region code at app launch), so CallKit is never
activated for users there. This is live in the build being submitted
with this response.

VoIP push delivery for call-style reminders continues to work in China
without CallKit's native call UI, consistent with Apple's guidance that
VoIP calling itself remains allowed — only CallKit's UI is disabled for
that region.

---

**Guidelines 5.1.1(i) / 5.1.2(i) — Third-party AI data sharing**

Confirmed: the app includes an AI assistant feature ("Ask Cube") that
sends a family's message to a third-party AI provider (Google Gemini,
with a fallback provider) to generate a response, and does send user
data to that third party.

We're addressing this directly rather than disputing it:

1. Before a user's first use of Ask Cube, the app now shows a one-time
   consent screen explaining: the AI assistant sends what you type,
   along with relevant family context needed to answer (e.g. upcoming
   events, chore lists), to Google Gemini (and a fallback AI provider) to
   generate a response; no other family data is sent; the user must tap
   "I agree" before the feature becomes usable at all. Consent is
   recorded server-side per member (who, when, and the exact disclosure
   text shown), not just a local device flag.
2. The in-app Terms of Service (§8, AI Assistant) already described this
   at a high level; we've now also added this same disclosure to the
   Privacy Policy's data-sharing section, not just the Terms, per your
   guidance that Terms of Service placement alone isn't sufficient.
3. What's actually sent: the user's typed prompt and the minimum family
   context needed to ground the answer (e.g. "what's on the calendar
   this week"). We do not send full chat history, health records, or
   location data to the AI provider.

This consent flow and the updated Privacy Policy are included in the
build being submitted with this response.
