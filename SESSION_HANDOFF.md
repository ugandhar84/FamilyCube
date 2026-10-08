# Session Handoff — feat/today-digest-redesign
**Date:** 2026-10-08  
**Branch:** `feat/today-digest-redesign`  
**Status:** TypeScript clean (0 errors). Build running on device.

---

## What Was Built This Session

### Review Inbox — Full FullPageOverlay Stack
- `ReviewInboxScreen.tsx` — landing page with 4 category cards (Chores & Quests / Rewards / Kid Requests / Disputes), real counts from all stores, dismissible tip banner, segmented filter (Pending/Decided/All)
- `ChoresReviewQueueScreen.tsx` (NEW) — rich queue with photo thumbnails, `requiresPhotoProof` flag, relative waiting time, stale escalation badges, note preview, per-category icons
- `ReviewCategoryQueueScreen.tsx` (NEW) — generic reusable queue for Rewards/Help categories
- `DisputesInboxScreen.tsx` (NEW) — both dispute types (`kid_disputed_redo`, `reversal_requested`), safety-rail peach card, segmented Open/Resolved/All
- `RedoDisputeReviewScreen.tsx` (NEW) — kid-disputed redo resolution, Approve & pay / Side with redo, self-resolve guard surfaced as UI explanation
- `ReversalCoSignReviewScreen.tsx` (NEW) — reversal co-sign, only original approver can sign, requester sees disabled state

### QuestDetailModal — Single Source of Truth
- Deleted `ChoreProofReviewScreen.tsx` and `QuestReviewScreen.tsx`
- All Review inbox chore/quest taps now route to `QuestDetailModal`
- Added: real `chore_submissions` history, Decline button, balance-impact card, decision-receipt footer, `SectionLabel` component (2px accent underline bar, matches Hub heading style), status pill below title showing "Awaiting review · [Name]" in danger color, call reminder as single cycling chip in same row as status pill
- `pendingApprovalAssigneeFirst` — status pill says assignee's name

### Rides — FullPageOverlay Migration
- `RidesStatusCard.tsx` (NEW) — always-visible full-width Hub card, idle state, `withoutDriverCount`/`ongoingCount` breakdown chips, 4-stage progress bar
  - Labels: pill says **"Who's driving?"** (not "Needs a driver"), breakdown chip says **"N need a driver"**
- `HubScreen.tsx` — added `showRidesRoom` + `activeTripDetailId` state; `fullBleedScreenActive` includes Rides; FullPageOverlay stack for both Rides screens
- `ParentView.tsx` — accepts `onRidesOpen` prop, removed old `Modal` blocks for Rides, `RidesStatusCard` calls `onRidesOpen`; NeedsYouCard urgency gating (2h window, overdue, emergency-flagged)

### GPS Trip Automation
- `lib/tripGeofencing.ts` (NEW) — expo-location geofence at pickup point, 150m radius, auto-advances trip to `picked_up` phase
- `lib/tripEta.ts` (NEW) — haversine distance + live speed, 25mph fallback when stopped
- `lib/hooks/useLiveTripEta.ts` (NEW) — Supabase realtime subscription to `member_locations`
- `store/tripStore.ts` — auto-starts at `en_route` on dispatch, persists `pickup_lat`/`pickup_lng`/`pickup_label`, calls `registerTripGeofence`
- `features/hub/parent/DispatchRideSheet.tsx` — "pin it" button next to pickup field, passes coords to dispatch

### DB Migrations
- `20260987000000_trips_pickup_coordinates.sql` — adds `pickup_lat`, `pickup_lng`, `pickup_label` to trips
- `20260988000000_chore_submission_history.sql` — creates `chore_submissions` append-only table; updates `submit_chore`, `request_redo`, `approve_chore` RPCs
- `20260989000000_redo_dispute_single_parent_fallback.sql` — `resolve_redo_dispute` allows same-parent resolution when no other approver exists

### Other Fixes
- Recurring chore grace period: `graceDays = weekly→7, monthly→31`; blocks early submit only outside grace window
- `colors.sky` / `colors.skyLight` used throughout RidesStatusCard (confirmed they exist in `constants/colors.ts`)

---

## File Map — New Files This Session

| File | What it is |
|------|-----------|
| `components/FullPageOverlay.tsx` | slide/fade full-page overlay + SwipeBackWrapper |
| `components/SwipeBackWrapper.tsx` | edge-swipe gesture wrapper |
| `features/hub/parent/ChoresReviewQueueScreen.tsx` | Rich chore review queue |
| `features/hub/parent/ReviewCategoryQueueScreen.tsx` | Generic reusable queue |
| `features/hub/parent/DisputesInboxScreen.tsx` | Disputes landing |
| `features/hub/parent/RedoDisputeReviewScreen.tsx` | Redo dispute resolution |
| `features/hub/parent/ReversalCoSignReviewScreen.tsx` | Reversal co-sign |
| `features/hub/parent/RidesStatusCard.tsx` | Hub rides summary card |
| `features/hub/parent/ChoresReviewQueueScreen.tsx` | see above |
| `lib/tripGeofencing.ts` | GPS geofence for trip automation |
| `lib/tripEta.ts` | Haversine ETA computation |
| `lib/hooks/useLiveTripEta.ts` | Realtime ETA hook |
| `supabase/migrations/20260987000000_trips_pickup_coordinates.sql` | — |
| `supabase/migrations/20260988000000_chore_submission_history.sql` | — |
| `supabase/migrations/20260989000000_redo_dispute_single_parent_fallback.sql` | — |

---

## Pending / Next Session

1. **Apply DB migrations** — three new SQL files need `supabase db push` / manual apply in production
2. **Pastel color fills for ride cards** — user said "ride cards should be different pastel color fill"; `TripCard` in `RidesControlRoomScreen.tsx` currently uses `colors.card` (white); each card type should get a distinct pastel (e.g., `colors.tealLight` for confirmed/ongoing trips, `colors.amberLight` for unassigned, `colors.pinkLight` for completed)
3. **Evening wrap-up card** — user asked about a "summarized card so before going to bed they can see what they need to take a look"; agreed to build but not yet implemented; suggest a time-gated card in `ParentView.tsx` that shows after 8 PM
4. **ActiveTripDetailScreen** — verify it correctly shows live ETA from `useLiveTripEta` hook and uses pastel card background
5. **GPS return-home automation** — `tripGeofencing.ts` only handles pickup→`picked_up`; the `picked_up`→`arrived` leg stays manual until a per-family home address field exists; when that's added, wire a second geofence region using the same `registerTripGeofence` pattern
6. **`TodayActionGrid` schedule counter** — confirm "Schedule" tile shows meaningful event counts (events today vs. total this week)

---

## Architecture Notes (Don't Repeat These Mistakes)

- **FullPageOverlay state lives in HubScreen**, not in ParentView — ParentView only gets callback props (`onRidesOpen`, `onReviewOpen`) and calls them; HubScreen owns `showRidesRoom`, `showReviewInbox`, etc.
- **RidesControlRoomScreen + ActiveTripDetailScreen** both need `onClose` / `onSelectTrip` props; they are NOT standalone screens, they're overlay children
- **`getParentReviewDeck()`** — only returns `status === 'pending_approval'`; dispute items live under separate `status` values (`kid_disputed_redo`, `disputeStatus: 'reversal_requested'`) and must be fetched separately for `DisputesInboxScreen`
- **`colors.sky` / `colors.skyLight`** exist in both light and dark palettes in `constants/colors.ts` — safe to use for ride/transport UI
- **Never hardcode hex** — all pastel fills must use `colors.*Light` tokens

---

## Push/Notifications Rules (Always Apply)
See CLAUDE.md Push/VoIP-Call/Notification Rules — especially:
- Every push send path must persist outcome to a `delivery_result`-style column
- Stale tokens (`BadDeviceToken`, `NotRegistered`) must be deleted immediately
- Per-device state uses `(member_id, device_id)` keyed table, never a single column on the member row
- Self-assignment is always auto-confirmed

---

*Last updated by Claude Sonnet 4.6 on 2026-10-08*
