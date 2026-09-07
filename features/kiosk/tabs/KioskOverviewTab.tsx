/**
 * KioskOverviewTab — the "Hub Overview" dashboard from the reference
 * mockup, rebuilt as real React Native against real data.
 *
 * Layout follows the mockup exactly: a hero card (greeting + live status +
 * quick actions) paired with a summary panel, then a widget deck, then a
 * full-width FindFam radar strip. What each widget SHOWS is different in
 * one important way — every number on this screen is read from a real
 * store, and any widget with nothing real behind it is not rendered rather
 * than shown with placeholder content.
 *
 * Mapping from the mockup's widgets to this app's actual features:
 *
 *   mockup                     here                       source
 *   ─────────────────────────────────────────────────────────────────────
 *   Pickup Radar               Ride & pickup              eventStore
 *                              (Remind / Take over)       (eventAssignee,
 *                                                          remindEventAssignee,
 *                                                          claimHelperSlot)
 *   Kitchen Stove Timers       — REMOVED —                (owner: out of scope)
 *   Kids Piggy Banks           Kids' coin jars            familyStore
 *                                                          (mainCoins/gpCoins)
 *   Tonight's dinner           Tonight's dinner           family_meals
 *                              (part of the hero panel)   (useKioskMeals)
 *   FindFam GPS Radar          Family radar strip         member_locations
 *   Kept photo frame           Kept (photo frame)         family_memories
 *                              (widget deck)              (useKioskPhotos)
 *   Weather 72°F Sunny         — omitted —                no weather API
 *                                                          exists; a fake
 *                                                          temperature on a
 *                                                          kitchen wall is
 *                                                          worse than none
 *
 * Role scoping is not decorative here. A kiosk is a shared surface in a
 * room anyone can walk into, so the coin-jar widget (other people's
 * balances) and the ride actions (which write) are parent-only, matching
 * how the phone already gates the same capabilities.
 *
 * ── The kid Overview ────────────────────────────────────────────────────
 * Role scoping used to mean only SUBTRACTION — a kid got the parent's
 * dashboard with the parent-only pieces missing, which left them looking
 * at rides they can't drive and a grocery list they aren't shopping for,
 * with nothing of their own anywhere on the screen. `isKid` below turns
 * that into a real composition instead. Top to bottom, a kid now sees:
 *
 *   1. the hero — greeting + today's summary, then a single non-wrapping
 *      quick-action strip: Intercom (everyone) plus, for kid, Check In /
 *      Piggy Bank / Cheer Squad / My Requests — the "glance at my own
 *      state, tap once" actions, promoted to the same prominence as the
 *      household's own Intercom button
 *   2. "Your stuff" — the eight-way Ask-a-Parent menu (Ride / Permission /
 *      Question / Medication Alert / Grocery / Supplies / Suggest a Chore /
 *      Propose a Chore), each its own directly-tappable tile with no
 *      picker step, kept as its own labeled card because a browse-then-
 *      pick menu is a different shape from the hero row's five
 *   3. My schedule — today's events that are theirs, resting on now
 *      (replaces Ride & pickup in that slot)
 *   4. My chores — their status breakdown in the Chores board's own
 *      vocabulary plus the up-for-grabs pool (replaces Grocery list)
 *   5. the photo frame and the FindFam strip — unchanged, shared family
 *      content that reads the same to everyone
 *
 * Teen and parent are deliberately untouched by all of the kid-specific
 * composition above; the owner's ask was specifically about kids, and
 * inventing a narrower teen variant nobody asked for is how role gating
 * drifts.
 *
 * ── The senior/grandparent Overview ─────────────────────────────────────
 * Senior got a smaller version of the same fix, for the same underlying
 * problem: before this, a grandparent's widget deck was the parent's deck
 * with the parent-gated pieces silently missing (no coin jars, rides shown
 * read-only with no actions) plus a household grocery list that isn't
 * theirs either — subtraction, not composition, same anti-pattern kid used
 * to have. Unlike kid, this is NOT a denser replacement: the design brief
 * is explicit that Grandparent keeps its own "one-decision-at-a-time"
 * simplicity even as the other roles' Hubs get more visually dense, so
 * `isSenior` swaps the Rides + Grocery slots for exactly one calm summary
 * card (SeniorTasksWidget: what's open, up to three titles, a link to the
 * full board — no inline actions) and gives the photo feed a taller,
 * more generous frame as this role's warm centerpiece, rather than adding
 * more widgets.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, Image, useWindowDimensions, Alert, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import {
  Car, UtensilsCrossed, Bell, Check, ChevronRight,
  Megaphone, BatteryLow, ChefHat, CheckSquare, X, UserCheck,
  AlertTriangle, MapPin, AlertOctagon,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore, eventAssignee, type FamilyEvent } from '@/store/eventStore';
import { deriveEventActions, eventAssigneeRole } from '@/features/tasks/lib/deriveCardActions';
import { usePendingUnconfirmedEvents } from '@/features/hub/usePendingUnconfirmedEvents';
import { useUpcomingOpenEvents } from '@/features/hub/useUpcomingOpenEvents';
import { classifyEventUrgency } from '@/features/hub/lib/classifyEventUrgency';
import { dedupeRideSeries } from '@/features/hub/lib/dedupeRideSeries';
import { isHomeLocation, hoursUntilEvent, isWorkEvent, minutesBetween } from '@/features/hub/hubUtils';
import { detectAssigneeConflicts, detectWorkConflicts } from '@/features/hub/lib/detectAssigneeConflicts';
import { AlertBanner } from '@/features/hub/hubComponents';
import { useTripStore } from '@/store/tripStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore, REJECTION_PRESETS, type RejectionPresetKey } from '@/store/choreStore';
import { HouseholdBacklogSection } from '@/features/hub/parent/HouseholdBacklogSection';
import { ActionNeededSection } from '@/features/hub/parent/ActionNeededSection';
import { PushbackSheet } from '@/features/hub/parent/PushbackSheet';
import { DelegateSheet } from '@/features/hub/parent/DelegateSheet';
import { useGroceryStore, type GroceryRun } from '@/store/groceryStore';
import { useRewardStore } from '@/store/rewardStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useChatStore } from '@/store/chatStore';
import { supabase } from '@/lib/supabase';
import { decryptLocationText } from '@/lib/locationCrypto';
import { fmtTime, localDateStr } from '@/lib/dates';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { useKioskColors, kioskRoleAccent, kioskOnAccent, type KioskColors } from '../kioskPalette';
import { WidgetCard, WidgetHeader, PanelHead, Well, Chip, ActionButton, EmptyNote, KioskListRow, KioskListRowAction } from '../components/KioskOS';
import { KioskFormDrawer, KioskFieldLabel, KioskPill, kioskInputStyle } from '../components/KioskFormDrawer';
import { KioskMemorySlideshow } from '../components/KioskMemorySlideshow';
import { useKioskPhotos } from '../useKioskPhotos';
import { KioskRecipeDrawer } from '../components/KioskRecipeDrawer';
import type { Meal } from '@/features/vault/tabs/meals/types';
import { useKioskMeals, todayMealDay, daysFromToday } from '../useKioskMeals';
import { KioskKidQuickActions, KioskKidCheckInTile, KioskKidMineTile } from '../components/KioskKidQuickActions';
import { KidTodayWidget, KidChoresWidget } from '../components/KioskKidWidgets';
import { KioskDisputeApprovalWidget } from '../components/KioskDisputeApprovalWidget';
import { KioskEventEditor } from '../components/KioskEventEditor';
import { KioskRunDetailSheet } from '../components/KioskRunDetailSheet';
import type { KioskTabKey } from '../kioskTabs';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import { ParentReviewDeck } from '@/features/chores/ParentReviewDeck';
import { MedicationsCard } from '@/features/hub/senior/MedicationsCard';
import { useMedications } from '@/features/vault/tabs/health/useMedications';
import { SendBonusCard } from '@/features/hub/senior/SendBonusCard';
import { DirectPendingCard } from '@/features/hub/parent/backlog/DirectPendingCard';
import { OutgoingPendingCard } from '@/features/hub/parent/backlog/OutgoingPendingCard';
import { LockedAssignmentCard } from '@/features/hub/parent/backlog/LockedAssignmentCard';
import { YourRidesSection } from '@/features/hub/senior/YourRidesSection';
import { SectionCard, CollapsibleCard } from '@/features/hub/hubComponents';

interface RadarRow {
  member_id: string;
  status: string;
  status_text: string | null;
  neighborhood: string | null;
  battery_level: number | null;
  share_location_enabled?: boolean;
  lat: number | null;
  lng: number | null;
}

/**
 * One row in the unified Approvals widget — the shared shape a chore
 * review, a store redemption, and a kid request all get normalized into so
 * the three real systems behind them can sit in one ranked list instead of
 * three separate badges the parent has to check separately.
 */
interface ApprovalItem {
  id: string;
  kind: 'chore' | 'redemption' | 'request';
  /** ISO timestamp used to order within the same urgency tier — oldest first. */
  sortAt: string;
  title: string;
  who?: string;
  emoji: string;
  meta: string;
  /** Coins on the line, matching the mockup's .task-coin figure. Requests
   *  carry no coin value, same as the mockup (t.coin is 0 there too). */
  coins?: number;
  /** Higher sorts first. Only a kid request's real urgency ever exceeds 1. */
  urgencyRank: 1 | 2 | 3 | 4;
}

const STATUS_LABEL: Record<string, string> = {
  at_home: 'At home',
  at_school: 'At school',
  at_work: 'At work',
  in_transit: 'On the move',
  at_activity: 'At an activity',
};

export function KioskOverviewTab({
  active, members, onNavigate, onIntercom, colors, isDark: phoneDark,
}: {
  active: FamilyMember;
  members: FamilyMember[];
  /** Jump to another kiosk tab — the mockup's quick-action buttons. */
  onNavigate: (tab: KioskTabKey) => void;
  onIntercom: () => void;
  /** Real phone-shaped colors object — needed only for mounting
      KioskEventEditor (its PickerOverlay/LocationAutocompleteInput/
      MemberPicker/HelperAssignmentSection sub-components all take this
      real palette, not the kiosk k.* one). Aliased apart from this file's
      own useKioskColors() isDark below — two genuinely different
      dark-mode flags, same naming collision KioskTasksTab.tsx's own
      kioskDark alias already exists to avoid. */
  colors: any;
  isDark: boolean;
}) {
  const { k, isDark } = useKioskColors();
  // Live-requested: "card sizes and text adjust based on rotation without
  // cutting and trimming or over-zooming." Parent's page is a real 3-column
  // grid (stats rail + centerCol flex + sideCol fixed 340px, matching the
  // mockup's own `.layout{grid-template-columns: 300px 1fr 340px}`) — on a
  // narrower window (a portrait-rotated iPad, roughly 834-1024pt vs.
  // ~1194-1366pt landscape, or any kiosk device smaller than what this was
  // designed against) a fixed 340px sidebar plus a real rail leaves
  // centerCol's Rides/Approvals rows (title+meta+coin+two buttons)
  // genuinely cramped. Below the threshold, centerCol/sideCol stack
  // vertically instead — 1080px, the SAME breakpoint the mock's own
  // @media(max-width:1080px) rule uses to collapse its 3-column grid to
  // `1fr`, not an arbitrary value. Same useWindowDimensions-driven pattern
  // KioskFindFamTab/KioskHubTab/KioskMemoryGrid already use elsewhere in
  // this codebase, not a new one invented for this screen alone.
  const { width: winWidth } = useWindowDimensions();
  const isNarrowParentLayout = winWidth < 1080;
  const isParent = active.role === 'parent';
  // Kid role gets a genuinely different Overview, not the parent's with
  // pieces missing. All swaps below are scoped to `kid` alone — teen,
  // senior and parent are untouched:
  //
  //   parent/others          kid                     why
  //   ───────────────────────────────────────────────────────────────────
  //   Schedule quick tile    — dropped —             Schedule is already a
  //   Grocery quick tile     — dropped —             persistent rail tab,
  //   Meals quick tile       — dropped —             same as Store/Meals —
  //                                                  a second entry point
  //                                                  in the hero row is
  //                                                  redundant, not just
  //                                                  for kid but this cut
  //                                                  applies to everyone
  //   Ride & pickup widget   My schedule             ride coordination is
  //                          (KidTodayWidget)        a co-parent job; the
  //                                                  actions were already
  //                                                  parent-gated, so the
  //                                                  widget was read-only
  //                                                  noise for a kid
  //   Grocery snapshot       My chores               a kid's own board +
  //                          (KidChoresWidget)       the up-for-grabs pool
  //
  // plus the kid Hub's own actions with no rail equivalent, as a labeled
  // "Your stuff" card (KioskKidQuickActions) directly under the hero:
  // Piggy Bank, Cheer Squad, My Requests, and all eight Ask-a-Parent
  // destinations flattened into individual tiles (no picker step — each
  // tile opens its real modal). Check In is the one promoted up into the
  // hero's own quick row next to Intercom.
  const isKid = active.role === 'kid';
  // Senior/grandparent gets its own calm composition too, for the same
  // reason kid did: the parent's widget deck (rides to drive, coin jars for
  // OTHER kids, a household grocery list) is either not theirs to act on or
  // not theirs at all — before this it just silently disappeared piece by
  // piece (parent-gated widgets hide themselves), leaving a sparser deck
  // with nothing of the grandparent's own in its place. Unlike kid, this is
  // deliberately NOT a denser replacement: the design brief calls for
  // Grandparent to keep "one-decision-at-a-time simplicity" rather than the
  // parent/kid Hub's full density, so the swap here is a single calm
  // summary card (SeniorTasksWidget below) plus a taller, more generous
  // photo feed — not a multi-widget board with inline actions.
  const isSenior = active.role === 'senior';
  const isTeen = active.role === 'teen';
  // SendBonusCard's real kid-target scope — SeniorView.tsx's own
  // `kids = members.filter(m => m.role === 'kid')`, kid-role only (not
  // teen — a teen isn't a bonus-eligible target on the real phone either).
  // Named distinctly from this file's own pre-existing `kids` (below, a
  // wider kid+teen coin-jar list with deleted/pending exclusions) since the
  // two have genuinely different real scopes, not interchangeable.
  const gpBonusKids = useMemo(() => members.filter(m => m.role === 'kid'), [members]);
  const allNames = useMemo(() => members.map(m => m.name), [members]);

  const dayEvents = useEventStore(s => s.dayEvents);
  // Real ParentView.tsx's own classifierSource fallback ("upcomingEvents
  // may be briefly empty right after mount — fall back to ... `events`
  // rather than showing an empty backlog for a moment") reads this same
  // top-level `events` field, NOT dayEvents — dayEvents is today-only,
  // events is the fuller loaded set. Matched exactly below rather than
  // substituting the narrower dayEvents as an approximation.
  const allEvents = useEventStore(s => s.events);

  // ── Trip dispatch (real Pick-up Radar "En Route" trips) ──────────────
  // Only two real primitives AlertBanner itself actually needs — the full
  // live-trip-dashboard UI (EnRouteBanner, per-trip cards, etc.) is a
  // separate, much larger real surface that ParentView.tsx's own caller
  // (HubScreen.tsx) mounts alongside AlertBanner, not inside it; that
  // fuller dashboard is out of scope here. `tripViews` below reproduces
  // HubScreen.tsx's own real shaping of raw `activeTrips: Trip[]` (its
  // lines ~255-278) — AlertBanner needs `driverName`, which isn't a field
  // on the raw Trip row at all (only `driverMemberId`), so the same
  // members-lookup mapping has to happen here too, not just a re-typing.
  const rawActiveTrips = useTripStore(s => s.activeTrips);
  const dispatchTrip = useTripStore(s => s.dispatch);
  const tripViews = useMemo(() => rawActiveTrips.map(t => {
    const driver = members.find(m => m.id === t.driverMemberId);
    const pickup = t.pickupMemberId ? members.find(m => m.id === t.pickupMemberId) : undefined;
    return {
      tripId: t.id,
      kidName: pickup?.name.split(' ')[0] ?? 'Family', kidEmoji: pickup?.emoji,
      driverName: driver?.name.split(' ')[0] ?? 'Someone', driverEmoji: driver?.emoji,
      driverMemberId: t.driverMemberId,
      etaMinutes: t.etaMinutes,
      startedAtMs: new Date(t.startedAt).getTime(),
    };
  }), [rawActiveTrips, members]);
  // Same driver-scoped "primary vs other" split HubScreen.tsx uses to feed
  // ParentView's activeTrip/otherActiveTrips props — AlertBanner only ever
  // reads these two for their driverName (activeTripDriverNames below), so
  // the split's own semantics (mine-first, else most-recent-other) don't
  // actually matter for correctness here, but reproducing it verbatim
  // keeps this one derivation trivially diffable against the real file
  // rather than inventing a differently-shaped equivalent.
  const myTripView = tripViews.find(v => v.driverMemberId === active.id);
  const primaryTripView = myTripView ?? tripViews[0] ?? null;
  const otherTripViews = tripViews.filter(v => v.tripId !== primaryTripView?.tripId);
  const onDispatchDirect = (memberId: string | undefined, etaMinutes: number, eventId?: string) => {
    if (!familyId) return;
    dispatchTrip({ familyId, driverMemberId: active.id, pickupMemberId: memberId, etaMinutes, eventId });
  };

  // ── Conflict detection + never-dispatched escalation (AlertBanner) ───
  // Kiosk had ZERO equivalent of this before — real ParentView.tsx's own
  // scheduling-conflict banner (kid double-booked / helper-driver
  // double-booked / clashes with a parent's Work event) and its
  // "confirmed driver, time already passed, trip never started" escalation
  // card. Reproduced verbatim from ParentView.tsx's own lines ~229-324
  // against dayEvents (already the real today-only, non-Work-filtered-out
  // event list this file uses everywhere else — same real shape as that
  // file's own `allTodayEvents`/`todayEvents` split below).
  const workEventsToday = useMemo(() => dayEvents.filter(e => isWorkEvent(e)), [dayEvents]);
  const nonWorkEventsToday = useMemo(() => dayEvents.filter(e => !isWorkEvent(e)), [dayEvents]);
  const { conflictEvents, conflictReasons, neverDispatchedOverdue } = useMemo(() => {
    const reasons = new Map<string, string>();
    const upcoming = nonWorkEventsToday.filter(e => hoursUntilEvent(e.date, e.time) >= 0);

    // A: kid double-booked (same memberId, same date, <30 min, non-Work)
    const timedMemberEvents = upcoming.filter(e => !!e.time && !!e.memberId);
    for (let i = 0; i < timedMemberEvents.length; i++) {
      for (let j = i + 1; j < timedMemberEvents.length; j++) {
        const a = timedMemberEvents[i], b = timedMemberEvents[j];
        if (a.memberId !== b.memberId) continue;
        if (minutesBetween(a.time!, b.time!) < 30) {
          const kidName = members.find(m => m.id === a.memberId)?.name.split(' ')[0] ?? 'Kid';
          const label = `${kidName} double-booked`;
          if (!reasons.has(a.id)) reasons.set(a.id, label);
          if (!reasons.has(b.id)) reasons.set(b.id, label);
        }
      }
    }
    // B: helper/driver double-booked
    for (const [id, label] of detectAssigneeConflicts(upcoming)) {
      if (!reasons.has(id)) reasons.set(id, label);
    }
    // C + D: family event vs. a Work event
    const upcomingWork = workEventsToday.filter(e => hoursUntilEvent(e.date, e.time) >= 0);
    for (const [id, label] of detectWorkConflicts(upcoming, upcomingWork, members)) {
      if (!reasons.has(id)) reasons.set(id, label);
    }

    const conflictIds = new Set(reasons.keys());
    const conflicts = nonWorkEventsToday.filter(e => (e.conflict || conflictIds.has(e.id)) && !e.conflictAcknowledged);

    const activeTripDriverNames = new Set(
      [primaryTripView, ...otherTripViews].filter((t): t is NonNullable<typeof t> => !!t).map(t => t.driverName)
    );
    const neverDispatched = nonWorkEventsToday.filter(e => {
      const a = eventAssignee(e);
      if (!a.name || a.status !== 'confirmed' || e.approvalPending) return false;
      if (e.pickupConfirmedAt) return false;
      if (e.tripAlertDismissedAt) return false;
      if (activeTripDriverNames.has(a.name)) return false;
      const h = hoursUntilEvent(e.date, e.time);
      return h < 0 && h > -1;
    });

    return { conflictEvents: conflicts, conflictReasons: reasons, neverDispatchedOverdue: neverDispatched };
  }, [nonWorkEventsToday, workEventsToday, members, primaryTripView, otherTripViews]);
  const showAlertBanner = conflictEvents.length > 0 || neverDispatchedOverdue.length > 0;

  // "Happening now" — the mockup's compact top strip (a live dot, an
  // uppercase eyebrow, the current/next event, a right-aligned time), NOT
  // a greeting hero. Real derivation: an event actually in progress right
  // now (time <= now < endTime) wins; otherwise the next timed event later
  // today; otherwise null (renders "Nothing on the calendar today" instead
  // of a fabricated placeholder).
  const nowHappening = useMemo(() => {
    const nowHHMM = new Date().toTimeString().slice(0, 5);
    const timed = dayEvents.filter(e => !!e.time && !e.allDay);
    const inProgress = timed.find(e => e.time! <= nowHHMM && (!e.endTime || e.endTime > nowHHMM));
    if (inProgress) return { event: inProgress, isNow: true };
    const upcoming = timed.filter(e => e.time! > nowHHMM).sort((a, b) => a.time!.localeCompare(b.time!))[0];
    return upcoming ? { event: upcoming, isNow: false } : null;
  }, [dayEvents]);
  const remindEventAssignee = useEventStore(s => s.remindEventAssignee);
  const claimHelperSlot = useEventStore(s => s.claimHelperSlot);
  const confirmEventAssignment = useEventStore(s => s.confirmEventAssignment);
  const declineEventAssignment = useEventStore(s => s.declineEventAssignment);
  const reassignEvent = useEventStore(s => s.reassignEvent);
  // updateEvent/updateEventScoped — real ParentView.tsx wires the exact same
  // pair (destructured off useEventStore()) straight into
  // HouseholdBacklogSection for its HelperEventCard mounts (myHelperEvents/
  // coParentHelperEvents). Read here via the same per-selector style every
  // other eventStore action on this screen already uses.
  const updateEvent = useEventStore(s => s.updateEvent);
  const updateEventScoped = useEventStore(s => s.updateEventScoped);
  // addEvent — only needed for ActionNeededSection's RideRequestCard/
  // RideRequiredEventCard mounts below (real ParentView.tsx destructures
  // the same addEvent off useEventStore() and threads it into the same two
  // cards, for their own "assign + create a follow-up event" actions).
  const addEvent = useEventStore(s => s.addEvent);
  const { quests, approveQuest, declineQuest, updateQuest } = useQuestStore();
  const groceryItems = useGroceryStore(s => s.items);
  const buyGroceryItem = useGroceryStore(s => s.buyItem);
  // addGroceryItem — only needed for approveItemsAndSync below (real
  // ParentView.tsx's own wrapper around approveItems that also syncs each
  // approved grocery/supplies item into the live grocery list).
  const addGroceryItem = useGroceryStore(s => s.addItem);
  // Real phone behavior (features/grocery/GroceryScreen.tsx filters
  // !isBought the same way in every one of its own list views) — a bought
  // item leaves the active list entirely rather than staying visible
  // struck through.
  const unboughtGroceryItems = useMemo(() => groceryItems.filter(it => !it.isBought), [groceryItems]);
  const groceryRuns = useGroceryStore(s => s.runs);
  // Read-only mirror of the real phone's "Shopping now at {store}" banner
  // (features/grocery/GroceryScreen.tsx: activeRuns = runs.filter(status
  // === 'active'), shows activeRuns[0]) — live-requested: kiosk can't
  // start a run, so no tap-to-open/start action is offered here, only the
  // same status glance.
  const activeGroceryRun = useMemo(() => groceryRuns.find(r => r.status === 'active'), [groceryRuns]);
  const activeGroceryShopper = useMemo(
    () => activeGroceryRun ? members.find(m => m.id === activeGroceryRun.shopperId)?.name?.trim().split(' ')[0] : undefined,
    [activeGroceryRun, members],
  );
  const { meals, week: mealWeek } = useKioskMeals();
  const redemptions = useRewardStore(s => s.redemptions);
  const approveRedemption = useRewardStore(s => s.approveRedemption);
  const rejectRedemption = useRewardStore(s => s.rejectRedemption);
  const kidRequests = useKidRequestStore(s => s.requests);
  const approveRequest = useKidRequestStore(s => s.approveRequest);
  const declineRequest = useKidRequestStore(s => s.declineRequest);
  const approveItems = useKidRequestStore(s => s.approveItems);
  const rejectItems = useKidRequestStore(s => s.rejectItems);
  const toggleGPWelcome = useKidRequestStore(s => s.toggleGPWelcome);
  const sendKidRequest = useKidRequestStore(s => s.sendRequest);

  // ── Emergency SOS (senior-only real feature) ──────────────────────────
  // Real SeniorView.tsx triggerSos, reproduced with one deliberate
  // substitution: the real flow attempts live device GPS via expo-location
  // and reverse-geocodes it into a street-level location label. Kiosk is a
  // fixed countertop/wall device — per explicit direction, no GPS attempt
  // at all here, just a static "Sent from the kitchen kiosk" label, since
  // a live GPS read off the kiosk's own hardware would report the KIOSK's
  // fixed position, not necessarily the senior's own if they're elsewhere
  // in the house or away — a genuinely misleading location for a safety
  // feature to report as if it were live tracking. Everything past that
  // substitution (sendRequest → notifyKidRequest → family-notifier fan-out
  // to parents+grandparents, type:'emergency' auto-escalating urgency) is
  // the exact same real dispatch path every other kid request already
  // uses on kiosk.
  const [sosActive, setSosActive] = useState(false);
  const [sosSending, setSosSending] = useState(false);
  const triggerSos = async () => {
    setSosSending(true);
    try {
      await sendKidRequest({
        type: 'emergency', fromMemberId: active.id,
        detail: `${active.name.split(' ')[0]} triggered Emergency SOS — sent from the kitchen kiosk`,
        location: 'Sent from the kitchen kiosk',
      });
      setSosActive(true);
    } catch (e: any) {
      console.warn('[KioskOverviewTab] SOS dispatch failed', e?.message ?? e);
      Alert.alert("Couldn't send SOS", 'Please try again, or call a family member directly.');
    } finally {
      setSosSending(false);
    }
  };

  // ── Today's meals (real family_meals rows) ───────────────────────────
  // Was a single "Tonight's dinner" summary that, once fixed to be
  // tappable at all, opened a day-overview popup. The owner then asked
  // for breakfast/lunch/dinner as their own three cards right on the
  // hero, each opening its own recipe directly — see the hero render
  // below and KioskRecipeDrawer.
  const todayMeals = useMemo(() => meals.filter(m => m.day === todayMealDay()), [meals]);
  const [openMeal, setOpenMeal] = useState<Meal | null>(null);
  const [viewingRun, setViewingRun] = useState<GroceryRun | null>(null);
  // Live-requested: "if we click on that card it should show a details
  // sheet right similar to the mobile app" — mobile's own HelperEventCard
  // has no tap-to-detail of its own (everything happens inline on the
  // card), so this reuses the real detail/edit surface kiosk already has
  // for any calendar event (KioskEventEditor, read-only when the viewer
  // can't edit) rather than inventing a second, narrower detail view.
  const [viewingEvent, setViewingEvent] = useState<FamilyEvent | null>(null);

  // ── Rides needing attention ──────────────────────────────────────────
  // The mockup's "Co-Parent Pending Rides" card, rebuilt onto the SAME
  // real mechanism the phone's own Household Backlog/"You Were Asked to
  // Drive" surfaces use — same data source, same buckets, same actions —
  // rather than this widget's own narrower hand-rolled version.
  //
  // Live-reported: "why can't we use that pickup radar" for the "other
  // parent/teen not seeing action needed" gap. Root cause this widget had
  // on its own: (1) sourced from dayEvents (today only, capped at 2) —
  // mobile's real feed (usePendingUnconfirmedEvents) deliberately has NO
  // date ceiling, since a self/co-parent assignment months out still needs
  // to surface (that hook's own doc comment describes a live-reported
  // 67-day-out appointment this exact gap once hid); (2) no mine-vs-
  // someone-else's split, so every viewer saw the identical generic
  // Remind/Take-over pair regardless of whether THEY were the one being
  // asked — a parent who was just assigned a ride never got a Confirm
  // button, only "Take over" (a reassign, the wrong operation for
  // accepting your OWN pending assignment); (3) RideRow's onClaim always
  // wrote the 'driver' field regardless of category — wrong for Medical/
  // Sports/Ride, whose real accompanying-adult pair is helper/helperId
  // (driverName/driverId is Study's own separate field, confirmed while
  // rebuilding KioskEventEditor's category fields); (4) zero surface for
  // a teen viewer — canAct was hardcoded to isParent.
  //
  // classifyEventUrgency (features/hub/lib) is the SAME per-event
  // classifier ParentView.tsx uses — role-agnostic (just {id, name}), so
  // calling it with `active` here correctly resolves myPending to "MY own
  // pending assignments" whether the kiosk's active member is a parent or
  // a teen, no separate teen-specific derivation needed. dedupeRideSeries
  // is the same real fix for a recurring ride series otherwise stacking
  // every future occurrence as its own pending row (only the soonest per
  // seriesId survives), applied separately to each bucket for the same
  // reason ParentView.tsx does — the two lists are partitioned by WHO's
  // assigned, not by occurrence, so each needs its own soonest-occurrence
  // representative.
  //
  // Real bug this closes: kiosk fed classifyEventUrgency ONLY
  // usePendingUnconfirmedEvents' own narrow result — that hook's SQL
  // requires a non-null helper/driver status, so a genuinely UNASSIGNED
  // event (no helper/driver at all) could never appear in its result, and
  // classifyEventUrgency's `unassigned` bucket was therefore permanently
  // empty on kiosk. It also silently dropped every OTHER event in the real
  // 14-day dispatch window that doesn't already carry a pending helper.
  // Real ParentView.tsx's own classifierSource (its lines ~177-182) merges
  // useUpcomingOpenEvents' live 14-day window with
  // usePendingUnconfirmedEvents (deduped by id, so a far-future pending
  // assignment outside the 14-day window still reaches the classifier) —
  // reproduced verbatim here, feeding the SAME single classifyEventUrgency
  // call the Pickup radar widget and Household Backlog mount both already
  // read from below, not a second parallel derivation.
  const familyId = active.familyId ?? '';
  const { events: pendingUnconfirmed } = usePendingUnconfirmedEvents(familyId);
  const { events: backlogWindowEvents } = useUpcomingOpenEvents(familyId);
  const classifierSource = useMemo(() => {
    const base = backlogWindowEvents.length > 0 ? backlogWindowEvents : allEvents;
    const seen = new Set(base.map(e => e.id));
    const extra = pendingUnconfirmed.filter(e => !seen.has(e.id));
    return extra.length > 0 ? [...base, ...extra] : base;
  }, [backlogWindowEvents, allEvents, pendingUnconfirmed]);
  const { unassigned, myPending: myRidesRaw, coParentPending: coParentRidesRaw } = useMemo(
    () => classifyEventUrgency(classifierSource, { id: active.id, name: active.name }, localDateStr()),
    [classifierSource, active.id, active.name],
  );
  const [myRides] = dedupeRideSeries(myRidesRaw);
  const [coParentRides] = dedupeRideSeries(coParentRidesRaw);

  // ── Senior's own "Your Rides" (SeniorView.tsx) ────────────────────────
  // Real derivation reproduced verbatim (SeniorView.tsx lines ~419-483,
  // ~652-663, ~776-787) against the same upcomingEvents source
  // (useUpcomingOpenEvents) already fetched above as backlogWindowEvents —
  // confirmed the exact same real hook call, not a re-derivation.
  //
  // myDrivingToday is deliberately NOT built here — kiosk is a shared
  // household surface, and starting a live trip dispatch ("I'm En Route")
  // from it is out of scope by explicit direction (no one should be able
  // to start a ride from the kiosk). The real YourRidesSection component
  // below is mounted with myDrivingToday={[]} for that reason (suppresses
  // its own built-in dispatch button entirely, rather than passing a
  // fake/no-op handler into a real action button), and a separate,
  // genuinely read-only "Currently Driving" card is built kiosk-native
  // further below to still surface the same information.
  const isSeniorPastEvent = (e: { date?: string; time?: string }): boolean => {
    if (!e.date) return false;
    const today = localDateStr();
    if (e.date < today) return true;
    if (e.date > today) return false;
    return e.time ? hoursUntilEvent(e.date, e.time) < 0 : false;
  };
  const seniorMyPendingAssignments = useMemo(() => backlogWindowEvents.filter(e => {
    const a = eventAssignee(e);
    const isMine = a.id ? a.id === active.id : a.name === active.name;
    return isMine && a.status === 'pending' && !e.approvalPending && !isWorkEvent(e) && !isSeniorPastEvent(e);
  }), [backlogWindowEvents, active.id, active.name]);
  const seniorMyDrivingTodayInfo = useMemo(() => backlogWindowEvents.filter(e => {
    const a = eventAssignee(e);
    const isMine = a.id ? a.id === active.id : a.name === active.name;
    return isMine && a.status === 'confirmed' && !isWorkEvent(e) && !isSeniorPastEvent(e);
  }), [backlogWindowEvents, active.id, active.name]);
  const seniorMyClaimedRides = useMemo(() => backlogWindowEvents.filter(e => {
    if (!e.isOpenToGrandparents) return false;
    const a = eventAssignee(e);
    const isMine = a.id ? a.id === active.id : a.name === active.name;
    return isMine && a.status === 'confirmed' && !isSeniorPastEvent(e);
  }), [backlogWindowEvents, active.id, active.name]);
  const seniorUrgentPending = useMemo(() => seniorMyPendingAssignments.filter(e =>
    hoursUntilEvent(e.date, e.time) < 1 && hoursUntilEvent(e.date, e.time) >= 0
  ), [seniorMyPendingAssignments]);
  // Same two-layer dedupe SeniorView.tsx itself applies: series-collapse
  // first (each list gets its OWN dedupeRideSeries call — a shared
  // seenSeries set would let one section's occurrence wrongly suppress a
  // different section's legitimate occurrence of the same series), THEN an
  // id-based cross-section dedupe in the same call order the real
  // myPendingAssignments → myDrivingToday → myClaimedRides mount uses, so
  // an event id already shown in an earlier section is suppressed from a
  // later one exactly as the real Hub does.
  const [seniorDedupSeriesPending] = dedupeRideSeries(seniorMyPendingAssignments);
  const [seniorDedupSeriesDriving] = dedupeRideSeries(seniorMyDrivingTodayInfo);
  const [seniorDedupSeriesClaimed] = dedupeRideSeries(seniorMyClaimedRides);
  const { seniorRidesPending, seniorRidesDrivingInfo, seniorRidesClaimed } = useMemo(() => {
    const seen = new Set<string>();
    const dedupe = (list: FamilyEvent[]) => {
      const out = list.filter(e => !seen.has(e.id));
      out.forEach(e => seen.add(e.id));
      return out;
    };
    return {
      seniorRidesPending: dedupe(seniorDedupSeriesPending),
      seniorRidesDrivingInfo: dedupe(seniorDedupSeriesDriving),
      seniorRidesClaimed: dedupe(seniorDedupSeriesClaimed),
    };
  }, [seniorDedupSeriesPending, seniorDedupSeriesDriving, seniorDedupSeriesClaimed]);
  const [seniorDeclineId, setSeniorDeclineId] = useState<string | null>(null);
  const [seniorDeclineText, setSeniorDeclineText] = useState('');

  // ── Household Backlog (parent-only) ──────────────────────────────────
  // Real ParentView.tsx's own derivation (its lines ~475-589), reproduced
  // here exactly rather than re-invented — same real useChoreStore
  // selectors, same filter chain, same "System A vs System B" ownership
  // rules described in that file's own comments (read in full before this
  // was written). HouseholdBacklogSection itself is the same real,
  // exported, self-contained component ParentView.tsx mounts — imported
  // and mounted directly below rather than reimplemented, matching this
  // session's established reuse pattern (GpOfferReviewCard, HelperEventCard,
  // AiEngineBanner, SmartTaskComposer, AddQuestModal all did the same).
  //
  // myHelperEvents/coParentHelperEvents deliberately reuse the SAME
  // myPending/coParentPending buckets the Pickup radar widget above already
  // computed via classifyEventUrgency/usePendingUnconfirmedEvents — not a
  // second independent derivation — exactly like ParentView.tsx, which
  // computes classifyEventUrgency ONCE and feeds both its own Pickup-radar-
  // equivalent section and HouseholdBacklogSection from the same
  // myPending/coParentPending. dedupeRideSeries is applied a SECOND time
  // here (myPending/coParentPending are the pre-dedupe raw lists) — the
  // same reasoning ParentView.tsx's own comment gives: myRides/coParentRides
  // above already deduped myRidesRaw/coParentRidesRaw for the radar widget,
  // but Backlog needs its own dedupe of the underlying myPending/
  // coParentPending pair, since a shared dedupeRideSeries call's seenSeries
  // set is not reusable across two structurally-identical-looking but
  // independently-partitioned lists.
  const {
    parentAssignments, addParentQuest, addChore,
    getParentQuestPool, getActiveAssignmentChoreIds,
    getMyDirectPending, getMyLockedItems, getMyOutgoingPending,
    completeParentQuest, respondToParentQuest, cancelLockedAssignment, recallParentQuest, appreciationPing,
  } = useChoreStore();
  const chores = useChoreStore(s => s.chores);

  // ── Senior-only real Hub sections (caregiver review, meds, send-bonus) ─
  // Kiosk had NO equivalent of any of these before this — SeniorView.tsx's
  // own real sections, reproduced with the same real store/hook wiring
  // that file itself uses (verbatim call-site match, not re-derived).
  const {
    loaded: approverGrantsLoaded, loadFromStorage: loadApproverGrants,
    isActiveApprover, getActiveGrantFor,
  } = useTemporaryApproverStore();
  useEffect(() => { if (!approverGrantsLoaded) loadApproverGrants(); }, [approverGrantsLoaded]);
  const hasCaregiverAccess = isActiveApprover(active.id);
  const caregiverGrant = getActiveGrantFor(active.id);

  // Same shared hook ParentView.tsx/SeniorView.tsx/HealthTab.tsx all use —
  // single source of truth against family_medications, not a second local
  // implementation (see useMedications.ts's own header comment on why a
  // prior hand-rolled duplicate was a real, live-reported bug).
  const { meds, addMed, toggleMed, deleteMed } = useMedications(familyId, active.id);
  const medsTaken = useMemo(
    () => Object.fromEntries(meds.map(m => [m.id, m.taken_date === localDateStr()])) as Record<string, boolean>,
    [meds],
  );

  // SendBonusCard's own real local-state shape (SeniorView.tsx lines
  // ~207-209) — plain picker state, no store beyond awardCoins itself.
  const [gpKid, setGpKid] = useState<FamilyMember | null>(null);
  const [gpAmount, setGpAmount] = useState<15 | 25 | 50>(15);
  const [gpNote, setGpNote] = useState('');
  const [gpSent, setGpSent] = useState(false);
  const awardCoins = useFamilyStore(s => s.awardCoins);
  const sendGpBonus = () => {
    if (!gpKid) return;
    awardCoins(gpKid.id, gpAmount, 'gpCoins');
    setGpSent(true);
    setTimeout(() => { setGpSent(false); setGpKid(null); setGpNote(''); }, 2500);
  };

  const chorePool = useMemo(() => getParentQuestPool(), [getParentQuestPool, quests]);
  const activeAssignmentChoreIds = useMemo(() => getActiveAssignmentChoreIds(), [getActiveAssignmentChoreIds, parentAssignments]);
  const adultMemberIds = useMemo(
    () => new Set(members.filter(m => m.role === 'parent' || m.role === 'senior').map(m => m.id)),
    [members],
  );
  const doneStatuses = useMemo(() => new Set(['done', 'approved', 'archived', 'cancelled', 'completed']), []);
  const adultQuests = useMemo(() => quests.filter(q => {
    if (doneStatuses.has(q.status)) return false;
    if (q.isAdultTask) return true;
    if (q.assignedToId != null && adultMemberIds.has(q.assignedToId)) return true;
    return false;
  }), [quests, doneStatuses, adultMemberIds]);
  const adultQuestsNoLiveAssignment = useMemo(
    () => adultQuests.filter(q => !activeAssignmentChoreIds.has(q.id)),
    [adultQuests, activeAssignmentChoreIds],
  );
  const myAdultQuests = useMemo(
    () => adultQuestsNoLiveAssignment.filter(q => q.assignedToId === active.id),
    [adultQuestsNoLiveAssignment, active.id],
  );
  const othersAdultQuests = useMemo(
    () => adultQuestsNoLiveAssignment.filter(q => q.assignedToId && q.assignedToId !== active.id),
    [adultQuestsNoLiveAssignment, active.id],
  );
  const unassignedAdultQ = useMemo(
    () => adultQuestsNoLiveAssignment.filter(q => !q.assignedToId && (q as any).isPool !== false),
    [adultQuestsNoLiveAssignment],
  );
  const choreIdsSet = useMemo(() => new Set(chorePool.map(c => c.id)), [chorePool]);
  const questPool = useMemo(() => [
    ...chorePool.filter(c => !activeAssignmentChoreIds.has(c.id)),
    ...unassignedAdultQ.filter(q => !choreIdsSet.has(q.id) && !activeAssignmentChoreIds.has(q.id)).map(q => ({
      id: q.id, title: q.title, description: q.description, dueDate: q.dueDate,
      categoryType: 'parent_only_quest' as const, category: q.category,
      basePoints: q.coins, coinsReward: q.coins, xpReward: 0, status: 'todo' as const,
      assignedToId: undefined, isPrivateParent: true, requiresPhotoProof: false,
      redoCount: 0, recurrenceRule: { frequency: 'once' as const },
      createdAt: (q as any).createdAt ?? new Date().toISOString(), _isQuestRow: true,
      shoppingItems: (q as any).shoppingItems, shoppingStore: (q as any).shoppingStore, shoppingBudget: (q as any).shoppingBudget,
    })),
  ], [chorePool, activeAssignmentChoreIds, unassignedAdultQ, choreIdsSet]);
  const systemBIds = useMemo(
    () => new Set([...myAdultQuests, ...othersAdultQuests].map(q => q.id)),
    [myAdultQuests, othersAdultQuests],
  );
  const myDirectPending = useMemo(() => getMyDirectPending(active.id), [getMyDirectPending, active.id, parentAssignments]);
  const myLockedItems = useMemo(() => getMyLockedItems(active.id), [getMyLockedItems, active.id, parentAssignments]);
  const myOutgoingPending = useMemo(() => getMyOutgoingPending(active.id), [getMyOutgoingPending, active.id, parentAssignments]);
  const [myHelperEvents] = dedupeRideSeries(myRidesRaw);
  const [coParentHelperEvents] = dedupeRideSeries(coParentRidesRaw);

  // Delegate/Pushback sheets — same open/close-state-plus-onClose pattern
  // this file already uses for KioskEventEditor/KioskRunDetailSheet (see
  // viewingEvent/viewingRun above), not a new convention.
  const [delegateTarget, setDelegateTarget] = useState<{ choreId: string; choreTitle: string } | null>(null);
  const [pushbackTarget, setPushbackTarget] = useState<{
    assignmentId: string; choreTitle: string; assignedBy?: string; assignedTo?: string;
  } | null>(null);
  // handlePullTask — real ParentView.tsx's own version is a one-line wrapper
  // around the real addParentQuest store action (`(chore) =>
  // addParentQuest(chore.id, active.id, active.id, 'PULL')`), not a
  // separate store action of its own — reproduced verbatim rather than
  // imported, since it isn't exported from anywhere.
  const handlePullTask = (chore: import('@/store/choreStore').ChoreTask) => {
    addParentQuest(chore.id, active.id, active.id, 'PULL');
  };

  // ── Kids' coin jars (real balances) ──────────────────────────────────
  const kids = useMemo(
    () => members.filter(m =>
      !m.deletedAt && m.inviteStatus !== 'pending' && (m.role === 'kid' || m.role === 'teen')),
    [members],
  );

  // "N/M chores this week" per kid — matches the mockup's own jar-meta line
  // exactly, derived from real quest data (assigned + approved this week)
  // rather than invented copy. Monday-start week boundary, same weekOf()
  // convention useKioskMeals already uses, so both this and the meals
  // widget agree on what "this week" means.
  const weekChoreCounts = useMemo(() => {
    const [wy, wm, wd] = mealWeek.split('-').map(Number);
    const weekStart = new Date(wy, wm - 1, wd);
    const counts = new Map<string, { done: number; total: number }>();
    for (const q of quests) {
      if (!q.assignedToId) continue;
      const at = q.approvedAt ?? q.submittedAt ?? q.claimedAt;
      // "This week" = assigned or already acted on since Monday — a quest
      // with no timestamp at all (freshly created, still 'todo') still
      // counts toward the denominator via its dueDate/startedAt falling in
      // range isn't tracked separately here, so anything currently
      // assigned to this kid with no completion yet also counts as open
      // this week rather than being silently excluded.
      const relevant = q.status !== 'cancelled' && q.status !== 'archived'
        && (!at || new Date(at) >= weekStart);
      if (!relevant) continue;
      const c = counts.get(q.assignedToId) ?? { done: 0, total: 0 };
      c.total += 1;
      if (q.status === 'approved' || q.status === 'done') c.done += 1;
      counts.set(q.assignedToId, c);
    }
    return counts;
  }, [quests, mealWeek]);

  // ── Unified approvals queue (parent-only) ────────────────────────────
  // Chore reviews + store redemptions ONLY — two genuinely separate
  // systems, each with their own screen and their own "pending" badge,
  // merged into one ranked list a parent can clear from the Overview.
  // Built here rather than reusing the now-unreachable KioskHubTab (its
  // pendingReview/pendingRedemptions memos were the right reference for
  // the underlying queries, but that tab never merged them, and it's dead
  // code besides).
  //
  // Kid requests used to ALSO fold into this merged list as a third,
  // generic approve/decline item — real-phone-corrected: ActionNeededSection
  // below is the phone's own real, richer, type-specific surface for kid
  // requests (InlineReplyCard/RideLateAlertCard/ServiceRequestCard/
  // GroceryRequestCard/QuestProposalCard/CheckinRow, each rendering the
  // request's actual type instead of one generic row) — the real Hub never
  // double-shows a kid request in two places at once, so this widget's own
  // merge no longer includes them; ActionNeededSection is now the sole
  // surface for pending kid requests on kiosk, matching that real
  // separation of concerns. See the pendingKidRequestsForAction derivation
  // near the ActionNeededSection mount below for the (genuinely different,
  // richer) real filter that replaces this widget's old simple one.
  const pendingChoreReviews = useMemo(
    () => quests.filter(q => q.status === 'pending_approval'),
    [quests],
  );
  const pendingRedemptions = useMemo(
    () => isParent ? redemptions.filter(r => r.status === 'pending') : [],
    [redemptions, isParent],
  );
  const approvals = useMemo(() => {
    if (!isParent) return [] as ApprovalItem[];
    const memberFirst = (id?: string) => members.find(m => m.id === id)?.name?.trim().split(' ')[0];
    const memberEmoji = (id?: string) => members.find(m => m.id === id)?.emoji ?? '🙂';
    const items: ApprovalItem[] = [
      ...pendingChoreReviews.map((q): ApprovalItem => ({
        id: `quest:${q.id}`, kind: 'chore', sortAt: q.submittedAt ?? '',
        title: q.title, who: memberFirst(q.assignedToId) ?? memberFirst(q.sponsorUserId), emoji: memberEmoji(q.assignedToId ?? q.sponsorUserId),
        meta: 'Ready for review', coins: q.coins || undefined,
        urgencyRank: 1,
      })),
      ...pendingRedemptions.map((r): ApprovalItem => ({
        id: `redemption:${r.id}`, kind: 'redemption', sortAt: r.redeemedAt,
        title: r.rewardTitle ?? 'Reward redemption', who: r.memberName ?? memberFirst(r.memberId), emoji: memberEmoji(r.memberId),
        meta: r.wallet === 'gpCoins' ? 'Grandparent jar' : 'Reward redemption',
        coins: -r.deductedCoins,
        urgencyRank: 1,
      })),
    ];
    // Most urgent first; within the same urgency, oldest first — the one
    // that's been waiting longest surfaces before a just-arrived duplicate
    // at the same rank, so nothing quietly ages at the bottom of its tier.
    return items.sort((a, b) => b.urgencyRank - a.urgencyRank || a.sortAt.localeCompare(b.sortAt));
  }, [isParent, pendingChoreReviews, pendingRedemptions, members]);

  // ── Chore counts for the hero line ───────────────────────────────────
  const openChores = useMemo(
    () => quests.filter(q => q.status === 'todo' || q.status === 'claimed' || q.status === 'in_progress').length,
    [quests],
  );

  const unclaimedRides = useMemo(
    () => dayEvents.filter(e => {
      const a = eventAssignee(e);
      return !a.name && /pick ?up|drop ?off|ride/i.test(e.title);
    }).length,
    [dayEvents],
  );

  // ── Action Needed (parent-only) ───────────────────────────────────────
  // Real ParentView.tsx's own "unassigned ride / kid-request-needing-a-
  // reply" surface, kiosk had ZERO equivalent of before this. Reads the
  // SAME `unassigned` bucket the Part 1 classifier fix above now correctly
  // populates (previously always empty on kiosk — see that block's own
  // comment). Split into two card-type buckets exactly as ParentView.tsx
  // does (its lines ~190-219) — purely which CARD to render, not a second
  // classification pass.
  const pendingRequests = useMemo(
    () => unassigned.filter(e => e.category === 'Ride' && !e.rideRequired),
    [unassigned],
  );
  const pendingRideRequiredEvents = useMemo(
    () => unassigned.filter(e =>
      e.rideRequired
      || (e.category !== 'Ride' && !!e.location && !isHomeLocation(e.location))
      || !!e.helperId || !!e.driverId
    ),
    [unassigned],
  );
  // Real ParentView.tsx's own pendingKidRequests filter (its lines
  // ~340-375), reproduced here rather than reusing kiosk's OWN older,
  // simpler pendingKidRequests filter (status==='pending' && toMemberId
  // scoping only) that used to feed ParentApprovalsWidget above — that
  // simpler filter is now retired from ParentApprovalsWidget entirely (see
  // its own comment), and this real, richer filter takes over as the sole
  // "what counts as a pending kid request" source of truth on kiosk,
  // feeding ActionNeededSection below.
  //
  // One real clause intentionally NOT reproduced: ParentView.tsx also
  // suppresses a ride-late request while a dispatch trip for that same kid
  // is actively in progress (its own activeTrip/otherActiveTrips state).
  // Kiosk's Overview has no dispatch-trip concept at all (onDispatchDirect
  // and the trip state it tracks are ParentView-only, not mounted on
  // kiosk anywhere) — there's nothing here to check that clause against,
  // so it's left out rather than faked. Effect is narrow and fails safe:
  // a ride-late alert that the phone would hide during an active dispatch
  // could still show on kiosk in that one window; it never hides something
  // the phone would show.
  const pendingKidRequestsForAction = useMemo(() => {
    if (!isParent) return [] as typeof kidRequests;
    return kidRequests.filter(r => {
      if (!['pending', 'partial'].includes(r.status)) return false;
      if (r.status === 'partial' && (r.items?.length ?? 0) > 0 && !r.items!.some((it: any) => it.status === 'pending')) return false;
      if (r.type === 'checkin') {
        const ageHours = (Date.now() - new Date(r.requestedAt).getTime()) / 3_600_000;
        if (ageHours > 2) return false;
      }
      if (r.type === 'delegation' && (r.items?.length ?? 0) === 0 && !r.detail.startsWith('💵')) return false;
      return true;
    });
  }, [isParent, kidRequests]);
  // Same real formula ParentView.tsx uses (its own actionCount, line
  // ~389) — deduped-for-count ride buckets (the SAME dedupeRideSeries pass
  // ActionNeededSection itself runs internally on these two lists, so this
  // badge and the actual rendered card count can't structurally diverge)
  // plus the kid-requests count. pending_approval chore reviews are
  // deliberately excluded — ParentApprovalsWidget's own badge covers those.
  const [dedupedPendingForCount, dedupedRideRequiredForCount] = dedupeRideSeries(pendingRequests, pendingRideRequiredEvents);
  const actionCount = dedupedPendingForCount.length + dedupedRideRequiredForCount.length + pendingKidRequestsForAction.length;

  // Three real ParentView.tsx-only handlers (never store actions
  // themselves — local closures that file defines around real store
  // actions, its own lines ~409-473), reproduced verbatim here for the
  // same reason handlePullTask already was above: not exported from
  // anywhere, so importing isn't possible, only re-deriving from the real
  // store actions kiosk already has in scope.
  const approveQuestProposalHandler = (req: any, finalCoins: number, schedule?: { dueDate: string; dueTime: string; alertCall: boolean; alertCallLeadMinutes: number }) => {
    addChore({
      title: req.detail,
      categoryType: 'routine',
      category: 'Other',
      basePoints: 0,
      coinsReward: finalCoins,
      xpReward: 10,
      status: 'todo',
      isPool: true,
      requiresPhotoProof: false,
      recurrenceRule: { frequency: 'once' },
      familyId: (active as any).familyId,
      createdById: active.id,
      dueDate: schedule?.dueDate ?? localDateStr(),
      ...(schedule ? { dueTime: schedule.dueTime, alertCall: schedule.alertCall, alertCallLeadMinutes: schedule.alertCallLeadMinutes } : {}),
    });
    approveRequest(req.id, active.id, `Approved as a ${finalCoins}-coin chore!`);
    try {
      useChatStore.getState().sendMessage(req.fromMemberId, active.id,
        `✅ Your chore idea "${req.detail}" was approved for ${finalCoins} coins — go ahead!`);
    } catch (e) {
      console.warn('[KioskOverviewTab] approveQuestProposal notification failed', e);
    }
  };
  const declineQuestProposalHandler = (req: any, reason?: string) => {
    declineRequest(req.id, active.id, reason);
    try {
      useChatStore.getState().sendMessage(req.fromMemberId, active.id,
        `Your chore idea "${req.detail}" wasn't approved this time${reason ? ` — "${reason}"` : ''}.`);
    } catch (e) {
      console.warn('[KioskOverviewTab] declineQuestProposal notification failed', e);
    }
  };
  const approveItemsAndSync = async (reqId: string, itemIds: string[], isSuppliesReq: boolean) => {
    const req = kidRequests.find(r => r.id === reqId);
    if (!req) return;
    approveItems(reqId, itemIds, active.id);
    if (req.items) {
      const approvedItems = req.items.filter(it => itemIds.includes(it.id));
      for (const item of approvedItems) {
        await addGroceryItem({
          familyId,
          name: item.name,
          quantity: item.qty || undefined,
          category: isSuppliesReq ? 'Supplies' : (item.category ?? 'Other'),
          storePreference: item.store,
          addedBy: req.fromMemberId,
        });
      }
    }
  };

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }, []);

  return (
    <>
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
      {!isParent && (
      <>
      <View style={s.heroRow}>
        <WidgetCard k={k} isDark={isDark} style={s.hero}>
          <View style={s.heroTop}>
            <Chip label="Kitchen display" accent={k.primary} isDark={isDark} k={k} />
            <View style={s.liveRow}>
              <View style={[s.liveDot, { backgroundColor: k.sage }]} />
              <Text style={[s.liveText, { color: k.sage }]} numberOfLines={1}>Live</Text>
            </View>
          </View>

          {/* Avatar + greeting — was a plain text line with nothing to
              anchor the eye (live-reported: the Hub should have "real
              presence," not just a text row). The active member's own
              emoji in a role-tinted disc gives the greeting a face, the
              same "who is this for" signal the coin-jar and radar rows
              already give everyone else on this screen. */}
          <View style={s.heroGreetRow}>
            <View style={[s.heroAvatar, { backgroundColor: kioskRoleAccent(k, active.role) + (isDark ? '26' : '18') }]}>
              <Text style={s.heroAvatarEmoji}>{active.emoji ?? '👤'}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.heroTitle, { color: k.text }]} numberOfLines={2}>
                {greeting}, {active.name?.trim().split(' ')[0]}
              </Text>
              <Text style={[s.heroSub, { color: k.textMuted }]} numberOfLines={2}>
                {summarize(dayEvents.length, openChores, unclaimedRides)}
              </Text>
            </View>
          </View>

          {/* Quick actions. Schedule/Grocery/Meals were dropped for
              everyone — each already has its own persistent rail tab, so a
              second entry point here was redundant, not just extra taps.
              Intercom has no rail equivalent, so it stays.

              For kid, four of their own tiles join Intercom here — Check
              In, Piggy Bank, Cheer Squad, My Requests — the "glance at my
              own state, tap once" actions, promoted to hero prominence.
              The eight-way Ask-a-Parent MENU stays in its own labeled
              "Your stuff" card below instead: it's a browse-then-pick list,
              a different shape from these five, and mixing all thirteen
              into one row would defeat the point of a separate section.
              The row is nowrap (see s.quickRow) so all five fit one single
              strip rather than wrapping to a second line. */}
          <View style={s.quickRow}>
            <QuickAction
              Icon={Megaphone} label="Intercom" accent={k.primary} k={k} isDark={isDark}
              onPress={onIntercom}
              hint="Broadcast an announcement to every family phone"
            />
            {isKid && (
              <>
                <KioskKidCheckInTile active={active} />
                <KioskKidMineTile kind="piggy" active={active} members={members} />
                <KioskKidMineTile kind="cheer" active={active} members={members} />
                <KioskKidMineTile kind="requests" active={active} members={members} />
              </>
            )}
          </View>
        </WidgetCard>

        {/* Today's Meals — was a single "Tonight's dinner" card (the
            mockup's photo-frame slot); the owner asked for the day's three
            meal types as their own scrollable cards, each opening its real
            recipe directly, rather than one dinner summary that opened a
            day-overview popup. The photo frame itself lives in the widget
            deck below (KioskMemorySlideshow), unaffected by this. */}
        <WidgetCard k={k} isDark={isDark} style={s.heroSide}>
          <WidgetHeader
            Icon={ChefHat} eyebrow="Today" title="Today's Meals"
            accent={k.gold} k={k} isDark={isDark}
          />
          {todayMeals.length === 0 ? (
            <Pressable
              onPress={() => onNavigate('meals')}
              style={({ pressed }) => [
                s.mealEmpty,
                { backgroundColor: pressed ? k.cardHover : k.well, borderColor: k.cardBorder },
              ]}
              accessibilityRole="button"
              accessibilityLabel="No meals planned for today"
              accessibilityHint="Open the meal planner"
            >
              <UtensilsCrossed size={26} color={k.textFaint} />
              <EmptyNote text="No meals planned for today — tap to plan the week." k={k} style={{ textAlign: 'center' }} />
            </Pressable>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.mealTypeRow}
              style={{ flex: 1 }}
            >
              {(['breakfast', 'lunch', 'dinner'] as const).map(type => {
                const meal = todayMeals.find(m => (m.type ?? '').toLowerCase() === type);
                const accent = type === 'breakfast' ? k.gold : type === 'lunch' ? k.sage : k.purple;
                return (
                  <Pressable
                    key={type}
                    onPress={() => meal ? setOpenMeal(meal) : onNavigate('meals')}
                    style={({ pressed }) => [
                      s.mealTypeCard,
                      { backgroundColor: pressed ? k.cardHover : k.well, borderColor: k.cardBorder },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={meal ? `${type}: ${meal.title}` : `No ${type} planned`}
                    accessibilityHint={meal ? 'See the recipe' : 'Open the meal planner'}
                  >
                    <Text style={[s.mealTypeLabel, { color: accent }]} numberOfLines={1}>
                      {type[0].toUpperCase()}{type.slice(1)}
                    </Text>
                    {meal ? (
                      <>
                        <Text style={s.mealTypeEmoji}>{meal.emoji ?? '🍽️'}</Text>
                        <Text style={[s.mealTypeTitle, { color: k.text }]} numberOfLines={2}>{meal.title}</Text>
                      </>
                    ) : (
                      <Text style={[s.mealTypeEmpty, { color: k.textFaint }]} numberOfLines={2}>Not planned</Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </WidgetCard>
      </View>
      </>
      )}

      {/* KioskRecipeDrawer/KioskRunDetailSheet/KioskEventEditor — hoisted
          out of the `!isParent` fragment above (a real pre-existing bug
          found while wiring PushbackSheet/DelegateSheet below, fixed here
          since it directly blocks this same "tap a ride row to see detail"
          path for a parent): all three were mounted ONLY inside
          `{!isParent && (...)}`, so for a parent viewer that whole fragment
          never rendered and none of the three ever mounted — yet the
          Pickup radar widget's own RideRow (isParent-only, deep in the
          parent branch below) calls `onOpenDetail={setViewingEvent}`. A
          parent tapping a ride row set viewingEvent with nothing mounted
          to render it. Hoisted here (still above both the kid/other-role
          hero and the parent's own two-column page) so all three sheets
          are always mounted regardless of role, matching how their own
          trigger state (openMeal/viewingRun/viewingEvent) is genuinely
          role-agnostic top-level useState. */}
      <KioskRecipeDrawer
        visible={!!openMeal}
        onClose={() => setOpenMeal(null)}
        meal={openMeal}
        members={members}
        k={k}
      />

      <KioskRunDetailSheet
        visible={!!viewingRun}
        run={viewingRun}
        active={active}
        members={members}
        onClose={() => setViewingRun(null)}
      />

      <KioskEventEditor
        event={viewingEvent}
        active={active}
        members={members}
        onClose={() => setViewingEvent(null)}
        colors={colors}
        isDark={phoneDark}
      />

      {/* PushbackSheet/DelegateSheet — the real, exported, standalone sheet
          components HouseholdBacklogSection's own onRespond/onDelegate
          callbacks open (see the HouseholdBacklogSection mount below), same
          real props ParentView.tsx passes. Mounted unconditionally
          alongside the three sheets just above for the identical reason:
          delegateTarget/pushbackTarget are only ever set from the isParent
          branch below, but the sheet itself needs to be mounted regardless
          of which JSX branch set the trigger state — the same fix just
          applied to KioskEventEditor et al. */}
      <PushbackSheet
        target={pushbackTarget}
        colors={colors} isDark={phoneDark}
        onClose={() => setPushbackTarget(null)}
        respondToParentQuest={respondToParentQuest}
      />

      <DelegateSheet
        target={delegateTarget}
        questPool={questPool}
        members={members} active={active} colors={colors} isDark={phoneDark}
        onClose={() => setDelegateTarget(null)}
        updateQuest={updateQuest}
        addParentQuest={addParentQuest}
      />

      {/* ══ YOUR STUFF (kid only) ══════════════════════════════════════
          The kid's own actions, as one labeled full-width card directly
          under the hero — prominent, but visually distinct from the hero's
          household Intercom action, and above the widget deck so it is not
          buried among the read-only widgets. Kid-only, matching the phone's
          own gate: KidCheckinRow and AskParentSheet are mounted from
          KidView alone, and the kiosk Tasks tab's creation gate is likewise
          `active.role === 'kid'` (not teen). */}
      {isKid && <KioskKidQuickActions active={active} members={members} />}

      {/* ══ PARENT: two-column page (matches the reference mockup's own
          layout exactly — a wide center column of "things to act on"
          stacked full-width, next to a narrower sidebar of "glanceable
          household state" stacked full-width) — NOT the flex-wrap grid of
          equal-width cards every other role still uses below. Kid/senior/
          teen are unaffected: their compositions were never part of what
          the mockup depicted for this screen, and stay on the original
          deck. */}
      {isParent ? (
        <View style={[s.twoColRow, isNarrowParentLayout && s.twoColRowStacked]}>
          <View style={[s.centerCol, isNarrowParentLayout && s.colFullWidth]}>
            {/* ══ HAPPENING NOW ═══════════════════════════════════════════
                Matches the mockup's own .now-strip exactly: a compact
                single-line panel (live dot, uppercase eyebrow, current/
                next event, a right-aligned time) — NOT a greeting hero.
                Lives INSIDE centerCol as its first child (a real bug fix:
                an earlier version rendered this as a sibling of the whole
                twoColRow instead, spanning the combined center+sidebar
                width — visibly wider than Family Schedule right below it,
                which only spans centerCol's own share). */}
            <WidgetCard k={k} isDark={isDark} style={s.nowStrip}>
              {/* Live-requested (kept, final call): green (k.sage) for the
                  dot AND the label, matching this app's own established
                  "live" color everywhere else it appears (KioskHeader's
                  own live dot, the kid/senior hero's Live chip) — a
                  deliberate real-app choice over the mock's own role-
                  accent (navy for Parent). Halo stays a static soft ring
                  (box-shadow: 0 0 0 4px accent at 18% opacity in the mock)
                  — NOT animated; the mock's one @keyframes pulse belongs
                  to an unrelated kid-request "waiting" status dot
                  elsewhere. A plain View can't express a symmetric CSS
                  box-shadow ring, so the halo is a second, larger, tinted
                  circle layered behind the solid dot. */}
              <View style={s.nowStripDotWrap}>
                <View style={[s.nowStripDotHalo, { backgroundColor: k.sage + (isDark ? '30' : '2E') }]} />
                <View style={[s.nowStripDot, { backgroundColor: k.sage }]} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {/* Mock's own now-label is a literal, always-on "Happening
                    now" — not derived from any state. Matched exactly per
                    live confirmation, rather than the richer isNow/upcoming
                    distinction this file computed on its own. */}
                <Text style={[s.nowStripLabel, { color: k.sage }]}>HAPPENING NOW</Text>
                <Text style={[s.nowStripWhat, { color: k.text }]} numberOfLines={1}>
                  {nowHappening ? nowHappening.event.title : 'Nothing on the calendar today'}
                </Text>
              </View>
              {nowHappening && (
                <Text style={[s.nowStripTime, { color: k.textFaint }]} numberOfLines={1}>
                  {nowHappening.isNow && nowHappening.event.endTime
                    ? `until ${fmtTime(nowHappening.event.endTime)}`
                    : fmtTime(nowHappening.event.time!)}
                </Text>
              )}
            </WidgetCard>

            <FamilySchedulePanel dayEvents={dayEvents} k={k} isDark={isDark} />

            <WidgetCard k={k} isDark={isDark}>
              <WidgetHeader
                Icon={Car} eyebrow="Pickup radar" title="Rides needing attention"
                accent={k.sage} k={k} isDark={isDark}
                // Live-reported mismatch against the neighboring Happening
                // Now strip's own content line ("Nothing on the calendar
                // today", 14px/600) — matched to that weight rather than
                // this screen's shared bold widget-title look, a
                // deliberate one-off for this widget only.
                titleStyle={s.nowStripWhat}
                right={(myRides.length + coParentRides.length) > 0
                  ? <Chip label={`${myRides.length + coParentRides.length}`} accent={k.gold} isDark={isDark} k={k} />
                  : undefined}
              />
              {myRides.length === 0 && coParentRides.length === 0 ? (
                <EmptyNote text="Every ride has a confirmed driver." k={k} />
              ) : (
                <View>
                  {/* Same real "You're the driver/helper" vs "Co-parent's
                      pending rides" split HouseholdBacklogSection.tsx uses
                      — mine surfaces a real Confirm/Can't (RideRow's isMe
                      branch), the co-parent's stays read-only-plus-Remind/
                      Take-over, since it isn't the viewer's own commitment
                      to accept or decline. Flush KioskListRow rows (own
                      hairline dividers, no per-row Well spacing) matching
                      ApprovalRow's own list shape, not boxed cards. */}
                  {myRides.length > 0 && (
                    <View style={{ marginBottom: coParentRides.length > 0 ? KIOSK_SPACE.md : 0 }}>
                      <Text style={[s.rideSectionLabel, { color: k.sage, marginBottom: KIOSK_SPACE.xs }]}>YOU'RE THE DRIVER / HELPER</Text>
                      {myRides.map((ev, i) => (
                        <RideRow
                          key={ev.id} ev={ev} k={k} isFirst={i === 0} members={members}
                          canAct={isParent} actorId={active.id} actorName={active.name}
                          onRemind={remindEventAssignee} onClaim={claimHelperSlot}
                          onConfirm={confirmEventAssignment} onDecline={declineEventAssignment}
                          onOpenDetail={setViewingEvent}
                        />
                      ))}
                    </View>
                  )}
                  {coParentRides.length > 0 && (
                    <View>
                      <Text style={[s.rideSectionLabel, { color: k.textFaint, marginBottom: KIOSK_SPACE.xs }]}>CO-PARENT'S PENDING RIDES</Text>
                      {coParentRides.map((ev, i) => (
                        <RideRow
                          key={ev.id} ev={ev} k={k} isFirst={i === 0} members={members}
                          canAct={isParent} actorId={active.id} actorName={active.name}
                          onRemind={remindEventAssignee} onClaim={claimHelperSlot}
                          onConfirm={confirmEventAssignment} onDecline={declineEventAssignment}
                          onOpenDetail={setViewingEvent}
                        />
                      ))}
                    </View>
                  )}
                </View>
              )}
            </WidgetCard>

            <ParentApprovalsWidget
              approvals={approvals} k={k} isDark={isDark}
              onApproveChore={(id) => approveQuest(id, active.id)}
              onDeclineChore={(id, reason, presetKey) => declineQuest(id, active.id, reason, presetKey)}
              onApproveRedemption={(id) => approveRedemption(id, active.id)}
              onRejectRedemption={(id) => rejectRedemption(id, active.id)}
              onApproveRequest={(id) => approveRequest(id, active.id)}
              onDeclineRequest={(id) => declineRequest(id, active.id)}
            />

            {/* Live-reported: "in approval there is missing cards to the
                parner when other parner approved chore for revoke /
                dispute" — ChoreReviewSection.tsx's real Scenario 4.7 flow
                had no kiosk equivalent at all. Parent-only, same as
                ParentApprovalsWidget above it; renders nothing when there's
                no recently-approved chore to show (matches the phone). */}
            <KioskDisputeApprovalWidget active={active} members={members} k={k} isDark={isDark} />

            {/* Alert Banner — real ParentView.tsx's own scheduling-conflict
                + "confirmed driver, trip never started" escalation banner,
                kiosk had ZERO equivalent of before this. Same real,
                exported, self-contained AlertBanner component the phone
                mounts (features/hub/hubComponents.tsx) — reused directly,
                fed the conflictEvents/conflictReasons/neverDispatchedOverdue
                derived above (verbatim port of ParentView.tsx's own logic)
                plus onDispatch wired to the same minimal real tripStore
                primitive (dispatch()) HubScreen.tsx itself uses, not the
                full live-trip-dashboard UI — AlertBanner's own real
                dependency on trip state is only ever these two plain
                fields (driverName, for suppressing a redundant "never
                dispatched" card once a trip is actually running).

                Rendered only when showAlertBanner is true, matching the
                real phone's own `{showBanner && <AlertBanner ... />}`
                guard exactly — renders nothing (not even an empty
                container) the rest of the time. */}
            {showAlertBanner && (
              <AlertBanner
                conflictEvents={conflictEvents}
                neverDispatchedEvents={neverDispatchedOverdue}
                conflictReasons={conflictReasons}
                members={members} colors={colors} isDark={phoneDark} updateEvent={updateEvent}
                activeName={active.name} activeMemberId={active.id}
                onDispatch={onDispatchDirect}
              />
            )}

            {/* Action Needed — real ParentView.tsx's own "unassigned ride /
                kid-request-needing-a-reply" surface, kiosk had ZERO
                equivalent of before this (its own ParentApprovalsWidget
                above only ever covered chore-review + redemption + a
                generic plain-approve/decline kid-request row — not these
                richer, type-specific cards). ActionNeededSection is the
                same real, exported, self-contained component the phone
                mounts — imported directly rather than reimplemented, same
                reuse pattern as every other section on this screen.

                awaitingApproval is a literal [] here, matching the REAL
                phone exactly (ParentView.tsx itself passes awaitingApproval
                ={[]} to its own mount — confirmed by reading that call site
                — so QuestApprovalCard is dead code there too; chore-review
                approvals live solely in ParentApprovalsWidget's own
                pendingChoreReviews half). pendingKidRequestsForAction is
                the real, richer filter (see its own derivation comment
                above) that replaces ParentApprovalsWidget's old, simpler
                pendingKidRequests — that widget's own merge no longer
                includes kid requests at all (see its comment), so this
                section is now the sole surface for them, matching the real
                Hub's actual separation of concerns instead of kiosk's old
                invented three-way merge.

                Mounted directly before Household Backlog, matching
                ParentView.tsx's own real render order (TodayView →
                ActionNeededSection → GpCanHelpSection →
                HouseholdBacklogSection — confirmed by reading that file's
                JSX) — Action Needed ranks more urgent than Backlog on the
                real phone's own page, so it surfaces first here too.

                Same unpadded-WidgetCard treatment as the Backlog mount
                right below: ActionNeededSection's own root is the identical
                shape (a bare `paddingHorizontal: 16` View wrapping
                SectionCard's borderless icon+title header — confirmed by
                reading its actual render, not assumed from Backlog's own
                comment) — a padded WidgetCard would double that inset, an
                unwrapped mount would have no card chrome at all. */}
            <WidgetCard k={k} isDark={isDark} padded={false}>
              <View style={{ paddingVertical: KIOSK_SPACE.sm }}>
                <ActionNeededSection
                  actionCount={actionCount}
                  pendingRequests={pendingRequests}
                  pendingRideRequiredEvents={pendingRideRequiredEvents}
                  awaitingApproval={[]}
                  pendingKidRequests={pendingKidRequestsForAction}
                  events={allEvents}
                  active={active} members={members} allNames={members.map(m => m.name)}
                  colors={colors} isDark={phoneDark}
                  updateEvent={updateEvent} addEvent={addEvent} updateEventScoped={updateEventScoped}
                  approveQuest={approveQuest} declineQuest={declineQuest}
                  approveRequest={approveRequest} declineRequest={declineRequest}
                  toggleGPWelcome={toggleGPWelcome}
                  approveItemsAndSync={approveItemsAndSync} rejectItems={rejectItems}
                  approveQuestProposal={approveQuestProposalHandler} declineQuestProposal={declineQuestProposalHandler}
                />
              </View>
            </WidgetCard>

            {/* Household Backlog — real ParentView.tsx section kiosk was
                missing almost entirely (only its "Rides needing attention"
                sub-piece existed here, via the Pickup radar widget above).
                HouseholdBacklogSection is the same real, exported,
                self-contained component the phone mounts — imported
                directly rather than reimplemented, with every prop backed
                by a real useChoreStore/useEventStore selector or action
                (see the derivation block above active/pendingUnconfirmed).

                Wrapped in an unpadded WidgetCard: HouseholdBacklogSection's
                own root View already carries `paddingHorizontal: 16` (sized
                for the phone's own screen-edge gutter) plus SectionCard's
                bare icon+title header (no border/background of its own) —
                a padded WidgetCard would double that horizontal inset
                asymmetrically against WidgetCard's own uniform padding, and
                an unwrapped mount would have no border/card background at
                all, visually inconsistent with every sibling widget in this
                column. padded={false} + a manual vertical pad here is the
                same fix FamilyFeedStrip already uses below for the same
                reason (its own PanelHead/content manage horizontal padding
                internally, this WidgetCard only needs to add the vertical
                breathing room a padded card would otherwise provide). */}
            <WidgetCard k={k} isDark={isDark} padded={false}>
              <View style={{ paddingVertical: KIOSK_SPACE.sm }}>
                <HouseholdBacklogSection
                  active={active} members={members} colors={colors} isDark={phoneDark}
                  questPool={questPool} myAdultQuests={myAdultQuests} othersAdultQuests={othersAdultQuests}
                  myDirectPending={myDirectPending} myLockedItems={myLockedItems}
                  myOutgoingPending={myOutgoingPending}
                  myHelperEvents={myHelperEvents} coParentHelperEvents={coParentHelperEvents}
                  systemBIds={systemBIds} parentAssignments={parentAssignments}
                  updateQuest={updateQuest} updateEvent={updateEvent} updateEventScoped={updateEventScoped}
                  completeParentQuest={completeParentQuest} respondToParentQuest={respondToParentQuest}
                  cancelLockedAssignment={cancelLockedAssignment} recallParentQuest={recallParentQuest}
                  appreciationPing={appreciationPing} handlePullTask={handlePullTask}
                  onAddTask={() => onNavigate('tasks')}
                  onDelegate={(choreId, choreTitle) => setDelegateTarget({ choreId, choreTitle })}
                  onRespond={(assignmentId, choreTitle, assignedBy, assignedTo) =>
                    setPushbackTarget({ assignmentId, choreTitle, assignedBy, assignedTo })}
                />
              </View>
            </WidgetCard>

            {/* Find — mounted here (parent-only) so it genuinely shares
                centerCol's own width with Rides/Approvals above it by
                construction, the same fix that resolved Happening Now's
                width mismatch earlier. Kid/teen get their own separate
                mount of this same component in the flex-wrap deck below
                (s.widget-sized, matching its siblings there) — not a
                duplicated implementation, just two mount points for one
                component with a caller-supplied width. */}
            <RadarStrip
              members={members} k={k} isDark={isDark}
              onOpen={() => onNavigate('findfam')}
            />
          </View>

          <View style={[s.sideCol, isNarrowParentLayout && s.colFullWidth]}>
            {/* Mockup's .jar row exactly: a colored square with the kid's
                INITIAL (not an emoji), name + a real "N/M chores this week"
                progress line (not the coin-source split this used to show),
                a bare gold number on the right (no "coins" unit label). */}
            {kids.length > 0 && (
              <WidgetCard k={k} isDark={isDark}>
                <PanelHead title="Coin jars" k={k} />
                <View>
                  {kids.map((kid, i) => {
                    const main = (kid as any).mainCoins ?? 0;
                    const gp = (kid as any).gpCoins ?? 0;
                    const total = main + gp;
                    const accent = kioskRoleAccent(k, kid.role);
                    const progress = weekChoreCounts.get(kid.id);
                    const streak = (kid as any).streak ?? 0;
                    const firstName = kid.name?.trim().split(' ')[0] ?? '';
                    return (
                      <View key={kid.id} style={[s.jarRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}>
                        <View style={[s.jarAvatar, { backgroundColor: accent }]}>
                          <Text style={s.jarInitial}>{firstName.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[s.jarName, { color: k.text }]} numberOfLines={1}>{firstName}</Text>
                          <Text style={[s.jarMeta, { color: k.textFaint }]} numberOfLines={1}>
                            {progress ? `${progress.done}/${progress.total} chores this week` : 'No chores this week'}
                            {streak > 0 ? ` · ${streak} day streak` : ''}
                          </Text>
                        </View>
                        <Text style={[s.jarAmt, { color: k.gold }]} numberOfLines={1}>{total}</Text>
                      </View>
                    );
                  })}
                </View>
                {/* Live-requested: a quiet text link, not a full button —
                    the mockup's own Coin Jars panel has no footer action
                    at all, so this stays the smallest real affordance
                    rather than the heaviest one. */}
                <Pressable
                  onPress={() => onNavigate('store')}
                  style={({ pressed }) => [s.panelTextLink, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Open reward store"
                  accessibilityHint="See perks the kids can spend coins on"
                >
                  <Text style={[s.panelTextLinkText, { color: k.primary }]}>Open reward store</Text>
                  <ChevronRight size={14} color={k.primary} />
                </Pressable>
              </WidgetCard>
            )}

            {/* Mockup's "Meals This Week" reuses the SAME .jar row shape as
                Coin Jars (no avatar, no amount) — a real weekly plan from
                the same family_meals data the Meals tab itself uses, not a
                separate "today only" summary. */}
            <WidgetCard k={k} isDark={isDark}>
              <PanelHead title="Meals this week" k={k} />
              {meals.length === 0 ? (
                <EmptyNote text="No meals planned for this week." k={k} />
              ) : (
                // Live-requested: "focus from today to rest of the week
                // with scrollable view" — every remaining day (today
                // through the week's last day), not a fixed 3-day slice,
                // in a bounded-height scroller so a full week's rows don't
                // push the rest of the sidebar down.
                <ScrollView style={s.mealsWeekScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {daysFromToday().map((day, i) => {
                    const dayMeals = meals.filter(m => m.day === day);
                    const dinner = dayMeals.find(m => (m.type ?? '').toLowerCase() === 'dinner') ?? dayMeals[0];
                    const dayLabel = day === todayMealDay() ? 'Tonight' : day;
                    const chef = dinner?.chef_id ? members.find(mm => mm.id === dinner.chef_id)?.name?.trim().split(' ')[0] : undefined;
                    return (
                      <View key={day} style={[s.jarRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[s.jarName, { color: k.text }]} numberOfLines={1}>
                            {dayLabel}{dinner ? ` — ${dinner.title}` : ''}
                          </Text>
                          <Text style={[s.jarMeta, { color: k.textFaint }]} numberOfLines={1}>
                            {dinner
                              ? [chef ? `${chef} cooking` : null, dinner.prep_minutes ? `${dinner.prep_minutes} min` : null].filter(Boolean).join(' · ') || 'Planned'
                              : 'Not planned yet'}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </WidgetCard>

            {/* Live-corrected: matches the REAL phone's grocery behavior
                (features/grocery/GroceryScreen.tsx), not the mockup's own
                invented .grocery-row.got (checked, struck-through, stays
                visible). The real app filters bought items out of the
                active list entirely wherever it's shown — this shows the
                same `!isBought` set the phone's own "List" tab badge
                counts. Skips the phone's confirmation Alert on purpose
                (live-confirmed): a dialog on every check-off is real
                friction a fast kitchen-wall tap shouldn't have, and kiosk
                never had one before this — only the underlying "bought
                items leave the active list" data model is matched, not
                every UI step. */}
            <WidgetCard k={k} isDark={isDark}>
              <PanelHead title="Grocery list" k={k} />
              {activeGroceryRun && (
                <Pressable
                  onPress={() => setViewingRun(activeGroceryRun)}
                  style={({ pressed }) => [
                    s.groceryRunBanner,
                    { backgroundColor: k.sage + (isDark ? '26' : '1A'), borderColor: k.sage + '40' },
                    pressed && { opacity: 0.7 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Shopping now at ${activeGroceryRun.store}`}
                  accessibilityHint="Opens the live item list for this trip"
                >
                  <View style={[s.liveDot, { backgroundColor: k.sage }]} />
                  <Text style={[s.groceryRunBannerText, { color: k.sage }]} numberOfLines={1}>
                    Shopping now at {activeGroceryRun.store}{activeGroceryShopper ? ` · ${activeGroceryShopper}` : ''}
                  </Text>
                  <Text style={[s.groceryRunBannerLink, { color: k.sage }]}>View →</Text>
                </Pressable>
              )}
              {unboughtGroceryItems.length === 0 ? (
                <EmptyNote text="The grocery list is empty." k={k} />
              ) : (
                // Live-requested: "show 6 items and then rest are in scroll
                // view" — was a hard slice(0,5) with a static "and N more"
                // text and no way to reach the rest at all. Same bounded-
                // ScrollView pattern as Approvals/Meals This Week/Family
                // Schedule: every real item renders, capped to ~6 rows
                // visible before it scrolls.
                <ScrollView style={s.groceryScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {unboughtGroceryItems.map((it, i) => (
                    <Pressable
                      key={it.id}
                      onPress={() => buyGroceryItem(it.id, active.id)}
                      style={[s.groceryRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: false }}
                      accessibilityLabel={it.name}
                      accessibilityHint="Mark as bought and remove from the list"
                    >
                      <View style={[s.groceryCheck, { borderColor: k.cardBorder }]} />
                      <Text style={[s.groceryItemText, { color: k.text }]} numberOfLines={1}>
                        {it.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {/* Live-requested: a quiet text link, not a full button —
                  same treatment as Coin Jars' "Open reward store" link
                  right above it, reusing the identical style rather than a
                  second near-duplicate. */}
              <Pressable
                onPress={() => onNavigate('meals')}
                style={({ pressed }) => [s.panelTextLink, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel="Open list"
                accessibilityHint="Open the meals and grocery screen"
              >
                <Text style={[s.panelTextLinkText, { color: k.sage }]}>Open list</Text>
                <ChevronRight size={14} color={k.sage} />
              </Pressable>
            </WidgetCard>

            <FamilyFeedStrip k={k} isDark={isDark} onOpen={() => onNavigate('memories')} />
          </View>
        </View>
      ) : (
      /* ══ WIDGET DECK (kid / senior / teen) ═══════════════════════════ */
      <>
      <View style={s.deck}>
        {/* ── Ride & pickup radar (kid: their own day instead) ──
            A kid can neither remind nor take over a ride — both actions
            were already parent-gated — so for them this slot was a
            read-only household-logistics feed with nothing to do about it.
            Same slot, their own schedule. */}
        {isKid ? (
          <KidTodayWidget
            active={active} k={k} isDark={isDark} style={s.widget}
            onOpenSchedule={() => onNavigate('schedule')}
          />
        ) : isSenior ? (
          <SeniorTasksWidget
            active={active} quests={quests} k={k} isDark={isDark} style={s.widget}
            onOpenTasks={() => onNavigate('tasks')}
          />
        ) : isTeen ? (
          // Live-reported gap: a teen fell all the way through to this
          // slot's `: null` — zero surface anywhere for "you were assigned
          // a ride and need to confirm it," the exact real state
          // TeenCarDispatchSection.tsx's own "You Were Asked to Drive"
          // card exists for on the phone. Same real myRides list the
          // parent's Pickup radar widget computes above (classifyEventUrgency
          // is role-agnostic — it already resolves to THIS teen's own
          // pending assignments when `active` is a teen), same real
          // confirmEventAssignment/declineEventAssignment actions. No
          // Remind/Take-over here — the phone's teen card doesn't offer
          // those either, only Confirm/Can't.
          <TeenRideDispatchWidget
            myRides={myRides} k={k} isDark={isDark} members={members} style={s.widget}
            actorId={active.id}
            onConfirm={confirmEventAssignment} onDecline={declineEventAssignment}
            onOpenDetail={setViewingEvent}
          />
        ) : null}

        {/* ── Grocery snapshot (kid: their own chore board instead) ──
            The household grocery list is a shopping concern. In its slot a
            kid gets the thing a shared kitchen surface is actually best
            at: their chore status at a glance plus the pool bounties
            anyone can claim. */}
        {isKid ? (
          <KidChoresWidget
            active={active} members={members} k={k} isDark={isDark} style={s.widget}
            onOpenTasks={() => onNavigate('tasks')}
          />
        ) : null}

        {/* ── Family Feed ──
            Renamed from "Family photos" and changed from a single auto-
            advancing cross-fade to a vertically scrollable strip of recent
            photos, latest on top — live-reported request, applies to every
            role's Overview since this one compact widget was already
            shared by all of them (parent/kid/teen/senior). Every card is a
            real `family_memories` row via useKioskPhotos — there is no
            stock image anywhere in this path, and a household with no
            photos yet gets a clean empty state rather than a stranger's
            stock family on its kitchen wall. See KioskMemorySlideshow's
            compact branch (FeedList) for the layout itself.

            Taller for senior — with only one other widget in their deck
            (SeniorTasksWidget) instead of the parent/kid deck's three, the
            photo feed is deliberately the generous, warm centerpiece of
            their Overview rather than a small compact strip squeezed in
            among logistics widgets that aren't theirs. */}
        <KioskMemorySlideshow compact height={isSenior ? 340 : 200} style={isSenior ? s.widgetWide : s.widget} />

        {/* ── Find (kid/teen only — no equivalent rail tab for senior) ──
            Previously a full-width strip shared by every role, below the
            whole page. Split into two mount points instead: this one for
            kid/teen (own s.widget-sized card, same as its siblings in
            this flex-wrap deck), a separate one inside centerCol for
            parent (see that mount's own comment for why). Not duplicated
            logic — the same RadarStrip component, just two call sites
            with different widths. */}
        {!isSenior && (
          <RadarStrip
            members={members} k={k} isDark={isDark} style={s.widget}
            onOpen={() => onNavigate('findfam')}
          />
        )}
      </View>

      {/* ── Senior-only real Hub sections ─────────────────────────────────
          Real SeniorView.tsx sections kiosk had zero equivalent of before
          this — reused directly (same real, exported, self-contained
          components the phone mounts) rather than reimplemented. Full-width
          stack below the widget deck (not squeezed into its flex-wrap grid)
          since these are richer sections than that deck's small glance
          widgets — same unpadded-WidgetCard treatment the parent branch's
          HouseholdBacklogSection/ActionNeededSection/AlertBanner already
          use above, for the same reason (each of these components' own
          root already carries its own horizontal padding/header chrome). */}
      {isSenior && (
        <View style={{ gap: KIOSK_SPACE.md, marginTop: KIOSK_SPACE.md }}>
          {/* Emergency SOS — real, verified-current SeniorView.tsx feature
              (not the removed PawBond SOS/social surface — that was a
              wholly different lost-pet-alert screen). Same real dispatch
              path (sendRequest, type:'emergency', auto-escalating urgency,
              fanned out to parents+grandparents via family-notifier) —
              only the location step differs, see triggerSos's own comment
              above for why. "Call Family" opens kiosk's own Chat tab
              (onNavigate('chat')) rather than the phone's router.push,
              since kiosk has no expo-router tab stack of its own. */}
          <View style={{ marginBottom: 2 }}>
            {sosActive ? (
              <View style={{ borderRadius: KIOSK_RADIUS.lg, backgroundColor: '#450A0A', borderWidth: 2, borderColor: colors.danger, padding: 18, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <AlertOctagon size={16} color={colors.danger} />
                  <Text style={{ fontSize: KIOSK_TYPO.body, fontWeight: '900', color: '#FCA5A5', flex: 1 }}>SOS Alert Sent to Family</Text>
                  <Pressable onPress={() => setSosActive(false)} style={{ backgroundColor: colors.danger + '30', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ fontSize: KIOSK_TYPO.label, fontWeight: '800', color: colors.danger }}>Cancel</Text>
                  </Pressable>
                </View>
                <Text style={{ fontSize: KIOSK_TYPO.caption, color: '#F87171', lineHeight: 19 }}>
                  Parents have been notified. Help is on the way.{'\n'}Stay where you are.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable onPress={() => onNavigate('chat')} style={{ flex: 1, borderRadius: KIOSK_RADIUS.md, backgroundColor: colors.danger, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, minHeight: KIOSK_HIT.control }}>
                    <Text style={{ fontSize: KIOSK_TYPO.caption, fontWeight: '800', color: '#fff' }}>Call Family</Text>
                  </Pressable>
                  <Pressable onPress={() => setSosActive(false)} style={{ flex: 1, borderRadius: KIOSK_RADIUS.md, backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger + '40', paddingVertical: 14, alignItems: 'center', minHeight: KIOSK_HIT.control, justifyContent: 'center' }}>
                    <Text style={{ fontSize: KIOSK_TYPO.caption, fontWeight: '800', color: '#F87171' }}>I'm OK Now</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                disabled={sosSending}
                onPress={() => Alert.alert(
                  'Send Emergency SOS?',
                  'This will immediately alert all family members.',
                  [{ text: 'Cancel', style: 'cancel' }, { text: 'Send SOS', style: 'destructive', onPress: triggerSos }],
                )}
                style={{ borderRadius: KIOSK_RADIUS.lg, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: isDark ? '#1A0000' : '#FFF1F1', borderWidth: 2, borderColor: colors.danger + '50', opacity: sosSending ? 0.7 : 1, minHeight: KIOSK_HIT.primary }}
                accessibilityRole="button"
                accessibilityLabel="Emergency SOS"
                accessibilityHint="Alerts all family members immediately"
              >
                <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
                  {sosSending ? <ActivityIndicator color="#fff" /> : <AlertOctagon size={24} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: KIOSK_TYPO.subheading, fontWeight: '900', color: colors.danger }}>Emergency SOS</Text>
                  <Text style={{ fontSize: KIOSK_TYPO.label, color: colors.textSecondary, marginTop: 2 }}>Alert every family member instantly</Text>
                </View>
                <View style={{ backgroundColor: colors.danger + '20', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Text style={{ fontSize: KIOSK_TYPO.label, fontWeight: '800', color: colors.danger }}>{sosSending ? 'Sending…' : 'Hold'}</Text>
                </View>
              </Pressable>
            )}
          </View>

          {/* Caregiver-mode chore review — real SeniorView.tsx gates this
              behind an active temporary-approver grant (a parent can hand a
              grandparent approve/decline authority for a window of time,
              e.g. while traveling). ParentReviewDeck is the exact same
              review UI a parent's own Hub uses — its actions already route
              through choreStore.canApprove, which recognizes this grant,
              so reusing it directly (rather than a second hand-rolled
              approve/decline surface) is correct, not just convenient. */}
          {hasCaregiverAccess && (
            <View>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
                backgroundColor: isDark ? colors.accent + '18' : colors.accent + '10',
                borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.accent + '30',
              }}>
                <Text style={{ fontSize: 16 }}>🔑</Text>
                <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.accent }}>
                  You're the temporary approver{caregiverGrant ? ` until ${new Date(caregiverGrant.expiresAt).toLocaleString(undefined, { hour12: true })}` : ''} — you can approve/decline chore submissions below.
                </Text>
              </View>
              <ParentReviewDeck parent={active} members={members} colors={colors} isDark={phoneDark} />
            </View>
          )}

          {/* Your Rides — real SeniorView.tsx section, kiosk had zero
              equivalent of before this. myDrivingToday is deliberately []
              here (see the derivation block's own comment above) — a
              shared kiosk surface shouldn't offer a live "start this trip"
              dispatch button, so that one built-in action is intentionally
              suppressed by starving it of data rather than reused as-is.
              The read-only "Currently Driving" card right after it covers
              the same information without an action. */}
          <YourRidesSection
            myPendingAssignments={seniorRidesPending}
            myDrivingToday={[]}
            myClaimedRides={seniorRidesClaimed}
            urgentPending={seniorUrgentPending}
            active={active} members={members} colors={colors} isDark={phoneDark}
            declineId={seniorDeclineId} declineText={seniorDeclineText}
            setDeclineId={setSeniorDeclineId} setDeclineText={setSeniorDeclineText}
            updateEvent={updateEvent}
            onEnRoute={() => {}}
            conflictReasons={conflictReasons}
          />

          {/* Currently Driving — kiosk-native, read-only substitute for the
              real YourRidesSection's myDrivingToday card, which on the
              phone includes a live "I'm En Route" dispatch button. Kiosk is
              a shared household surface, not a personal device — nobody
              should be able to start a trip dispatch from it, so this
              shows the same information (what this senior is confirmed to
              drive today, any scheduling conflict) with no action at all,
              rather than reusing the real card with a suppressed or fake
              handler wired to its built-in button. */}
          {seniorRidesDrivingInfo.length > 0 && (
            <View style={{ paddingHorizontal: 16 }}>
              <SectionCard
                large icon={<Car size={18} color={k.sage} />} title="Currently Driving"
                subtitle={`${seniorRidesDrivingInfo.length} confirmed today`}
                colors={colors} isDark={phoneDark}
              >
                <View style={{ gap: 10 }}>
                  {seniorRidesDrivingInfo.map(ev => {
                    const kid = members.find(m => m.id === ev.memberId);
                    const conflictReason = conflictReasons.get(ev.id);
                    return (
                      <CollapsibleCard key={ev.id} accent={k.sage} colors={colors} isDark={phoneDark} defaultExpanded={false}
                        summary={
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Car size={16} color={k.sage} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 15, fontWeight: '800', color: k.sage }} numberOfLines={1}>{ev.title}</Text>
                              <Text style={{ fontSize: 13, color: k.sage, opacity: 0.75 }}>
                                {kid?.name.split(' ')[0] ?? 'Kid'} · {fmtTime(ev.time)}
                              </Text>
                            </View>
                          </View>
                        }
                      >
                        {conflictReason && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                            <AlertTriangle size={12} color={colors.danger} />
                            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.danger }}>{conflictReason}</Text>
                          </View>
                        )}
                        {ev.location && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <MapPin size={12} color={colors.textSecondary} />
                            <Text style={{ fontSize: 13, color: colors.textSecondary }}>{ev.location}</Text>
                          </View>
                        )}
                      </CollapsibleCard>
                    );
                  })}
                </View>
              </SectionCard>
            </View>
          )}

          {/* Assigned To You — the real System-A surface (direct/outgoing/
              locked parent-quest assignments) SeniorView.tsx mounts for a
              senior exactly as a parent would see their own. Same three
              real cards + same derived lists (myDirectPending/
              myLockedItems/myOutgoingPending) the parent branch above
              already computes off active.id — those useMemos aren't
              parent-gated themselves, only their old render site was, so
              no new derivation is needed here, only the render. */}
          {(myDirectPending.length > 0 || myOutgoingPending.length > 0 || myLockedItems.length > 0) && (
            <WidgetCard k={k} isDark={isDark}>
              <WidgetHeader
                Icon={UserCheck} eyebrow="Household" title="Assigned To You"
                accent={k.gold} k={k} isDark={isDark}
                right={<Chip label={`${myDirectPending.length + myOutgoingPending.length + myLockedItems.length}`} accent={k.gold} isDark={isDark} k={k} />}
              />
              <View style={{ gap: KIOSK_SPACE.sm, marginTop: KIOSK_SPACE.sm }}>
                {myDirectPending.map(a => {
                  const chore = chores.find(c => c.id === a.choreId);
                  if (!chore) return null;
                  return (
                    <DirectPendingCard key={a.id} a={a} chore={chore} members={members} colors={colors} isDark={phoneDark}
                      respondToParentQuest={respondToParentQuest}
                      onRespond={(assignmentId, choreTitle, assignedBy, assignedTo) =>
                        setPushbackTarget({ assignmentId, choreTitle, assignedBy, assignedTo })} />
                  );
                })}
                {myOutgoingPending.map(a => {
                  const chore = chores.find(c => c.id === a.choreId);
                  if (!chore) return null;
                  return (
                    <OutgoingPendingCard key={a.id} a={a} chore={chore} members={members} active={active} colors={colors} isDark={phoneDark}
                      onRecall={a.status === 'PENDING' && a.assignedBy === active.id ? () => recallParentQuest(a.id, active.id) : undefined}
                      onRespond={(assignmentId, choreTitle, assignedBy, assignedTo) =>
                        setPushbackTarget({ assignmentId, choreTitle, assignedBy, assignedTo })} />
                  );
                })}
                {myLockedItems.map(a => {
                  const chore = chores.find(c => c.id === a.choreId);
                  if (!chore) return null;
                  return (
                    <LockedAssignmentCard key={a.id} a={a} chore={chore} active={active} members={members}
                      colors={colors} isDark={phoneDark}
                      onDelegate={(choreId, choreTitle) => setDelegateTarget({ choreId, choreTitle })}
                      cancelLockedAssignment={(assignmentId) => cancelLockedAssignment(assignmentId, active.id)} />
                  );
                })}
              </View>
            </WidgetCard>
          )}

          {/* Medications — real, shared component (also used by ParentView.
              tsx) against the real family_medications table. Kiosk had no
              medication surface anywhere before this. */}
          <WidgetCard k={k} isDark={isDark} padded={false}>
            <View style={{ paddingVertical: KIOSK_SPACE.sm }}>
              <MedicationsCard
                meds={meds} medsTaken={medsTaken} toggleMed={toggleMed}
                onAddMed={addMed} onRemoveMed={deleteMed}
                colors={colors} isDark={phoneDark} active={active} allMembers={members}
              />
            </View>
          </WidgetCard>

          {/* Send a Bonus — real, self-contained coin-gift picker, its own
              gpCoins wallet (a distinct jar from the main coin balance). */}
          <WidgetCard k={k} isDark={isDark} padded={false}>
            <View style={{ paddingVertical: KIOSK_SPACE.sm }}>
              <SendBonusCard
                kids={gpBonusKids} allNames={allNames} colors={colors} isDark={phoneDark}
                gpKid={gpKid} setGpKid={setGpKid}
                gpAmount={gpAmount} setGpAmount={setGpAmount}
                gpNote={gpNote} setGpNote={setGpNote}
                gpSent={gpSent} onSend={sendGpBonus}
                active={active}
              />
            </View>
          </WidgetCard>
        </View>
      )}
      </>
      )}
    </ScrollView>
    </>
  );
}

// ── Hero summary line ───────────────────────────────────────────────────
// Only mentions what's actually non-zero, so a calm day reads as calm
// rather than as three zeroes.
function summarize(events: number, chores: number, unclaimedRides: number): string {
  const parts: string[] = [];
  parts.push(events === 0 ? 'Nothing on the calendar today' : `${events} ${events === 1 ? 'event' : 'events'} today`);
  if (chores > 0) parts.push(`${chores} ${chores === 1 ? 'chore' : 'chores'} open`);
  if (unclaimedRides > 0) parts.push(`${unclaimedRides} ${unclaimedRides === 1 ? 'ride needs' : 'rides need'} a driver`);
  return parts.join(' · ');
}


// ── Quick action tile ───────────────────────────────────────────────────
function QuickAction({
  Icon, label, accent, k, isDark, onPress, badge, hint,
}: {
  Icon: typeof Car; label: string; accent: string; k: KioskColors; isDark: boolean;
  onPress: () => void; badge?: number; hint: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.quick,
        {
          backgroundColor: accent + (isDark ? '1F' : '14'),
          borderColor: accent + (isDark ? '45' : '38'),
        },
        pressed && { opacity: 0.72 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} items` : label}
      accessibilityHint={hint}
    >
      <Icon size={18} color={accent} />
      <Text style={[s.quickLabel, { color: accent }]} numberOfLines={1}>{label}</Text>
      {badge !== undefined && (
        <View style={[s.quickBadge, { backgroundColor: accent }]}>
          <Text style={[s.quickBadgeText, { color: kioskOnAccent(k, accent) }]} numberOfLines={1}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ── One ride row ────────────────────────────────────────────────────────
/**
 * Three real states, matching mobile's HelperEventCard.tsx exactly (read in
 * full before this rewrite) rather than this row's own prior generic
 * Remind/Take-over pair for every case:
 *
 *   1. Nobody assigned yet → "I'll drive" (claimHelperSlot — a race-safe
 *      compare-and-set; two parents tapping two devices at once must have
 *      the loser told, not silently overwrite the winner).
 *   2. The VIEWER is the named-but-unconfirmed assignee → Confirm / Can't.
 *      This is the branch that was missing entirely — "Take over" is a
 *      REASSIGN, the wrong operation for accepting your own assignment,
 *      so a viewer who was just assigned only ever saw a button that
 *      would reassign the ride away from themselves back to themselves,
 *      never a real accept. Confirm routes through confirmEventAssignment,
 *      Can't through declineEventAssignment — the same two shared store
 *      functions every mobile confirm/decline surface uses.
 *   3. Someone ELSE is named and unconfirmed → Remind / Take over
 *      (unchanged shape, but the role bug below is fixed).
 *
 * eventAssigneeRole(ev) — not a hardcoded 'driver' — decides which real
 * field pair (helper/helperId vs driverName/driverId) actually gets
 * written. The prior version always claimed as 'driver' regardless of
 * category, which is wrong for Medical/Sports/Ride (their real
 * accompanying-adult pair is helper/helperId — driverName/driverId is
 * Study's own separate "drive assignment" field, confirmed while
 * rebuilding KioskEventEditor's category fields).
 *
 * Every write here is gated on `canAct` (now: is this event's assignee
 * concept relevant to this VIEWER'S role, not simply "is a parent") —
 * anyone walking past the counter while a profile stays active could
 * otherwise reassign/confirm on someone else's behalf, same reasoning the
 * prior audit pass applied to reward approvals in KioskStoreTab.
 */
function RideRow({
  ev, k, isFirst, members, canAct, actorId, actorName, onRemind, onClaim, onConfirm, onDecline, onOpenDetail,
}: {
  ev: FamilyEvent;
  k: KioskColors;
  isFirst: boolean;
  members: FamilyMember[];
  canAct: boolean;
  actorId: string;
  actorName: string;
  onRemind: (eventId: string, assigneeId: string, assigneeName: string, fromMemberId: string) => Promise<boolean>;
  onClaim: (
    id: string, role: 'helper' | 'driver', claimantName: string,
    extra?: Partial<FamilyEvent>, onWon?: () => void, onError?: (m: string) => void,
  ) => void;
  onConfirm: (eventId: string, memberId: string, role: 'driver' | 'helper') => Promise<boolean>;
  onDecline: (eventId: string, memberId: string, role: 'driver' | 'helper') => Promise<boolean>;
  /** Opens the same real detail/edit drawer any calendar event gets
      (KioskEventEditor) — mobile's own HelperEventCard has no tap-to-
      detail of its own, so this is the closest real equivalent kiosk
      already has, not a new bespoke detail view. */
  onOpenDetail: (ev: FamilyEvent) => void;
}) {
  const a = eventAssignee(ev);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const forWhom = members.find(m => m.id === ev.memberId)?.name?.trim().split(' ')[0];
  const when = ev.time ? fmtTime(ev.time) : 'All day';
  const isMe = !!a.id && a.id === actorId;
  const role = eventAssigneeRole(ev);

  // Live-requested: "lets do similar card design similar to the
  // approvals" — same flat KioskListRow shape ApprovalRow already uses
  // (checkbox-style leading dot, inline title/meta/badge, 1-2 neutral text
  // buttons) instead of this row's own boxed Well-card shell, which is
  // exactly the "card-in-card" shape ParentApprovalsWidget's own header
  // comment already documents choosing NOT to use for its own rows.
  return (
    <View>
      <Pressable onPress={() => onOpenDetail(ev)} accessibilityRole="button" accessibilityHint={`Opens details for ${ev.title}`}>
      <KioskListRow
        k={k}
        isFirst={isFirst}
        title={ev.title}
        meta={`${when}${forWhom ? ` · for ${forWhom}` : ''}`}
        metaLines={2}
        badge={a.name ? (isMe ? 'Waiting on you' : `${a.name.split(' ')[0]} · unconfirmed`) : 'No driver'}
        actions={canAct ? (
          isMe ? (
            <>
              <KioskListRowAction
                k={k} label="Can't" color={k.danger} disabled={busy}
                accessibilityLabel="Say you can't do this — it goes back open"
                onPress={async () => {
                  setBusy(true);
                  const ok = await onDecline(ev.id, actorId, role);
                  setNote(ok ? "Marked — you're off this one." : 'Could not update — please try again.');
                  setBusy(false);
                }}
              />
              <KioskListRowAction
                k={k} label="Confirm" color={k.sage} disabled={busy}
                accessibilityLabel="Confirm you're doing this"
                onPress={async () => {
                  setBusy(true);
                  const ok = await onConfirm(ev.id, actorId, role);
                  setNote(ok ? 'Confirmed ✓' : 'Could not confirm — please try again.');
                  setBusy(false);
                }}
              />
            </>
          ) : (
            <>
              {/* Remind only exists when there IS someone to remind. */}
              {a.name && a.id && (
                <KioskListRowAction
                  k={k} label="Remind" color={k.gold} disabled={busy}
                  accessibilityLabel={`Send ${a.name.split(' ')[0]} a reminder about this ride`}
                  onPress={async () => {
                    setBusy(true);
                    const ok = await onRemind(ev.id, a.id!, a.name!, actorId);
                    setNote(ok ? `Reminder sent to ${a.name!.split(' ')[0]}.` : 'Could not send the reminder.');
                    setBusy(false);
                  }}
                />
              )}
              <KioskListRowAction
                k={k} label={a.name ? 'Take over' : "I'll drive"} color={k.sage} disabled={busy}
                accessibilityLabel="Assign this ride to yourself"
                onPress={() => {
                  setBusy(true);
                  onClaim(
                    ev.id, role, actorName, undefined,
                    () => { setNote('You have this ride.'); setBusy(false); },
                    (msg) => { setNote(msg || 'Someone else took this ride first.'); setBusy(false); },
                  );
                }}
              />
            </>
          )
        ) : undefined}
      />
      </Pressable>
      {!!note && (
        <Text style={[s.rideNote, { color: k.textMuted }]} numberOfLines={2} accessibilityLiveRegion="polite">
          {note}
        </Text>
      )}
    </View>
  );
}

/**
 * TeenRideDispatchWidget — kiosk-native equivalent of
 * TeenCarDispatchSection.tsx's own "You Were Asked to Drive" card: a
 * direct assignment must show regardless of anything else (that file's own
 * comment: "a parent naming this teen specifically means the teen needs to
 * respond either way"), since a teen otherwise had ZERO surface anywhere
 * on kiosk for a ride assigned to them — this slot fell all the way
 * through to `: null` for a teen viewer before this widget existed.
 *
 * Reuses RideRow directly (same real Confirm/Can't branch the parent's
 * Pickup radar widget already has for a viewer's own pending assignment) —
 * no Remind/Take-over passed in, matching the phone's own teen card, which
 * offers only Confirm/Can't, never those two parent-only actions.
 */
function TeenRideDispatchWidget({ myRides, k, isDark, members, actorId, onConfirm, onDecline, onOpenDetail, style }: {
  myRides: FamilyEvent[];
  k: KioskColors;
  isDark: boolean;
  members: FamilyMember[];
  actorId: string;
  onConfirm: (eventId: string, memberId: string, role: 'driver' | 'helper') => Promise<boolean>;
  onDecline: (eventId: string, memberId: string, role: 'driver' | 'helper') => Promise<boolean>;
  onOpenDetail: (ev: FamilyEvent) => void;
  style?: any;
}) {
  return (
    <WidgetCard k={k} isDark={isDark} style={style}>
      <WidgetHeader
        Icon={Car} eyebrow="You were asked" title="Rides to confirm"
        accent={k.primary} k={k} isDark={isDark}
        right={myRides.length > 0 ? <Chip label={`${myRides.length}`} accent={k.gold} isDark={isDark} k={k} /> : undefined}
      />
      {myRides.length === 0 ? (
        <EmptyNote text="Nothing waiting on you to confirm." k={k} />
      ) : (
        <View>
          {myRides.map((ev, i) => (
            <RideRow
              key={ev.id} ev={ev} k={k} isFirst={i === 0} members={members}
              canAct actorId={actorId} actorName=""
              onRemind={async () => false} onClaim={() => {}}
              onConfirm={onConfirm} onDecline={onDecline}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </View>
      )}
    </WidgetCard>
  );
}

// ── Unified approvals ─────────────────────────────────────────────────────
/**
 * The genuinely new piece of this screen: chore reviews, store redemptions,
 * and kid requests are three separate systems on the phone today (Tasks'
 * review lane, the Store screen's redemption queue, and the Requests inbox),
 * each with its own badge, nowhere merged. A parent standing at the kiosk
 * had no single place to see "everything waiting on me" ranked by what
 * actually needs attention first — an emergency request could be sitting
 * unseen behind three routine chore photos. This widget is that one place.
 *
 * Matches the reference mockup's own Approvals panel, not just its colors:
 * filter chips to narrow the merged list by kind, and flat list rows (a
 * checkbox-style status dot, inline title/meta/who-badge, a coin figure,
 * small text-button pairs) rather than the card-in-card Well rows every
 * other widget on this screen uses. Renders full-width of the parent
 * Overview's centerCol (see the twoColRow layout above) — the mockup's own
 * Approvals panel is full-width of its page's center column too, not a
 * small card sharing a row with the sidebar's Coin Jars/Meals/Grocery.
 */
type ApprovalFilterKey = 'all' | ApprovalItem['kind'];
const APPROVAL_FILTERS: { key: ApprovalFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'chore', label: 'Chores' },
  { key: 'redemption', label: 'Redemptions' },
  { key: 'request', label: 'Kid requests' },
];

function ParentApprovalsWidget({
  approvals, k, isDark, onApproveChore, onDeclineChore, onApproveRedemption, onRejectRedemption,
  onApproveRequest, onDeclineRequest,
}: {
  approvals: ApprovalItem[];
  k: KioskColors;
  isDark: boolean;
  onApproveChore: (questId: string) => void;
  /** Matches the phone's requestRedo(id, reviewerId, reason, presetKey?). */
  onDeclineChore: (questId: string, reason: string, presetKey?: RejectionPresetKey) => void;
  onApproveRedemption: (id: string) => void;
  onRejectRedemption: (id: string) => void;
  onApproveRequest: (id: string) => void;
  onDeclineRequest: (id: string) => void;
}) {
  const [filter, setFilter] = useState<ApprovalFilterKey>('all');
  const filtered = filter === 'all' ? approvals : approvals.filter(a => a.kind === filter);
  const hasUrgent = approvals.some(a => a.urgencyRank >= 3);
  // One shared redo sheet for the whole panel rather than one per row — a
  // parent only ever declines one chore at a time, and this matches the
  // phone's own RedoSheet, which is a single sheet at the deck level too.
  const [redoTarget, setRedoTarget] = useState<{ id: string; title: string } | null>(null);

  return (
    <WidgetCard k={k} isDark={isDark} accent={hasUrgent ? k.danger : undefined}>
      {/* Local header, not the shared WidgetHeader — the mockup's own
          .panel-head is a single line (uppercase eyebrow-style title + a
          small faint count, no separate large title underneath), not
          WidgetHeader's fixed icon-chip + two-line eyebrow/title shape.
          WidgetHeader is right for every card-shaped widget on this
          screen; this panel is deliberately the mockup's own denser list-
          panel style instead. */}
      <PanelHead
        title="Approvals" k={k}
        right={approvals.length > 0
          ? <Text style={[s.panelCount, { color: k.textFaint }]}>{approvals.length} pending</Text>
          : undefined}
      />
      <View style={s.filterRow}>
        {/* Local chip, not the shared KioskPill — the mockup's .chip.active
            is a solid dark-fill/inverted-text pill (background:var(--text),
            color:var(--ink)), not KioskPill's accent-tinted-wash selected
            state. KioskPill's own look is correct for its other consumers
            (request-form presets); changing it there to match this one
            panel would be the same mistake as editing a shared radius
            token for one card's sake. */}
        {APPROVAL_FILTERS.map(f => {
          const count = f.key === 'all' ? approvals.length : approvals.filter(a => a.kind === f.key).length;
          const selected = filter === f.key;
          return (
            <Pressable
              key={f.key} onPress={() => setFilter(f.key)}
              style={[s.filterChip, {
                backgroundColor: selected ? k.text : k.well,
                borderColor: selected ? k.text : k.cardBorder,
              }]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={f.label}
            >
              <Text style={[s.filterChipText, { color: selected ? k.card : k.textMuted }]} numberOfLines={1}>
                {f.label} <Text style={{ opacity: 0.6 }}>({count})</Text>
              </Text>
            </Pressable>
          );
        })}
      </View>
      {filtered.length === 0 ? (
        <EmptyNote text="Nothing waiting on a decision right now." k={k} />
      ) : (
        // Live-requested: "show max 5 and scrollable" — same bounded-
        // ScrollView pattern already used for Meals This Week's own
        // remaining-week list, so a big pending queue scrolls inside this
        // card instead of pushing Rides/Family Schedule further down or
        // running unbounded off the screen.
        <ScrollView style={s.approvalsScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {filtered.map((item, i) => (
            <ApprovalRow
              key={item.id} item={item} k={k} isDark={isDark}
              isFirst={i === 0}
              onApproveChore={onApproveChore}
              onDeclineChore={() => setRedoTarget({ id: item.id.slice(item.id.indexOf(':') + 1), title: item.title })}
              onApproveRedemption={onApproveRedemption}
              onRejectRedemption={onRejectRedemption}
              onApproveRequest={onApproveRequest}
              onDeclineRequest={onDeclineRequest}
            />
          ))}
        </ScrollView>
      )}
      <RedoReasonSheet
        target={redoTarget} k={k}
        onClose={() => setRedoTarget(null)}
        onSend={(reason, presetKey) => {
          if (redoTarget) onDeclineChore(redoTarget.id, reason, presetKey);
          setRedoTarget(null);
        }}
      />
    </WidgetCard>
  );
}

/**
 * A flat list row — the mockup's `.task` (a plain bordered checkbox square,
 * title + inline meta/who-badge, coin amount, small filled text-button
 * pair) — rather than the bordered `Well` card ApprovalRow used before this
 * rewrite. Every other widget's rows are cards because every other widget
 * is a small grid card; this panel is a list, so its rows are list rows.
 */
function ApprovalRow({
  item, k, isDark, isFirst, onApproveChore, onDeclineChore, onApproveRedemption, onRejectRedemption, onApproveRequest, onDeclineRequest,
}: {
  item: ApprovalItem;
  k: KioskColors;
  isDark: boolean;
  isFirst: boolean;
  onApproveChore: (questId: string) => void;
  /** Opens the shared redo-reason sheet — never a direct decline. */
  onDeclineChore: () => void;
  onApproveRedemption: (id: string) => void;
  onRejectRedemption: (id: string) => void;
  onApproveRequest: (id: string) => void;
  onDeclineRequest: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const rawId = item.id.slice(item.id.indexOf(':') + 1);
  const urgent = item.urgencyRank >= 3;

  const approve = () => {
    setBusy(true);
    if (item.kind === 'chore') onApproveChore(rawId);
    else if (item.kind === 'redemption') onApproveRedemption(rawId);
    else onApproveRequest(rawId);
  };
  const decline = () => {
    // Chore decline opens the reason sheet instead of firing immediately —
    // never sets busy here, since the row stays interactive until the sheet
    // itself sends or is cancelled.
    if (item.kind === 'chore') { onDeclineChore(); return; }
    setBusy(true);
    if (item.kind === 'redemption') onRejectRedemption(rawId);
    else onDeclineRequest(rawId);
  };

  return (
    <KioskListRow
      k={k}
      isFirst={isFirst}
      title={item.title}
      meta={item.meta}
      badge={item.who}
      // Mock's .task-coin always occupies this slot, even with nothing to
      // show — a real coin figure, or an em-dash at reduced opacity for a
      // kid request (which never carries coins). Keeps every row's coin
      // column aligned instead of requests alone losing their right edge.
      value={
        <Text
          style={[s.approvalCoin, typeof item.coins === 'number' ? { color: k.gold } : { color: k.textFaint, opacity: 0.35 }]}
          numberOfLines={1}
        >
          {typeof item.coins === 'number' ? (item.coins > 0 ? `+${item.coins}` : item.coins) : '—'}
        </Text>
      }
      actions={
        <>
          <KioskListRowAction
            k={k} onPress={decline} disabled={busy}
            label={item.kind === 'chore' ? 'Redo' : 'Decline'}
            color={k.danger}
          />
          <KioskListRowAction
            k={k} onPress={approve} disabled={busy}
            label="Approve"
            color={k.text}
          />
        </>
      }
    />
  );
}

/**
 * Kiosk equivalent of the phone's RedoSheet (ParentReviewDeck.tsx) — same
 * REJECTION_PRESETS list, same "pick a preset or write your own" shape, same
 * requestRedo(id, reviewerId, reason, presetKey) call underneath. Built on
 * KioskFormDrawer/KioskPill rather than a hand-rolled Modal so it matches
 * every other kiosk form sheet's chrome (scrim, keyboard-aware height,
 * KioskModalHost idle-lock participation) instead of copying the phone's
 * raw Modal styling verbatim.
 */
function RedoReasonSheet({ target, k, onClose, onSend }: {
  target: { id: string; title: string } | null;
  k: KioskColors;
  onClose: () => void;
  onSend: (reason: string, presetKey?: RejectionPresetKey) => void;
}) {
  const [preset, setPreset] = useState<RejectionPresetKey | null>(null);
  const [customMsg, setCustomMsg] = useState('');

  const reason = preset === 'CUSTOM' ? customMsg.trim() : REJECTION_PRESETS.find(p => p.key === preset)?.label ?? '';

  const close = () => { setPreset(null); setCustomMsg(''); onClose(); };

  return (
    <KioskFormDrawer
      visible={!!target} title="Request redo" subtitle={target?.title}
      accent={k.danger} Icon={X} k={k} onClose={close}
      submitLabel="Send redo" canSubmit={!!reason} onSubmit={() => { onSend(reason, preset ?? undefined); setPreset(null); setCustomMsg(''); }}
      footerNote="The kid sees this note on their chore card."
    >
      <KioskFieldLabel k={k}>What needs fixing?</KioskFieldLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.md }}>
        {REJECTION_PRESETS.map(p => (
          <KioskPill
            key={p.key} label={p.label} selected={preset === p.key}
            onPress={() => setPreset(p.key)} accent={k.danger} k={k}
          />
        ))}
      </View>
      {preset === 'CUSTOM' && (
        <TextInput
          value={customMsg} onChangeText={setCustomMsg}
          placeholder="Describe what needs to be fixed…" placeholderTextColor={k.textFaint}
          multiline numberOfLines={3}
          style={[kioskInputStyle(k), { minHeight: 90, textAlignVertical: 'top' }]}
        />
      )}
    </KioskFormDrawer>
  );
}

// ── Senior's own tasks — one calm summary card, not a board ──────────────
/**
 * Replaces the parent's Rides widget in a senior/grandparent's Overview
 * (see the isSenior comment above for why the parent deck doesn't apply
 * here). Deliberately the simplest widget on this screen: a single number
 * ("what's open"), up to three titles, and a link into Tasks for anything
 * beyond that — no inline claim/submit/approve actions, no status lanes,
 * no board. The design brief is explicit that Grandparent keeps
 * "one-decision-at-a-time simplicity" even as the other roles' Hubs get
 * denser, so this stays a glance-and-go summary rather than growing into
 * its own copy of KidChoresWidget's action-button machinery.
 *
 * "Yours" mirrors the one senior-scoped filter this app already shipped
 * for exactly this purpose (the now-unreachable KioskHubTab's openPool/
 * inProgress memos): a chore this senior is either assigned to directly or
 * sponsoring (sponsorUserId), open or in flight — not the whole household's
 * board.
 */
function SeniorTasksWidget({ active, quests, k, isDark, onOpenTasks, style }: {
  active: FamilyMember;
  quests: import('@/store/questStore').Quest[];
  k: KioskColors;
  isDark: boolean;
  onOpenTasks: () => void;
  style?: any;
}) {
  const mine = useMemo(
    () => quests.filter(q =>
      (q.assignedToId === active.id || q.sponsorUserId === active.id) &&
      (q.status === 'todo' || q.status === 'claimed' || q.status === 'in_progress' || q.status === 'pending_approval'),
    ),
    [quests, active.id],
  );
  const inReview = useMemo(() => mine.filter(q => q.status === 'pending_approval').length, [mine]);

  return (
    <WidgetCard k={k} isDark={isDark} style={style}>
      <WidgetHeader
        Icon={CheckSquare} eyebrow="Your list" title="Chores & errands"
        accent={k.purple} k={k} isDark={isDark}
        right={mine.length > 0
          ? <Chip label={`${mine.length}`} accent={k.purple} isDark={isDark} k={k} />
          : undefined}
      />
      {mine.length === 0 ? (
        <EmptyNote text="Nothing open on your list right now." k={k} />
      ) : (
        <View>
          {mine.slice(0, 3).map((q, i) => (
            <View
              key={q.id}
              style={[s.seniorTaskRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}
            >
              <View style={[s.seniorTaskDot, { backgroundColor: q.status === 'pending_approval' ? k.gold : k.purple }]} />
              <Text style={[s.seniorTaskTitle, { color: k.text }]} numberOfLines={1}>{q.title}</Text>
              {q.status === 'pending_approval' && (
                <Text style={[s.seniorTaskMeta, { color: k.gold }]}>Awaiting review</Text>
              )}
            </View>
          ))}
          {mine.length > 3 && (
            <Text style={[s.seniorTaskMeta, { color: k.textFaint, marginTop: KIOSK_SPACE.xs }]}>
              and {mine.length - 3} more
            </Text>
          )}
        </View>
      )}
      <ActionButton
        label={inReview > 0 ? `See full list · ${inReview} awaiting review` : 'See full list'}
        accent={k.purple} k={k} isDark={isDark}
        onPress={onOpenTasks}
        style={{ marginTop: KIOSK_SPACE.sm }}
        accessibilityHint="Open the chores and tasks board"
      />
    </WidgetCard>
  );
}

// ── FindFam radar strip ─────────────────────────────────────────────────
/**
 * The mockup's full-width GPS banner. Reads the SAME `member_locations`
 * table + per-member decryptLocationText path the phone's GPS tab and
 * KioskFindFamTab already use — no second source, no invented coordinates.
 *
 * Deliberately shows status/neighborhood text only, never coordinates or a
 * street address: this strip is on the always-visible overview of a screen
 * a guest can stand in front of. The Find tab (a deliberate act of
 * navigation) is where precise location lives.
 */
/**
 * Mockup's "Family Feed" sidebar panel: a horizontal scroller of recent
 * photo thumbnails with a caption below each. KioskMemorySlideshow's own
 * `compact` mode is a VERTICAL strip (the shape every other role's Overview
 * already uses) — this is a separate small component rather than a new mode
 * bolted onto that shared one, since only this parent sidebar needs the
 * horizontal shape.
 *
 * Caption is the memory's title alone, not "Who · caption" the way the
 * mockup shows it — family_memories (useKioskPhotos' real source) has no
 * uploader/member field at all, and inventing a name would be exactly the
 * kind of fabricated content this app's own real-data-or-nothing rule
 * (see this file's header) exists to prevent.
 */
function FamilyFeedStrip({ k, isDark, onOpen }: { k: KioskColors; isDark: boolean; onOpen: () => void }) {
  const { photos } = useKioskPhotos();
  return (
    <WidgetCard k={k} isDark={isDark} padded={false}>
      <PanelHead
        title="Family feed" k={k}
        style={{ paddingHorizontal: KIOSK_SPACE.md, paddingTop: KIOSK_SPACE.md, marginBottom: KIOSK_SPACE.sm }}
      />
      {photos.length === 0 ? (
        <EmptyNote text="No family photos kept yet." k={k} style={{ paddingHorizontal: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.md }} />
      ) : (
        <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open Memories">
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingHorizontal: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.md }}
          >
            {photos.slice(0, 8).map(p => (
              <View key={p.key} style={s.feedItem}>
                <Image source={{ uri: p.url }} style={[s.feedThumb, { borderColor: k.cardBorder }]} />
                <Text style={[s.feedCap, { color: k.textFaint }]} numberOfLines={2}>{p.title}</Text>
              </View>
            ))}
          </ScrollView>
        </Pressable>
      )}
    </WidgetCard>
  );
}

/**
 * FamilySchedulePanel — the mock's own center-column timeline
 * (Now-strip -> Schedule -> Approvals), extracted into its own component
 * per the "make it modular" direction rather than staying inline JSX in
 * the main render.
 *
 * Live-requested: "always show ongoing onwards, remaining scroll to" —
 * bounded to a real height (same "N rows before it scrolls" pattern as
 * Meals This Week/Approvals) AND auto-scrolled, once, to the first not-yet-
 * done event on mount/data-change, so a parent glancing at this panel
 * mid-afternoon sees the current/next event first rather than having to
 * scroll past a morning's worth of already-finished rows. Measured via
 * each row's own onLayout (its real rendered position) rather than a
 * guessed fixed row height, since row height genuinely varies (a row with
 * a "who" line or a location line is taller than one without either).
 */
function FamilySchedulePanel({ dayEvents, k, isDark }: {
  dayEvents: FamilyEvent[]; k: KioskColors; isDark: boolean;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const rowOffsets = useRef<Map<string, number>>(new Map());
  const hasScrolled = useRef(false);

  const sorted = useMemo(
    () => [...dayEvents].sort((a, b) => (a.allDay ? '' : a.time ?? '').localeCompare(b.allDay ? '' : b.time ?? '')),
    [dayEvents],
  );
  const nowHHMM = new Date().toTimeString().slice(0, 5);
  const rowState = (ev: FamilyEvent) => {
    const isCurrent = !ev.allDay && !!ev.time && ev.time <= nowHHMM && (!ev.endTime || ev.endTime > nowHHMM);
    const isDone = !ev.allDay && !!ev.time && (ev.endTime ? ev.endTime <= nowHHMM : ev.time < nowHHMM);
    return { isCurrent, isDone };
  };
  // Re-run once new layout measurements come in (each row's onLayout fires
  // after this render commits) — cheap no-op once already scrolled for
  // this data set, guarded by hasScrolled so a later re-render (e.g. the
  // clock ticking a done row into being) doesn't keep re-snapping the
  // scroll position out from under someone reading it.
  useEffect(() => {
    hasScrolled.current = false;
  }, [dayEvents]);
  const maybeScrollToOngoing = () => {
    if (hasScrolled.current) return;
    const firstOpenIdx = sorted.findIndex(ev => !rowState(ev).isDone);
    if (firstOpenIdx <= 0) { hasScrolled.current = true; return; } // nothing done above it — no scroll needed
    const target = sorted[firstOpenIdx];
    const y = rowOffsets.current.get(target.id);
    if (y == null) return; // that row hasn't reported its layout yet
    hasScrolled.current = true;
    scrollRef.current?.scrollTo({ y, animated: false });
  };

  return (
    <WidgetCard k={k} isDark={isDark}>
      {/* Family Schedule — genuinely missing until now: the mockup's own
          center-column timeline (Now-strip -> Schedule -> Approvals) had
          no real equivalent on this screen at all. Parent-only (this
          whole branch is), so the real per-event sensitivity redaction
          (canViewSensitiveEventDetail) doesn't apply here — a parent
          already gets full detail on every event unconditionally, same
          rule KioskScheduleTab enforces elsewhere on this device for
          other roles. All-day events (no time slot) list first, timed
          events after in order — same convention every other real
          calendar surface in this app already uses for all-day items. */}
      <PanelHead
        title="Family schedule" k={k} style={{ marginBottom: 4 }}
        right={
          <Text style={[s.panelCount, { color: k.textFaint }]}>
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
        }
      />
      {dayEvents.length === 0 ? (
        <EmptyNote text="Nothing on the calendar today." k={k} />
      ) : (
        <ScrollView ref={scrollRef} style={s.scheduleScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {sorted.map((ev, i) => {
            const a = eventAssignee(ev);
            // Mock's exact .tl-item.done / .tl-item.current states: an
            // all-day event is neither (no time to compare); a timed
            // event is "current" while nowHHMM falls inside
            // [time, endTime), "done" once its end (or, if it has none,
            // its start) has already passed.
            const { isCurrent, isDone } = rowState(ev);
            return (
              <View
                key={ev.id}
                onLayout={(e) => {
                  rowOffsets.current.set(ev.id, e.nativeEvent.layout.y);
                  // Checked after EVERY row's layout, not just the last —
                  // RN doesn't guarantee child onLayout firing order, so
                  // the target row (which comes before the last one in
                  // the list) might not have reported its own y yet by
                  // the time the last row does. hasScrolled + the y==null
                  // bail inside maybeScrollToOngoing make this cheap to
                  // call opportunistically until it actually succeeds.
                  maybeScrollToOngoing();
                }}
                style={[
                  s.tlItem,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder },
                ]}
              >
                {/* Mock's .tl-item.current::before is absolutely
                    positioned (left:-20px, no width/margin effect on the
                    row itself) — a real borderLeftWidth here would shift
                    this ONE row 1px out of alignment with every other row
                    in the list (confirmed: an earlier version did exactly
                    that with a marginLeft:-1 hack). This overlay approach
                    matches the mock exactly AND never touches layout. */}
                {isCurrent && <View style={[s.tlCurrentBar, { backgroundColor: k.primary }]} />}
                <Text style={[s.tlTime, { color: k.textFaint }]} numberOfLines={1}>
                  {ev.allDay || !ev.time ? 'All day' : fmtTime(ev.time)}
                </Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {!!a.name && (
                    <Text style={[s.tlWho, { color: k.textFaint }]} numberOfLines={1}>{a.name}</Text>
                  )}
                  <Text
                    style={[s.tlTitle, { color: isCurrent ? k.primary : isDone ? k.textFaint : k.text }, isDone && { textDecorationLine: 'line-through' }]}
                    numberOfLines={1}
                  >
                    {ev.title}
                  </Text>
                  {!!ev.location && (
                    <Text
                      style={[s.tlMeta, { color: isDone ? k.textFaint : k.textMuted }, isDone && { textDecorationLine: 'line-through' }]}
                      numberOfLines={1}
                    >
                      {ev.location}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </WidgetCard>
  );
}

function RadarStrip({ members, k, isDark, onOpen, style }: {
  members: FamilyMember[]; k: KioskColors; isDark: boolean; onOpen: () => void;
  /** Caller-controlled outer width — parent mounts this inside centerCol
   *  (no extra style needed, stretches to match Approvals/Rides exactly);
   *  kid/teen mount it in their own flex-wrap deck (s.widget, same as
   *  every sibling card there). Same component either way, not a
   *  duplicated one — only the mount point and this one prop differ. */
  style?: StyleProp<ViewStyle>;
}) {
  const [rows, setRows] = useState<RadarRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from('member_locations').select('*').order('member_id');
      if (cancelled || !data) return;
      const decrypted = await Promise.all((data as any[]).map(async r => ({
        ...r,
        neighborhood: r.neighborhood ? await decryptLocationText(r.member_id, r.neighborhood) : null,
      })));
      if (!cancelled) setRows(decrypted as RadarRow[]);
    };
    load();
    // Debounced for the same native-map/burst reason KioskFindFamTab
    // documents — and because a whole family moving at school pickup time
    // is exactly a burst.
    let t: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase
      .channel(`kiosk_radar_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_locations' }, () => {
        if (t) clearTimeout(t);
        t = setTimeout(load, 400);
      })
      .subscribe();
    return () => { cancelled = true; if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, []);

  const visible = members.filter(m => !m.deletedAt && m.inviteStatus !== 'pending');
  const sharing = visible.filter(m => {
    const r = rows.find(x => x.member_id === m.id);
    return !!r && r.share_location_enabled !== false;
  }).length;

  return (
    <WidgetCard k={k} isDark={isDark} style={style}>
      {/* Local panelHead, matching every other rebuilt panel this session
          (Approvals, Coin Jars, Meals, Grocery, Family Feed, Family
          Schedule) — this was the one widget still using the old
          WidgetHeader icon-chip + two-line title, visibly out of step
          with the rest of the screen. */}
      <PanelHead
        title="Find fam" k={k}
        right={
          <Pressable
            onPress={onOpen} hitSlop={10}
            accessibilityRole="button" accessibilityLabel="Open the map"
            accessibilityHint="See everyone on the family map"
          >
            <Text style={[s.panelCount, { color: sharing > 0 ? k.sage : k.textFaint }]}>
              {sharing}/{visible.length} sharing
            </Text>
          </Pressable>
        }
      />
      {/* Real fixed 3-per-row grid (flexGrow:0/flexBasis:33.333%, same
          pattern established earlier this session for the kid/senior
          deck) rather than the old flexGrow:1/flexBasis:220 combination,
          which produced a variable 2-4 column count depending on width
          instead of a consistent 3. */}
      <View style={s.radarGrid}>
        {visible.map(m => {
          const raw = rows.find(x => x.member_id === m.id);
          // A member who turned sharing off keeps their last-known row in
          // the table — showing it would misrepresent stale data as live,
          // the exact bug KioskFindFamTab's own comment records fixing.
          const loc = raw && raw.share_location_enabled !== false ? raw : null;
          const accent = kioskRoleAccent(k, m.role);
          const low = loc?.battery_level != null && loc.battery_level <= 20;
          return (
            <View key={m.id} style={s.radarCell}>
              <View style={[s.radarAvatar, { borderColor: loc ? accent : k.cardBorder }]}>
                <Text style={s.radarEmoji}>{m.emoji ?? '👤'}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.radarName, { color: k.text }]} numberOfLines={1}>
                  {m.name?.trim().split(' ')[0]}
                </Text>
                <Text
                  style={[s.radarStatus, { color: loc ? accent : k.textFaint }]}
                  numberOfLines={1}
                >
                  {loc
                    ? (loc.status_text || STATUS_LABEL[loc.status] || 'Sharing')
                    : 'Not sharing'}
                </Text>
              </View>
              {low && (
                <View style={s.radarBattery} accessibilityLabel={`Battery ${loc!.battery_level} percent`}>
                  <BatteryLow size={13} color={k.danger} />
                  <Text style={[s.radarBatteryText, { color: k.danger }]} numberOfLines={1}>
                    {loc!.battery_level}%
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </WidgetCard>
  );
}

const s = StyleSheet.create({
  scroll: { padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xxl, gap: KIOSK_SPACE.md },

  // Hero. Wraps to stacked on a narrow/portrait pane — flexBasis with
  // flexWrap rather than a measured breakpoint, so it reflows by
  // construction and can't drift the way an arithmetic width can.
  // Mockup's .now-strip exactly: 18/20px padding, 16px gap, single row.
  nowStrip: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18 },
  nowStripDotWrap: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nowStripDotHalo: { position: 'absolute', width: 16, height: 16, borderRadius: 8 },
  nowStripDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  nowStripLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.1 },
  nowStripWhat: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  nowStripTime: { fontSize: 12, flexShrink: 0 },

  heroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  hero: { flexGrow: 3, flexBasis: 460, minWidth: 0 },
  heroSide: { flexGrow: 1, flexBasis: 280, minWidth: 0 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: KIOSK_SPACE.sm },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 0.6 },
  heroGreetRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md, marginTop: KIOSK_SPACE.md },
  heroAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  heroAvatarEmoji: { fontSize: 28 },
  heroTitle: { fontSize: KIOSK_TYPO.hero, fontWeight: '800', letterSpacing: -0.8 },
  heroSub: { fontSize: KIOSK_TYPO.body, fontWeight: '600', marginTop: 4 },

  // nowrap, not wrap: with Check In / Piggy Bank / Cheer Squad / My
  // Requests all promoted alongside Intercom, this row can hold 5 tiles —
  // it should read as one single strip, shrinking each tile rather than
  // wrapping to a second row.
  quickRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: KIOSK_SPACE.xs, marginTop: KIOSK_SPACE.lg },
  // Shrunk to fit alongside 4 kid tiles in one non-wrapping strip
  // (quickRow above) — flexShrink lets 5 tiles compress evenly rather than
  // wrap, flexBasis is a starting point, not a floor.
  quick: {
    flexGrow: 1, flexShrink: 1, flexBasis: 76, minWidth: 0,
    minHeight: KIOSK_HIT.min, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 6,
  },
  quickLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', textAlign: 'center' },
  quickBadge: {
    position: 'absolute', top: 4, right: 6, minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  quickBadgeText: { fontSize: KIOSK_TYPO.micro, fontWeight: '900' },

  mealEmpty: {
    flex: 1, minHeight: 130, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.sm, padding: KIOSK_SPACE.md,
  },

  // Breakfast/Lunch/Dinner — three scrollable cards, one per type, each
  // opening its own recipe (KioskRecipeDrawer) instead of one dinner
  // summary that opened a day-overview popup.
  mealTypeRow: { flexDirection: 'row', gap: KIOSK_SPACE.sm, paddingRight: KIOSK_SPACE.xs },
  mealTypeCard: {
    width: 132, minHeight: 130, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: 4, padding: KIOSK_SPACE.sm,
  },
  mealTypeLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
  mealTypeEmoji: { fontSize: 28, marginTop: 2 },
  mealTypeTitle: { fontSize: KIOSK_TYPO.caption, fontWeight: '800', textAlign: 'center', marginTop: 2 },
  mealTypeEmpty: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', textAlign: 'center', marginTop: 4 },

  // Parent's two-column page — center column (Rides, Approvals) full-width
  // of its own column, sidebar column (Coin jars, Grocery, Photo feed)
  // full-width of ITS column — matching the mockup's actual page grid
  // EXACTLY: `.layout{grid-template-columns: 300px 1fr 340px}` (rail,
  // center, right-col) — the rail and sidebar are FIXED pixel columns,
  // only the center column is flexible. Full re-read of the mock's own
  // CSS corrected an earlier approximation here that used a 1.9:1 flex
  // ratio between center and sidebar instead of matching this real grid.
  // Cards inside each column render with no explicit width style of their
  // own (WidgetCard's default) — the column itself sets the width, so a
  // card doesn't also need flexBasis fighting its container.
  twoColRow: { flexDirection: 'row', gap: KIOSK_SPACE.md, alignItems: 'flex-start' },
  // Below isNarrowParentLayout's threshold: stack instead of split — a
  // fractional flex share of an already-narrow row is what actually causes
  // cramped/clipped content on rotation, not any single component's own
  // sizing. Matches the mock's own @media(max-width:1080px) rule, which
  // collapses its whole 3-column grid to `1fr` at the same width this
  // file's own isNarrowParentLayout threshold uses.
  twoColRowStacked: { flexDirection: 'column' },
  colFullWidth: { flex: undefined, width: '100%' },
  centerCol: { flex: 1, gap: KIOSK_SPACE.md, minWidth: 0 },
  sideCol: { flex: undefined, width: 340, gap: KIOSK_SPACE.md, minWidth: 0 },

  // Widget deck.
  //
  // A real fixed grid rather than flexGrow-stretched flex-wrap. The
  // previous flexGrow:1/flexBasis:320 combination let each row's cards
  // stretch to fill whatever space was left in that row, so column count
  // and column width both drifted row to row depending on which widgets
  // happened to land together — reported as the deck looking "random"
  // rather than matching the mockup's own aligned grid sections.
  // flexGrow:0/flexShrink:0 here is what actually fixes it: every widget
  // is EXACTLY one third of the deck's width regardless of its neighbors'
  // content, so columns line up top to bottom the way a real grid would.
  // RN's Yoga engine resolves gap before splitting the percentage basis
  // (unlike older web flexbox engines), so '33.333%' alongside the deck's
  // own `gap` needs no manual gap-subtraction math.
  //
  // Tradeoff, accepted: a short widget (e.g. Grocery) now leaves empty
  // space below it in its own column rather than a later card flowing up
  // into that gap — the cost of every column being a true fixed width.
  deck: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  // No minWidth alongside flexShrink:0/a percentage basis — that pairing
  // would force a fixed pixel floor per column and overflow horizontally
  // on any kiosk device narrower than 3 columns' worth, instead of letting
  // flexWrap reflow down to 2 or 1 columns the way it does today.
  widget: { flexGrow: 0, flexShrink: 0, flexBasis: '33.333%' },
  // Senior's photo feed — two grid columns wide (still grid-aligned, unlike
  // the old flexGrow:3 ratio) so it reads as the deck's centerpiece next to
  // the one-column SeniorTasksWidget beside it.
  widgetWide: { flexGrow: 0, flexShrink: 0, flexBasis: '66.666%' },

  seniorTaskRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.sm,
  },
  seniorTaskDot: { width: 6, height: 6, borderRadius: 3 },
  seniorTaskTitle: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  seniorTaskMeta: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },

  rideSectionLabel: { fontSize: KIOSK_TYPO.label, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  rideTop: { flexDirection: 'row', alignItems: 'flex-start', gap: KIOSK_SPACE.sm },
  rideTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  rideMeta: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 3 },
  rideActions: { flexDirection: 'row', gap: KIOSK_SPACE.sm, marginTop: KIOSK_SPACE.sm },
  rideNote: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', marginTop: KIOSK_SPACE.xs },

  // Approvals panel — sized directly off the mockup's own .task/.task-*
  // literal pixel values rather than translated through the wider kiosk
  // type/space scale, since this panel is deliberately denser and more
  // list-like than every card-shaped widget around it.
  // Mockup's .panel-head/.panel-title exactly: single row, 11px/700/
  // uppercase/0.12em-tracked title, small faint count on the right.
  // panelHead/panelTitle now live as the shared PanelHead component in
  // KioskOS.tsx — promoted there once a third file (KioskMealsTab.tsx)
  // needed the identical style. panelCount stays local: it's real
  // right-slot CONTENT (a count, a date, a sharing readout), not part of
  // the shared header shell itself.
  panelCount: { fontSize: 11 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  // Mockup's .chip exactly: 999px pill, 1px border, 7x13 padding, 12px/700 text.
  filterChip: {
    borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 13, paddingVertical: 7,
  },
  filterChipText: { fontSize: 12, fontWeight: '700' },
  // Consumer-specific coin-figure formatting for KioskListRow's `value`
  // slot — the row shell itself (check/title/meta/badge/actions) is now
  // KioskListRow, shared with the Recently Approved dispute cards.
  approvalCoin: { fontSize: 14, fontWeight: '700', flexShrink: 0 },

  // Mockup's .jar/.jar-avatar/.jar-name/.jar-meta/.jar-amt exactly.
  jarRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10 },
  jarAvatar: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  jarInitial: { fontSize: 15, fontWeight: '700', color: '#fff' },
  jarName: { fontSize: 13.5, fontWeight: '700' },
  jarMeta: { fontSize: 11.5, marginTop: 2 },
  jarAmt: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  // Shared quiet "see more" link for any sidebar panel (Coin Jars' "Open
  // reward store", Grocery's "Open list") — not named after either card
  // specifically, since a third panel could reuse it the same way.
  panelTextLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    marginTop: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs, minHeight: KIOSK_HIT.min,
  },
  panelTextLinkText: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },

  // Mockup's .tl-item exactly: 58px time column + flexible body, 14px gap,
  // 13px vertical padding, hairline top border between rows.
  tlItem: { flexDirection: 'row', gap: 14, paddingVertical: 13, position: 'relative' },
  // Mock's .tl-item.current::before: a 3px accent bar overlaid at the
  // panel's own left edge, absolutely positioned so it never affects the
  // row's own layout/width.
  tlCurrentBar: { position: 'absolute', left: -KIOSK_SPACE.md, top: 0, bottom: 0, width: 3 },
  tlTime: { width: 58, fontSize: 12, fontWeight: '600', marginTop: 2 },
  tlWho: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 1 },
  tlTitle: { fontSize: 14, fontWeight: '700' },
  tlMeta: { fontSize: 12, marginTop: 2 },

  // Mockup's .grocery-row/.grocery-check/.grocery-item exactly.
  groceryRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, minHeight: KIOSK_HIT.control },
  groceryCheck: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  groceryItemText: { fontSize: 13, fontWeight: '600' },

  // Tappable — opens KioskRunDetailSheet's live item list. Was read-only
  // status-only; live-requested to show the run's actual live item list
  // ("added by X · N ago"), so this is now a real navigation target, not
  // a start/open-a-run affordance (still not ported — kiosk can't do that).
  groceryRunBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    borderWidth: 1, borderRadius: KIOSK_RADIUS.sm,
    paddingVertical: 9, paddingHorizontal: 12, marginBottom: 10,
  },
  groceryRunBannerText: { flex: 1, fontSize: 12, fontWeight: '700' },
  groceryRunBannerLink: { fontSize: 11, fontWeight: '800', flexShrink: 0 },

  // Mockup's .feed-item/.feed-thumb/.feed-cap exactly: 96px square thumb,
  // 9px radius, 10.5px caption with a 5px top margin.
  feedItem: { width: 96 },
  feedThumb: { width: 96, height: 96, borderRadius: 9, borderWidth: 1, backgroundColor: '#0002' },
  feedCap: { fontSize: 10.5, lineHeight: 13.5, marginTop: 5 },
  // Bounded so a full remaining-week list scrolls inside the sidebar card
  // rather than pushing Grocery/Family Feed further down — 4 rows'
  // (~180px) worth before it scrolls.
  mealsWeekScroll: { maxHeight: 200 },
  // 5 rows' worth (~65px each incl. padding) before it scrolls, same
  // bounded-ScrollView reasoning as Meals This Week's own list.
  approvalsScroll: { maxHeight: 320 },
  // 5 rows' worth (~64px each: 13px vertical padding x2 + ~38px of
  // stacked time/who/title/meta text), same bounded-ScrollView reasoning.
  scheduleScroll: { maxHeight: 320 },
  // 6 rows' worth (each a single-line KIOSK_HIT.control-height checkable
  // row, 52px) before it scrolls, same bounded-ScrollView reasoning.
  groceryScroll: { maxHeight: 312 },

  // Real fixed 3-per-row grid — flexGrow:0/flexShrink:0/flexBasis:33.333%,
  // the same "every cell is exactly one third regardless of neighbors'
  // content" pattern established earlier this session for the kid/senior
  // widget deck (RN's Yoga resolves gap before splitting a percentage
  // basis, so no manual gap-subtraction math is needed alongside it).
  radarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  radarCell: {
    flexGrow: 0, flexShrink: 0, flexBasis: '33.333%', minWidth: 0,
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    minHeight: KIOSK_HIT.primary,
  },
  radarAvatar: {
    width: 38, height: 38, borderRadius: 19, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  radarEmoji: { fontSize: 19 },
  radarName: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  radarStatus: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', marginTop: 2 },
  radarBattery: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  radarBatteryText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
});
