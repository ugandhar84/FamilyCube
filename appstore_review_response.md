Thank you for the review. First, an important point that applies throughout: every family account is created and owned by a parent. Only a parent can add family members, connect third-party services (calendar sync, sign-in), or manage the subscription. Children and teens use profiles a parent creates for them — they never independently create accounts or connect third-party services. All data flows below happen under the parent's account setup and consent.

**1. Third-party analytics?**
No. We integrate no analytics SDK (no Firebase Analytics, Amplitude, Mixpanel, etc.). Firebase is used only for push/VoIP notification delivery (Firebase Cloud Messaging), sending only a device push token — no usage or behavioral data.

**2. Third-party advertising?**
No. Family Cube contains no ads and no ad network SDK. Not applicable.

**3. Data shared with third parties — purposes and storage?**
Yes, each limited to a specific purpose set up by the parent:

- **RevenueCat** — subscription/IAP management. Sends a user ID and App Store transaction/receipt data for entitlement validation. Stored on RevenueCat's infrastructure per their published policies.
- **Firebase Cloud Messaging (Google)** — delivers push notifications; only a device push token, no content.
- **Sign in with Apple / Google Sign-In** — only if the parent chooses that login method; standard OAuth identity (name/email).
- **Google Calendar / Microsoft Outlook Calendar** — only if a parent explicitly connects an external calendar, to sync events they choose to share.
- **Apple Maps (MapKit)** — address search, geocoding, and directions for location-sharing/GPS features.
- **Kroger API** — optional grocery price-lookup (item names + zip code).
- **Google Gemini, DeepSeek, and Anthropic (Claude)** — used server-side only (never called directly from the app) to power AI features: flyer/receipt/prescription scanning (OCR), medical record and appointment-recording summarization, chat moderation, and our in-app assistant. For the assistant's location/health queries, real family member names are replaced with anonymous aliases before reaching any AI provider, and converted back only after the response returns to our own server — the provider never sees a real name in that path. For uploaded documents/images/audio, we redact identifiers like SSNs from accompanying text metadata; content visible/audible within the file itself is processed by the provider to perform the requested extraction.

All other app data (family profiles, chores, chat, calendar, location) is stored in our own backend (Supabase, a Postgres database we operate) — not shared with any unrelated third party.

**4. Data collected beyond analytics/advertising?**
Yes. As a family-organization app, we collect and store (in our own backend):
- Family member profiles (name, role, avatar) created by the parent
- Location data, only when a parent enables sharing for a family member, used to show family locations and power driving/safety alerts
- Calendar events, chores, chat messages, and photos created in the app
- Documents/images/audio a parent uploads (flyers, prescriptions, medical records, recordings), processed by AI solely to extract/summarize information for that family
- Device push tokens, used only for notification delivery

None of this data is used for advertising, ad targeting, or sold to any third party — it exists solely to provide the app's family-organization features to the family that created it.

Happy to provide any further detail needed for review.
