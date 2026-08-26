# Feature Specifications — Family Cube

Complete specification for all ~30 features. One-page summary per feature organized by domain.

**Last Updated:** 2026-08-02

---

## Table of Contents

### Core Platform
- [1. Notifications (Push + In-App Inbox)](#1-notifications-push--in-app-inbox)
- [2. Settings & Personalization](#2-settings--personalization)
- [3. Subscription Tiers & Billing](#3-subscription-tiers--billing)

### Health Tracking (8 features)
- [4. Feeding Logs](#4-feeding-logs)
- [5. Mood Logs](#5-mood-logs)
- [6. Medications](#6-medications)
- [7. Appointments](#7-appointments)
- [8. Vaccines](#8-vaccines)
- [9. Health Records (Parsing)](#9-health-records-parsing)
- [10. Insurance Documents (Parsing)](#10-insurance-documents-parsing)
- [11. Receipts (Parsing)](#11-receipts-parsing)

### AI Features (10 features)
- [12. Mood Scan](#12-mood-scan)
- [13. Symptom Scan](#13-symptom-scan)
- [14. Vet Chat (PetDoc)](#14-vet-chat-petdoc)
- [15. Daily Tips](#15-daily-tips)
- [16. Pet Timeline Generation](#16-pet-timeline-generation)
- [17. Year-in-Review Video](#17-year-in-review-video)
- [18. Nearby Places (Yelp)](#18-nearby-places-yelp)

### Social (8 features)
- [19. Follow & Followers](#19-follow--followers)
- [20. Feed (Posts)](#20-feed-posts)
- [21. Comments & Likes](#21-comments--likes)
- [22. Mentions](#22-mentions)
- [23. Family Invites](#23-family-invites)
- [24. Lost Pet Alerts](#24-lost-pet-alerts)
- [25. Found Pet Alerts](#25-found-pet-alerts)
- [26. Broadcast Messages](#26-broadcast-messages)

### Care & Reminders (5 features)
- [27. Feeding Reminders](#27-feeding-reminders)
- [28. Mood Reminders](#28-mood-reminders)
- [29. Walk Reminders](#29-walk-reminders)
- [30. Vaccine Reminders](#30-vaccine-reminders)
- [31. Medication Compliance Reminders](#31-medication-compliance-reminders)

### Other (5+ features)
- [32. Playdates](#32-playdates)
- [33. Streaks & Milestones](#33-streaks--milestones)
- [34. Pet Profiles & Roles](#34-pet-profiles--roles)
- [35. SOS & Lost Pet Tracking](#35-sos--lost-pet-tracking)
- [36. Events & Calendar](#36-events--calendar)
- [37. Weight Tracking](#37-weight-tracking)
- [38. Admin Console](#38-admin-console)

---

## Core Platform

### 1. Notifications (Push + In-App Inbox)

**What it is:** Desktop push notifications + in-app notification_logs table inbox. Users can tap to navigate, mark as read, delete, or perform actions (feed pet, log walk, etc.).

**Why:** Central hub for reminders (meals, meds, appointments) and social alerts (follows, playdates, mentions).

**User Flow:**
1. Edge function triggers (cron, user action, real-time event)
2. Push sent to device via Expo Notifications + row inserted into notification_logs
3. User sees badge count, taps notification or opens app
4. User marks as read, taps to navigate, or (for care reminders) taps "Mark Done"
5. Mark Done → logs the action (feeding, walk, etc.) + removes notif from inbox

**Data Model:**
- `notification_logs` — user_id, type, title, body, data, read, created_at
- `push_tokens` — user_id, token, platform, device_name, updated_at
- Constraints: `UNIQUE(token)` on push_tokens, CHECK on notification_logs.type

**Key Code:**
- `features/social/hooks/useNotificationsData.ts` — dedup + mark-done + cache sync
- `features/social/components/NotifCard.tsx` — notification card + action button
- `features/social/screens/NotificationsScreen.tsx` — inbox list + filters
- `store/notifStore.ts` — cache + unread count
- `shared/services/notifications.service.ts` — push registration

**Acceptance Criteria:**
- [ ] Mark notif as done → disappears + stays gone on refresh
- [ ] Unread count updates on mark-read
- [ ] Notification tap → correct screen + pet context
- [ ] No "come back" bug (notification re-appears)

**Known Issues:**
- None (fixed in 2026-08-02)

---

### 2. Settings & Personalization

**What it is:** User-controlled preferences: dark mode toggle, quiet hours (suppress push), notification type preferences.

**Why:** Users need control over experience (theme, noise).

**User Flow:**
1. Open Settings tab
2. Toggle Dark Mode → theme updates everywhere immediately
3. Set Quiet Hours (start/end time) → no push during these hours (in-app always lands)
4. Opt-out of specific notification types (e.g., "no daily tips")

**Data Model:**
- `preference_store` — user_id, dark_mode (bool), quiet_hours_start (time), quiet_hours_end (time), opted_out_types (array)

**Key Code:**
- `app/(tabs)/settings.tsx` — settings screen
- `store/preferenceStore.ts` — dark mode, quiet hours, notification prefs
- `lib/ThemeContext.tsx` — theme provider

**Acceptance Criteria:**
- [ ] Toggle dark mode → colors update on all screens
- [ ] Set quiet hours → no push 8pm-8am (in-app still lands)
- [ ] Opt-out of type → that notif never lands
- [ ] Settings persist after close/reopen app

---

### 3. Subscription Tiers & Billing

**What it is:** Three tiers (Free/Pro/Ultimate) controlling feature access. RevenueCat manages subscriptions.

**Why:** Monetization + feature gating.

**Tier Breakdown:**
| Feature | Free | Pro | Ultimate |
|---|---|---|---|
| Pet profiles | ✓ | ✓ | ✓ |
| Feeding/mood logs | ✓ | ✓ | ✓ |
| 2 mood scans/day | ✓ | - | - |
| 10 mood scans/day | - | ✓ | ✓ |
| Health records | - | ✓ | ✓ |
| Appointments | - | ✓ | ✓ |
| Symptom scan | - | - | ✓ |
| Vet chat | - | - | ✓ |
| Parse health docs | - | ✓ | ✓ |
| Parse receipts | - | - | ✓ |

**Data Model:**
- `subscription_tier` (free/pro/ultimate) on profiles table
- RevenueCat manages purchases + subscription state

**Key Code:**
- `store/subscriptionStore.ts` — tier, usage limits, quota tracking
- `lib/hooks/usePaywall.ts` — feature gating + upgrade alerts
- `supabase/functions/sync-subscription` — RevenueCat webhook listener

**Acceptance Criteria:**
- [ ] Free user sees upsell on locked features
- [ ] Pro user can access Pro features, upsell for Ultimate
- [ ] Ultimate user has all features
- [ ] Downgrade removes access instantly
- [ ] Quota persists on app reopen

---

## Health Tracking (8 features)

### 4. Feeding Logs

**What it is:** Record when pet was fed. Three meal slots per day (breakfast/lunch/dinner).

**Why:** Track feeding habit, send reminders, calculate care completion %.

**User Flow:**
1. Open Care → Today tab
2. Tap "Fed" on breakfast slot
3. Timestamp recorded
4. Care completion % updates

**Data Model:**
- `feeding_logs` — pet_id, date, meal_type (breakfast/lunch/dinner/water), fed_by, fed_at

**Dedup Logic:**
```typescript
const { count } = await supabase
  .from('feeding_logs')
  .select('id', { count: 'exact', head: true })
  .eq('pet_id', petId)
  .eq('date', today)
  .eq('meal_type', meal_type);
if ((count ?? 0) === 0) {
  await insertFeedingLog({ /* ... */ });
}
```

**Acceptance Criteria:**
- [ ] Log feeding → appears in Care-Today
- [ ] No duplicate logs on double-tap
- [ ] Care % updates (1/3 → 2/3 → 3/3)
- [ ] Data persists on refresh

---

### 5. Mood Logs

**What it is:** AI analyzes pet photo → mood label + emotion breakdown (happy/playful/tired/anxious %) + advice.

**Why:** Monitor emotional well-being, get personalized advice.

**User Flow:**
1. Open AI → Mood Camera
2. Take photo
3. AI analyzes (Gemini Vision)
4. Shows mood + emotion % + advice
5. User can adjust mood or save

**Data Model:**
- `mood_logs` — pet_id, date, mood_label, mood_score, happy/playful/tired/anxious_pct, photo_url, notes, advice, situation

**Tier:** Pro+ (free: 2/day, pro: 10/day)

**Acceptance Criteria:**
- [ ] Photo → AI returns mood + emotion breakdown
- [ ] User can adjust mood before save
- [ ] Saved to mood_logs
- [ ] Mood scan-ready push fires if user navigates away during scan

---

### 6. Medications

**What it is:** Track pet medications. Set schedule + dosage. Log doses.

**Why:** Ensure medications taken on time.

**User Flow:**
1. Open Health → Medications
2. Add medication (name, dosage, frequency)
3. Set start/end date
4. Log doses as taken
5. View compliance history

**Data Model:**
- `medications` — pet_id, name, dosage, frequency, start_date, end_date, vet_id
- `medication_logs` — medication_id, date, taken (bool), logged_by, logged_at

**Edge Function:**
- `med-compliance-check` — cron nightly; checks if doses logged

**Acceptance Criteria:**
- [ ] Add medication → appears in list
- [ ] Log dose → added to medication_logs
- [ ] Compliance view shows history
- [ ] Reminders fire for missed doses

---

### 7. Appointments

**What it is:** Schedule vet appointments. Optional voice input (AI parses).

**Why:** Never miss vet visit.

**User Flow (Text):**
1. Open Health → Appointments
2. Add appointment (title, date, time, type, vet, notes)
3. Set to calendar
4. Get reminders

**User Flow (Voice):**
1. Open Health → Appointments
2. Tap "Speak it 🎙️"
3. Record ≥10 seconds (e.g., "Checkup with Dr. Smith on Friday at 2pm")
4. AI parses → returns structured appointment
5. Review + save or edit

**Data Model:**
- `appointments` — pet_id, title, date, time, type, notes, vet_id

**Edge Function:**
- `parse-appointment-voice` — AI parses transcript, normalizes type aliases, corrects past years

**Acceptance Criteria:**
- [ ] Add appointment → appears in calendar
- [ ] Reminders fire 24h before
- [ ] Voice parsing handles "checkup" → "regular_checkup"
- [ ] Voice parsing corrects "2025" to current year

---

### 8. Vaccines

**What it is:** Track vaccine history + due dates.

**Why:** Ensure pet stays up-to-date on vaccines.

**User Flow:**
1. Open Health → Vaccines
2. Add vaccine (name, date given, next due)
3. Reminders fire before due date
4. Mark as given when appointment done

**Data Model:**
- `vaccines` — pet_id, name, date_given, next_due, vet_id

**Edge Function:**
- `send-vaccine-reminder` — cron; reminders for upcoming/overdue vaccines

**Acceptance Criteria:**
- [ ] Add vaccine → appears in list with due date
- [ ] Overdue vaccines show warning
- [ ] Reminders fire before due date

---

### 9. Health Records (Parsing)

**What it is:** Upload PDF/image health records. AI extracts structured data.

**Why:** Digital health record keeping + AI-readable data for vet context.

**User Flow:**
1. Open Health → Records
2. Upload PDF or take photo of document
3. AI parses (text pages vs image pages, different models)
4. Shows extracted data (diagnosis, prescriptions, notes)
5. Saves to DB

**Data Model:**
- `health_records` — pet_id, url (to PDF/image), extracted_data (JSON), parsed_at

**Edge Function:**
- `parse-health-record` — Gemini Vision for images, OCR for text

**Tier:** Pro+

**Acceptance Criteria:**
- [ ] Upload PDF → parses text pages
- [ ] Upload photo → parses image pages
- [ ] Extracted data shows in UI
- [ ] Data saved to DB

---

### 10. Insurance Documents (Parsing)

**What it is:** Upload insurance policy. AI extracts policy fields.

**Why:** Quick access to policy info (coverage limits, deductible, provider contact).

**User Flow:**
1. Open Health → Insurance
2. Upload policy photo/PDF
3. AI extracts (provider, policy #, coverage limits, deductible, contact)
4. Shows extracted info
5. Can reference later

**Data Model:**
- `insurance_documents` — pet_id, policy_number, provider, coverage_limit, deductible, contact_info, extracted_data (JSON)

**Edge Function:**
- `parse-insurance-doc` — Gemini Vision; extracts policy fields

**Tier:** Any (no gate)

**Acceptance Criteria:**
- [ ] Upload photo → AI extracts policy fields
- [ ] Shows extracted info in UI
- [ ] Can reference policy later

---

### 11. Receipts (Parsing)

**What it is:** Upload vet/pet store receipt. AI extracts line items + amounts.

**Why:** Track expenses by category (vet visit, food, medication, etc.).

**User Flow:**
1. Open Health → Expenses
2. Upload receipt photo
3. AI extracts line items
4. Shows category breakdown + total
5. Saves for expense tracking

**Data Model:**
- `receipts` — pet_id, url, total_amount, extracted_items (JSON: [{category, amount, confidence}]), parsed_at

**Edge Function:**
- `parse-receipt` — DeepSeek Vision; extracts items + amounts + categories

**Tier:** Ultimate

**Acceptance Criteria:**
- [ ] Upload receipt → AI extracts line items
- [ ] Shows category breakdown
- [ ] Stores for expense reports

---

## AI Features (10 features)

### 12. Mood Scan

*See Health Tracking § 5*

---

### 13. Symptom Scan

**What it is:** Photo + symptom description → urgency level + possible causes + home care + vet advice.

**Why:** Quick triage before vet visit.

**User Flow:**
1. Open AI → Symptom Scan
2. Take photo + describe symptoms
3. AI analyzes (DeepSeek + Gemini Vision)
4. Shows urgency (🟢 monitor / 🟡 schedule / 🔴 urgent)
5. Shows summary, possible causes, home care, watch-for items
6. Can tap "Ask PetDoc a follow-up" → context silently injected into Vet Chat

**Data Model:**
- Results NOT stored; only mood_logs + vet_chat_sessions stored
- Context passed as URL param to Vet Chat

**Tier:** Ultimate

**Acceptance Criteria:**
- [ ] Photo + symptoms → AI returns urgency + causes
- [ ] Tap "Ask PetDoc" → navigates to Vet Chat with context
- [ ] Context invisible to user (silent injection)

**Related:** See Vet Chat § 14 for context injection pattern.

---

### 14. Vet Chat (PetDoc)

**What it is:** Multi-turn conversation with AI vet assistant. Stateless (app stores history).

**Why:** 24/7 vet-like advice.

**User Flow:**
1. Open AI → Vet Chat (or from Symptom Scan)
2. Type question (e.g., "should I go to the vet?")
3. AI responds with full context awareness
4. Multi-turn conversation
5. History saved per pet

**Data Model:**
- `vet_chat_sessions` — user_id, pet_id, messages (JSON array: [{role, text}]), summary, updated_at
- NO server-side AI history; app manages it locally

**Stateless Architecture:**
- App builds message array locally
- Sends to edge function per message
- Edge function responds with full history context
- App stores response locally

**Context Injection (from Symptom Scan):**
- Scan context encoded as URL param
- Silently prepended to first user message
- AI sees context; user doesn't

**Tier:** Ultimate

**Acceptance Criteria:**
- [ ] Multi-turn conversation works
- [ ] History persists per session
- [ ] From Symptom Scan → context applied silently
- [ ] User never sees injected preamble

---

### 15. Daily Tips

**What it is:** AI generates personalized care tip per pet daily.

**Why:** Educational + engagement.

**User Flow:**
1. User receives daily tip push (configurable time)
2. Tap → reads full tip in-app
3. Can save/bookmark tip

**Data Model:**
- Tips generated on-the-fly; not stored

**Edge Function:**
- `send-daily-tip` — AI generates (DeepSeek → Gemini) based on pet species/breed/age/meds/upcoming appointments

**Acceptance Criteria:**
- [ ] Daily push lands at configured time
- [ ] Tap → shows full tip
- [ ] Tip is relevant to pet (not generic)

---

### 16. Pet Timeline Generation

**What it is:** AI generates narrative timeline of pet's memorable moments from the past year.

**Why:** Keepsake + memory preservation.

**User Flow:**
1. Open Memories → Timeline
2. Tap "Generate Timeline"
3. AI fetches 1 year of photos + mood logs + appointments
4. Generates narrative (e.g., "X had an exciting first vet visit in January...")
5. Shows in UI

**Data Model:**
- Generated on-the-fly; not stored

**Edge Function:**
- `generate-pet-timeline` — calls `get_pet_journal` RPC; AI writes narrative (DeepSeek → Gemini)

**Tier:** Pro+ (max 4/year)

**Acceptance Criteria:**
- [ ] Generate → AI writes timeline narrative
- [ ] Timeline includes key milestones (vet visits, mood scans)
- [ ] Quota enforced (4/year)

---

### 17. Year-in-Review Video

**What it is:** AI generates video montage of year's best photos with captions + music.

**Why:** Shareable memory artifact.

**User Flow:**
1. Open Memories → Year in Review
2. Tap "Generate Video"
3. AI picks best 6-8 photos from year
4. Generates captions per photo
5. Creates video with background music
6. User can share

**Edge Function:**
- `yir-video-gen` — Gemini Vision picks photos + writes captions; video stitched server-side

**Tier:** Any (no gate)

**Acceptance Criteria:**
- [ ] Generate → video created
- [ ] Photos are from the year
- [ ] Captions are relevant
- [ ] Video is shareable

---

### 18. Nearby Places (Yelp)

**What it is:** Find nearby pet-friendly places (parks, vets, pet stores).

**Why:** Exploration + vet finding.

**User Flow:**
1. Open Explore → Nearby
2. Shows map with nearby places (parks, vets, pet stores)
3. Tap place → details (hours, rating, address, phone)
4. Can navigate to place

**Data Model:**
- Results fetched on-the-fly; not stored

**API:**
- Yelp Fusion (primary) → Overpass/OSM (fallback)
- DeepSeek generates 1-line captions per place

**Tier:** Any (no gate)

**Known Issues:**
- Yelp 500/day shared quota across all users; rate-limit returns stale cache

**Acceptance Criteria:**
- [ ] Map shows nearby places
- [ ] Tap place → details displayed
- [ ] Can navigate to place

---

## Social (8 features)

### 19. Follow & Followers

**What it is:** Follow other users' pets. See follower/following lists.

**Why:** Build community + see other pets' posts.

**User Flow:**
1. Open Social tab
2. Search for pet / tap pet profile
3. Tap "Follow" → added to followed list
4. See their posts in your feed

**UI:**
- Full-page modal with 2 tabs (Followers / Following)
- Search bar (filters by handle/name)
- Shows pet avatar + owner handle

**Data Model:**
- `follows` — follower_id, following_id (pet_id), created_at

**Acceptance Criteria:**
- [ ] Follow pet → appears in followed list
- [ ] Search filters by handle/name
- [ ] Followed pets' posts in feed

---

### 20. Feed (Posts)

**What it is:** Timeline of posts from followed pets.

**Why:** Social engagement + share memories.

**User Flow:**
1. Open Social → Feed tab
2. See posts from followed pets
3. Can like/comment/share
4. Pull to refresh

**Data Model:**
- `posts` — pet_id, content_id (media), caption, tags (pet_id array), created_at

**UI:**
- FlashList (virtualized) for performance
- Shows pet photo + caption + like/comment counts
- Tap to open full post view

**Acceptance Criteria:**
- [ ] Feed shows posts from followed pets
- [ ] Can like/comment/share posts
- [ ] Pull-to-refresh works
- [ ] No stale state (wrong pet shown)

---

### 21. Comments & Likes

**What it is:** Engage with posts via comments + likes.

**Why:** Social interaction.

**User Flow:**
1. View post
2. Tap heart → like (deduped via UNIQUE(post_id, user_id))
3. Tap comment → add text comment
4. Submit → notifies post owner

**Data Model:**
- `post_likes` — post_id, user_id, created_at (UNIQUE constraint prevents duplicates)
- `post_comments` — post_id, user_id, text, created_at

**Notifications:**
- Like → "X liked your photo"
- Comment → "X commented on your photo"

**Acceptance Criteria:**
- [ ] Like post → appears in likes list
- [ ] No duplicate likes on double-tap
- [ ] Comment → notification sent
- [ ] Comments appear on post

---

### 22. Mentions

**What it is:** Tag other pets in posts/comments via @handle.

**Why:** Collaborative storytelling.

**User Flow:**
1. Write post / comment
2. Type @handle → autocomplete popup
3. Select pet → tagged
4. Post/comment → notifies tagged pet owner

**Data Model:**
- Mentions stored in post/comment text

**Notifications:**
- Mention → "@X mentioned you in a post"

**Acceptance Criteria:**
- [ ] Type @ → autocomplete works
- [ ] Tag appears in post
- [ ] Notification sent to tagged pet owner

---

### 23. Family Invites

**What it is:** Invite family members to see pet profile + care logs.

**Why:** Shared pet care responsibility.

**User Flow:**
1. Open Settings → Family
2. Enter family member email
3. Invite sent (via email + optional push)
4. Family member accepts → gets `family` role on pet
5. Can see profile + care logs

**Data Model:**
- `family_invites` — pet_id, invited_by (user_id), email, token, status, created_at
- `pet_roles` — pet_id, user_id, role (owner/family/vet)

**Edge Function:**
- `send-family-invite` — email via Resend + optional push if invitee has app
- `accept-family-invite` — creates pet_role, sends notif to pet owner

**Acceptance Criteria:**
- [ ] Send invite → email arrives
- [ ] Accept → access granted (can see profile + logs)
- [ ] Permissions enforced (family can't delete pet, etc.)

---

### 24. Lost Pet Alerts

**What it is:** Report pet missing. Push sent to nearby users + followers.

**Why:** Community help finding lost pets.

**User Flow:**
1. Open SOS → Lost Pet
2. Report missing (pet photo, last seen location, description)
3. Creates alert + sends push
4. Nearby users notified
5. Followers notified
6. Alert searchable by location/pet name

**Data Model:**
- `lost_alerts` — pet_id, reported_by (user_id), last_seen_location, last_seen_time, description, status, created_at

**Edge Functions:**
- `send-lost-alert` — sends push to followers + nearby users
- `periodic-lost-alerts` — resends reminder every 15 min

**Acceptance Criteria:**
- [ ] Report missing → alert created
- [ ] Push sent to followers + nearby
- [ ] Alert searchable
- [ ] Can mark found when located

---

### 25. Found Pet Alerts

**What it is:** Report found pet. Push sent to users with matching lost alerts.

**Why:** Reunite lost pets with owners.

**User Flow:**
1. Open SOS → Found Pet
2. Upload photo + location
3. AI checks for matching lost alerts
4. Notifies matching alert creators
5. Can coordinate reunion

**Data Model:**
- `found_alerts` — reported_by (user_id), photo_url, location, timestamp, created_at

**Edge Function:**
- `send-found-alert` — sends push to users with matching lost alerts

**Acceptance Criteria:**
- [ ] Report found → alert created
- [ ] Matching lost alert owners notified
- [ ] Can coordinate reunion

---

### 26. Broadcast Messages

**What it is:** Admin can send broadcast message to all users (or filtered by tier).

**Why:** Important announcements.

**User Flow (User):**
1. Receive push with announcement
2. Tap → opens full message in-app

**User Flow (Admin):**
1. Open Admin → Broadcast
2. Compose message
3. Set recipient filter (all / free / pro / ultimate)
4. Send → pushes to recipients

**Tier Gate:** Admin only (no bypass)

**Acceptance Criteria:**
- [ ] Admin can compose broadcast
- [ ] Filters work (tier targeting)
- [ ] Push lands to correct recipients
- [ ] Message displays in-app

---

## Care & Reminders (5 features)

### 27. Feeding Reminders

**What it is:** Scheduled push reminders to feed pet (breakfast/lunch/dinner).

**Why:** Never forget feeding time.

**Default Times:** 7am (breakfast), 12pm (lunch), 6pm (dinner)

**Edge Function:**
- `send-feeding-reminder` — cron hourly; checks localHour() gate + quiet hours

**User Control:**
- Can customize reminder times per pet
- Can opt-out of specific reminders

**Acceptance Criteria:**
- [ ] Reminders fire at correct times
- [ ] Quiet hours skip (no push 8pm-8am, but in-app still lands)
- [ ] Can mark done → logs feeding

---

### 28. Mood Reminders

**What it is:** Scheduled push reminder to log pet's mood.

**Why:** Regular mood tracking.

**Default Time:** 8pm (configurable)

**Edge Function:**
- `send-mood-reminder` — cron nightly; checks localHour() gate + quiet hours

**User Control:**
- Can customize reminder time
- Can opt-out

**Acceptance Criteria:**
- [ ] Reminder fires at correct time
- [ ] Tap → opens Mood Camera
- [ ] Can skip / snooze

---

### 29. Walk Reminders

**What it is:** Scheduled push reminder to take pet on walk.

**Why:** Regular exercise.

**Default Times:** 8am, 5pm (configurable)

**Edge Function:**
- `send-walk-reminder` — cron; checks localHour() + quiet hours

**User Control:**
- Can customize reminder times
- Can opt-out

**Acceptance Criteria:**
- [ ] Reminders fire at correct times
- [ ] Can mark done → logs to checklist

---

### 30. Vaccine Reminders

**What it is:** Push reminder when vaccine is due or overdue.

**Why:** Prevent missed vaccinations.

**Edge Function:**
- `send-vaccine-reminder` — cron daily; checks for upcoming/overdue vaccines

**Acceptance Criteria:**
- [ ] Reminder fires before due date
- [ ] Shows which vaccine is due
- [ ] Can tap → open Vaccines screen

---

### 31. Medication Compliance Reminders

**What it is:** Push reminder to log medication dose if not logged yet.

**Why:** Ensure medications not missed.

**Edge Function:**
- `med-compliance-check` — cron nightly; checks if doses logged for active medications

**Acceptance Criteria:**
- [ ] Reminder fires if dose not logged
- [ ] Can mark done → logs dose
- [ ] Compliance history updated

---

## Other Features

### 32. Playdates

**What it is:** Peer-to-peer pet meetup scheduling. Users request playdates, accept/decline, meet up.

**Why:** Social engagement for pets + owners.

**User Flow:**
1. View pet profile
2. Tap "Suggest Playdate"
3. Pick date/time/location
4. Send → notification to other pet owner
5. Accept/decline/propose counter-date
6. Status updates on both sides

**Data Model:**
- `playdates` — pet_id_1, pet_id_2, requested_by, status (request/accepted/declined/confirmed/cancelled/expired/completed), date, time, location

**State Machine:** request → accepted/declined → confirmed/cancelled

**UI:** Full-page modal with pet avatars (split avatar), playdate info, accept/decline buttons

**Acceptance Criteria:**
- [ ] Create playdate request → notification sent
- [ ] Accept → both users see confirmed
- [ ] Decline → requesting user sees declined
- [ ] Switch pet → entries reset (no stale data)
- [ ] Buttons receive touches (no gesture swallowing)

**Related:** See ARCHITECTURE.md § Playdates for detailed specs.

---

### 33. Streaks & Milestones

**What it is:** Track pet milestones (first meal logged, 1-month streak, first vet visit, birthday, etc.).

**Why:** Engagement + memory preservation.

**User Flow:**
1. Open Memories → Milestones
2. See streaks (X-day feeding streak, etc.)
3. See milestone badges (first vet visit achieved, 1-year adoption anniversary, etc.)
4. Can view milestone timeline

**Data Model:**
- `milestones` — pet_id, date, type (feeding_streak, mood_scan_count, vet_visit, birthday, adoption_anniversary), milestone_data (JSON)

**Edge Functions:**
- `milestone-cron` — inserts day-count milestones
- `generate-milestones` — generates narrative for special milestones

**Acceptance Criteria:**
- [ ] Streaks display correctly
- [ ] Milestone badges awarded when threshold hit
- [ ] Milestone timeline shows in chronological order

---

### 34. Pet Profiles & Roles

**What it is:** Create pet profiles. Assign roles (owner/family/vet) to control permissions.

**Why:** Multi-user pet management + permission control.

**User Flow (Owner):**
1. Create pet (name, species, breed, birthday, photo)
2. Invite family members → they get `family` role
3. Invite vet → they get `vet` role
4. Each role has limited permissions (family: view only; vet: view + add medical notes)

**Data Model:**
- `pets` — owner_id, name, species, breed, birthday, weight_kg, accent_color
- `pet_roles` — pet_id, user_id, role (owner/family/vet)

**Permissions:**
- Owner: full access
- Family: view profile + care logs, log care, cannot delete/edit pet
- Vet: view profile + health records, add appointment notes, cannot log daily care

**Acceptance Criteria:**
- [ ] Create pet → appears in pets list
- [ ] Assign roles → permissions enforced
- [ ] Family can see logs, can't delete pet
- [ ] Vet can add medical notes

---

### 35. SOS & Lost Pet Tracking

**What it is:** Emergency feature to report lost pet + track community response.

**Why:** Quick reunification.

**User Flow:**
1. Open SOS tab
2. Tap "Mark Lost" → enters location + details
3. Followers + nearby users notified
4. Can track responses / found pet reports
5. Mark "Found" when located

**Data Model:**
- `lost_alerts` — pet_id, reported_by, last_seen_location, status (lost/found/cancelled)
- `found_alerts` — reported_by, photo, location, relates to lost_alerts
- `sos_responses` — lost_alert_id, responder_id, response_type (found/sighting/tip), location, message

**Acceptance Criteria:**
- [ ] Report lost → push to community
- [ ] Nearby users notified
- [ ] Can track found/sighting reports
- [ ] Mark found → alert closed

---

### 36. Events & Calendar

**What it is:** Create + track pet events (birthdays, adoption anniversaries, special moments).

**Why:** Remember important dates.

**User Flow:**
1. Open Calendar
2. Add event (type: birthday/anniversary/vet visit/playdate/other)
3. Set reminder (day before, week before, etc.)
4. See in calendar view
5. Get reminders on date

**Data Model:**
- `pet_events` — pet_id, type, date, title, description, recurring (bool), created_by

**Acceptance Criteria:**
- [ ] Add event → appears in calendar
- [ ] Reminders fire before date
- [ ] Can set recurring events
- [ ] Event details editable

---

### 37. Weight Tracking

**What it is:** Log pet's weight over time. Track trend (gaining/losing/stable).

**Why:** Monitor health.

**User Flow:**
1. Open Health → Weight
2. Log weight + date
3. See weight history (chart)
4. Trend shows (up/down/stable arrow)
5. Can see goal weight (if set)

**Data Model:**
- `weight_logs` — pet_id, date, weight_kg, logged_by, notes

**Acceptance Criteria:**
- [ ] Log weight → appears in history
- [ ] Chart shows trend over time
- [ ] Can set goal weight

---

### 38. Admin Console

**What it is:** Admin-only panel to manage push notifications, user moderation, feature flags.

**Why:** Operational control.

**Admin Features:**
- Send broadcast messages (to all / by tier)
- View user reports
- Manage feature flags
- View analytics (DAU, tier breakdown, etc.)
- Moderate user accounts (suspend/delete)

**Data Model:**
- Admin users flagged with `is_admin = true` in profiles
- Feature flags in `app_settings` table
- Moderation logs in `moderation_actions` table

**Access:** Admin only (RLS enforced)

**Acceptance Criteria:**
- [ ] Admin can access console
- [ ] Can send broadcast
- [ ] Can suspend users
- [ ] Feature flags toggle works

---

## Cross-Feature Patterns

### Pattern: Pet Context

Nearly every screen needs active pet context:
```typescript
const { activePet } = usePetStore(useShallow(s => ({ activePet: s.activePet })));
const pet = activePet();
if (!pet?.id) return null;  // Guard
```

### Pattern: Tier Gating

```typescript
const tier = useContextTier(pet?.id);
const allowed = tier === 'ultimate' || tier === 'pro';
if (!allowed) {
  showUpgradeAlert({ requiredTier: 'pro' });
  return;
}
```

### Pattern: Care Progress

Shared formula used by widget, Home, Care-Today:
```typescript
const progress = computeCareProgress({ petId, today, checklist, feedingLogs, moodLogs });
```

---

## Testing Checklist

Before shipping ANY feature:

- [ ] `npx tsc --noEmit` = 0 errors (source)
- [ ] Dev server runs without crashes
- [ ] Feature works on iOS Simulator
- [ ] Dark mode works
- [ ] Permissions requested (if needed)
- [ ] Notifications land + actions fire
- [ ] No stale state (switch pets, refresh)
- [ ] Tier gating enforced
- [ ] Deep links work (notif → screen + context)
- [ ] No double-tap duplicates

---

**Maintained with ❤️ by multi-agent protocol**  
**Last Updated:** 2026-08-02
