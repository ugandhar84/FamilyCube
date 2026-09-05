import { useState, useEffect } from 'react';
import { View, Text, Pressable, Alert, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Bell, ClipboardList, Car, Fuel, BookOpen, CreditCard, MessageCircle,
} from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/AppToast';
import { BRAND } from '@/components/FamilyCubeLogo';
import { useEventStore, isEventSensitive, canViewSensitiveEventDetail, eventAssignee } from '@/store/eventStore';
import { dedupeRideSeries } from './lib/dedupeRideSeries';
import type { FamilyEvent } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore, type ChoreTask } from '@/store/choreStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import { useChatStore } from '@/store/chatStore';
import { useDismissedHubItemsStore } from '@/store/dismissedHubItemsStore';
import { useCelebrationStore } from '@/store/celebrationStore';
import { parseDbTime, withinLast24h } from '@/lib/dates';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest, QuestCheer } from '@/store/questStore';
import { localToday, hoursUntilEvent, useCountdown, isWorkEvent } from './hubUtils';
import { detectAssigneeConflicts, detectWorkConflicts } from './lib/detectAssigneeConflicts';
import { KidRequestHistoryModal, GroceryModal, SuppliesModal, AskModal, QuestProposalModal } from './KidModals';
import { AskParentSheet } from './kid/AskParentSheet';
import { MyQuestsSection } from './kid/MyQuestsSection';
import { KidNeedsYouSection } from './kid/KidNeedsYouSection';
import { CantMakeItSheet } from '../tasks/components/CantMakeItSheet';
import { SubmitProofSheet } from './kid/SubmitProofSheet';
import { HubTimelineSection } from './HubTimelineSection';
import { HubGreetingHeader } from './HubGreetingHeader';
import { useUpcomingOpenEvents } from './useUpcomingOpenEvents';
import { PickupRadarStatus } from './hubComponents';
import { KidRideBanner } from './kid/KidRideBanner';
import { TeenTile } from './teen/TeenTile';
import { TeenTileSheet } from './teen/TeenTileSheet';
import { TeenCarDispatchSection } from './teen/TeenCarDispatchSection';
import { TeenGasLogSection } from './teen/TeenGasLogSection';
import { TeenTutorSection } from './teen/TeenTutorSection';
import { TeenCashOutSection } from './teen/TeenCashOutSection';
import { FamilyGamesSection } from '@/features/games/FamilyGamesSection';
import SmartTaskComposer from '../tasks/components/SmartTaskComposer';
import { AddQuestModal } from '@/features/quests/components/AddQuestModal';
import { AddEventModal } from '@/features/calendar/EventFormModal';

const pad = { paddingHorizontal: 16, marginBottom: 4 } as const;

type SheetKey = 'rides' | 'gas' | 'tutor' | 'cashout' | 'history' | null;

// Was three separate inline copies of the same expression (claimPickup,
// dropPickup, confirmAssignment) deciding whether a teen is acting as
// 'driver' vs 'helper' for a given event — a future edit to this
// eligibility rule in one handler but not the others would silently desync
// which RPC role param gets sent for otherwise-identical actions on the
// same event. driverName is only meaningful once someone's already been
// assigned (drop/confirm); claimPickup runs before that, so it's omitted
// there via the optional param.
function rideRoleFor(ev: { rideRequired?: boolean; category?: string; driverName?: string } | undefined, activeName: string): 'helper' | 'driver' {
  if (ev?.driverName === activeName) return 'driver';
  return ev?.rideRequired && ev.category !== 'Ride' ? 'driver' : 'helper';
}

export function TeenView({ active, members, colors, isDark, activeTrips, composerVisible, onCloseComposer }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  // Family-wide Pick-up Radar state, synced from tripStore — read-only
  // here. Every concurrently active trip is shown, not just one.
  activeTrips?: { tripId: string; kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; driverMemberId?: string; etaMinutes: number; startedAtMs?: number }[];
  // The Hub-level FAB (HubScreen.tsx) opens the full SmartTaskComposer for
  // Teen (unrestricted, same as Parent/Senior) — floats outside this
  // view's own inner ScrollView, so its button lives in HubScreen and only
  // the visibility flag is shared down here. familyId isn't threaded as a
  // prop — TeenView already computes its own `familyId` below (used for
  // the grocery store load), reused for the composer too.
  composerVisible: boolean;
  onCloseComposer: () => void;
}) {
  const { events, updateEvent } = useEventStore();
  // Same assignee-double-booked signal HubTimelineSection already computes
  // internally below — this view's own separate KidRideBanner call needs
  // it passed in directly too, since that banner isn't rendered BY
  // HubTimelineSection.
  const conflictReasons = detectAssigneeConflicts(events);
  // Extended to a connected parent's real work calendar (auto-synced Work
  // events, see calendar-freebusy-sync) — a teen's ride colliding with
  // their driving parent's actual work schedule (live direction: "Kid's
  // also show on their card parent is conflict with work").
  for (const [id, label] of detectWorkConflicts(events, events.filter(isWorkEvent), members)) {
    if (!conflictReasons.has(id)) conflictReasons.set(id, label);
  }
  const familyIdForRides = (active as any).familyId as string | undefined;
  // eventStore's `events` is a single-day cache tied to whatever date the
  // Calendar tab last selected — a pickup/ride pool scoped to it silently
  // dropped every open ride not dated "today" (QA Round 8). Same fix
  // SeniorView.tsx already uses for its own dispatch cards, applied here
  // for the teen's ride pool specifically — openPickups/myPickups below use
  // this instead of the single-day `events`.
  const { events: upcomingEvents } = useUpcomingOpenEvents(familyIdForRides);
  // Scenarios 2.6/5.4/5.5 — a sensitive/private/Medical event about a
  // sibling is hidden from this teen entirely (never even a busy block).
  // Own events pass through unaffected.
  const visibleEvents = events.filter(e =>
    !isEventSensitive(e, members) || canViewSensitiveEventDetail(e, 'teen', active.id, active.name));
  const { quests, submitQuest, claimQuest } = useQuestStore();
  const { startGrandparentQuest } = useChoreStore();
  const familyId = (active as any).familyId ?? 'family-1';
  const { updateMember, awardCoins, clawbackCoins } = useFamilyStore();
  const { sendRequest, requests, cancelRequest, loaded: kidRequestsLoaded, loadFromStorage: loadKidRequests } = useKidRequestStore();
  const sendMessage = useChatStore(s => s.sendMessage);
  const today = localToday();

  useEffect(() => {
    if (!kidRequestsLoaded) loadKidRequests();
  }, [kidRequestsLoaded]);

  // temporaryApproverStore's own doc comment names a Teen as a valid grant
  // recipient (Scenarios 9.2/9.3 caregiver mode isn't Senior/GP-only), and
  // QuestCard.tsx reads useTemporaryApproverStore's isActiveApprover(myId)
  // for whichever role is active — but only ParentView.tsx/SeniorView.tsx
  // ever called loadFromStorage/triggered its realtime subscription. A teen
  // granted approver status would have an empty local `grants` array
  // forever (never loaded, never subscribed), so isActiveApprover always
  // read false and their Approve/Decline actions silently never appeared,
  // even with a live, unexpired grant in the DB. Same defensive load
  // SeniorView.tsx already uses, applied here.
  const { loaded: approverGrantsLoaded, loadFromStorage: loadApproverGrants } = useTemporaryApproverStore();
  useEffect(() => { if (!approverGrantsLoaded) loadApproverGrants(); }, [approverGrantsLoaded]);

  // "Needs You" — chore-approval celebration + dismissible feed, same
  // DB-backed store KidView uses (dismissed_hub_items table — survives
  // reinstall and syncs across a shared/second device). Was entirely
  // missing for teens: no approvedQuests computed, no cheer feed, no
  // celebration trigger at all — teens got the push notification for an
  // approved chore but nothing ever showed on the Hub itself, and no
  // celebration animation ever fired (live-reported gap).
  const { dismissedIds, loaded: dismissedLoaded, load: loadDismissedHubItems, dismissItem } = useDismissedHubItemsStore();
  useEffect(() => { loadDismissedHubItems(active.id); }, [active.id]);

  const siblings = members.filter(m => (m.role === 'kid' || m.role === 'teen') && m.id !== active.id);

  // ── My Chores (same normalized model KidView uses) ──────────────────────────
  // See KidView.tsx's identical fix — a chore mid-named-handoff stays
  // assigned to the ORIGINAL holder until accepted, so the receiver needs
  // their own visibility path or their Accept/Pass card never appears.
  const myQuests = quests.filter(q => (q.assignedToId === active.id || q.assignedToIds?.includes(active.id) || q.pendingHandoffTo === active.id) && !q.awaitingParentApproval);
  // inviteGrandparents-flagged chores stay GP-pool-only even while
  // isPool/todo (e.g. after a GP backs out) — excluded here too.
  const poolQuests = quests.filter(q => q.isPool && q.status === 'todo' && !q.isAdultTask && !q.awaitingParentApproval && !q.inviteGrandparents);
  const todoQuests = myQuests.filter(q => q.status === 'todo' && !q.isPool);
  const inProgressQuests = myQuests.filter(q => ['claimed', 'in_progress'].includes(q.status));
  const reviewQuests = myQuests.filter(q => q.status === 'pending_approval');
  const declinedQuests = myQuests.filter(q => q.status === 'declined');
  const approvedQuests = myQuests.filter(q => ['approved', 'done'].includes(q.status));
  const cancelledQuestsToday = myQuests.filter(q => q.status === 'cancelled' && (q.cancelledAt ?? '').startsWith(today));
  const pendingCoins = reviewQuests.reduce((sum, q) => sum + (q.coins ?? 0) + (q.bonusCoins ?? 0), 0);
  const [declineQuest, setDeclineQuest] = useState<ChoreTask | null>(null);
  const [submitProofQuest, setSubmitProofQuest] = useState<Quest | null>(null);

  // Cheers landed on this teen's own completed quests — same feed KidView
  // surfaces in its "Needs You" list.
  const cheersForMe = myQuests.flatMap(q => (q.cheers ?? []).map(c => ({ quest: q, cheer: c })));
  // Approved/declined replies to this teen's own requests (tutor offers,
  // emergency/delegation asks) — same recency window KidView uses. Scoped
  // to requests THIS teen sent, same as KidView's myRequests filter.
  const myOwnRequests = requests.filter(r => r.fromMemberId === active.id && r.status !== 'cancelled');
  const recentReplies = myOwnRequests.filter(r =>
    ['approved', 'declined'].includes(r.status) &&
    ['permission', 'question', 'medication', 'checkin', 'tutor', 'cheer'].includes(r.type) &&
    !dismissedIds.has(r.id) &&
    withinLast24h(r.respondedAt)
  );

  const handleSubmitTap = (q: Quest) => {
    if (q.photoRequired) setSubmitProofQuest(q);
    else submitQuest(q.id, undefined, active.id);
  };

  // ── Car / dispatch — opt-in, only relevant once the teen says they drive ────
  const hasCar = active.hasCar ?? false;
  const rideEarnings = active.rideEarningsPerRun ?? 50;
  const toggleCar = () => updateMember(active.id, { hasCar: !hasCar });

  // dropPickup (below) goes through updateEvent's normal decline path,
  // which clears helper/helperStatus back to unset (via autoOpenOnDecline)
  // rather than leaving a stale 'rejected' status sitting there — so a
  // dropped ride is genuinely reclaimable again, not dead-ended against
  // claimHelperSlot's conditional (NULL-status-only) write. The 'rejected'
  // exclusion here is just a defensive guard against the brief instant
  // between the decline write landing and the reopen clearing it.
  // A parent naming this teen directly as driver (helper=teen's name,
  // helperStatus='pending') is a DIRECT assignment, not something the teen
  // claimed from the open pool — previously invisible everywhere: not in
  // openPickups (not isOpenToTeens), not in myPickups (not yet confirmed),
  // and HubTimelineSection only surfaces today-dated events, so a future
  // assignment had literally no UI anywhere telling the teen it existed
  // (QA Round 8, "no teen surface for you've been asked to drive").
  // QA sweep (UI pass) Critical Finding — these 3 filters were
  // helper/helperStatus-only, so a driverName-based kid ride request opened
  // to teens (isOpenToTeens:true) never showed up in ANY teen pool at all —
  // isOpenToTeens was correctly set, but nothing here ever looked at
  // driverName/driverStatus, so no teen had any visible way to see or claim
  // it. eventAssignee() covers both field pairs, same fix already applied
  // to SeniorView/KidView/EventDetailSheet.
  // dedupeRideSeries applied to each list below — same fix as ParentView's
  // Household Backlog (a recurring ride opened to teens, or directly
  // assigned to one, otherwise shows one card per future occurrence
  // instead of just the soonest, and inflates openPickupCount below by
  // the same amount).
  const [myPendingAssignmentsRaw, openPickupsRaw, myPickupsRaw] = [
    upcomingEvents.filter(e => {
      const a = eventAssignee(e);
      // id-based — falls back to name only for an external, non-member
      // assignee with no id at all.
      const isMine = a.id ? a.id === active.id : a.name === active.name;
      return isMine && a.status === 'pending' && !e.approvalPending && e.date >= today;
    }),
    upcomingEvents.filter(e => {
      const a = eventAssignee(e);
      return e.isOpenToTeens && a.status !== 'confirmed' && a.status !== 'rejected' && e.date >= today;
    }),
    // id-based match — was an exact name compare (itself a fix for an
    // earlier fuzzy includes()-based match that could show a DIFFERENT
    // member's confirmed ride as this teen's own when two names shared a
    // first name); id is stronger still since a.id can't collide at all.
    // Falls back to name only for an external, non-member assignee with no
    // id at all.
    upcomingEvents.filter(e => {
      const a = eventAssignee(e);
      const isMine = a.id ? a.id === active.id : a.name === active.name;
      return isMine && a.status === 'confirmed' && e.date >= today;
    }),
  ];
  // Each list deduped in its OWN call, not one shared call — dedupeRideSeries'
  // seenSeries set spans every list passed together (by design, for
  // ParentView's own two lists that never actually share a seriesId in
  // practice), but these three lists are genuinely status-partitioned
  // (pending vs open-unconfirmed vs confirmed): different OCCURRENCES of
  // the SAME series can legitimately land in different lists (this week's
  // ride already confirmed, next week's still pending) and each such list
  // still needs its own soonest-occurrence representative, not a global
  // per-series cap across all three combined.
  const [myPendingAssignments] = dedupeRideSeries(myPendingAssignmentsRaw);
  const [openPickups] = dedupeRideSeries(openPickupsRaw);
  const [myPickups] = dedupeRideSeries(myPickupsRaw);
  // Live QA finding: this used to be pure local React state — a teen's
  // Pass only hid the ride for as long as the screen stayed mounted,
  // forgotten the instant the app was closed/reopened, unlike a
  // grandparent's Pass (grandparentPassedIds), which is saved to the
  // event and sticks permanently. Now reads the same kind of persisted
  // per-event array (teenPassedIds), symmetric with the grandparent side.
  // Single derivation — was independently recomputed here (badge count),
  // in urgentPickups below, and a third time inside
  // TeenCarDispatchSection.tsx's own openVisible, all as the identical
  // filter expression. Three copies of the same filter risk silently
  // diverging if any one of them is edited later without the others
  // following — the tile's badge count could then stop matching what's
  // actually inside the sheet.
  const openPickupsVisible = openPickups.filter(e => !(e.teenPassedIds ?? []).includes(active.id));
  const urgentPickups = openPickupsVisible.filter(e =>
    hoursUntilEvent(e.date, e.time) >= 0 && hoursUntilEvent(e.date, e.time) < 1);

  // Confirmed ride where THIS teen is being picked up (the ride's subject/
  // rider), not driving it — same pattern KidView uses for confirmedRide.
  // Scoped to memberId/memberIds so a teen driving someone else's ride
  // (myPickups above, matched on driver name) never double-counts as their
  // own pickup banner.
  const [dismissedRideIds, setDismissedRideIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem(`dismissed_rides_${active.id}`).then(val => {
      if (val) setDismissedRideIds(new Set(JSON.parse(val)));
    });
  }, [active.id]);
  useEffect(() => {
    AsyncStorage.setItem(`dismissed_rides_${active.id}`, JSON.stringify([...dismissedRideIds]));
  }, [dismissedRideIds, active.id]);

  const confirmedRide = upcomingEvents.find(e => {
    if (e.date < today) return false;
    if (!(e.memberId === active.id || e.memberIds?.includes(active.id))) return false;
    const a = eventAssignee(e);
    return a.name && a.status === 'confirmed';
  });
  const rideCountdown = useCountdown(confirmedRide?.date, confirmedRide?.time);
  // A direct assignment awaiting confirmation is at least as urgent as an
  // open pickup up for grabs — it's already on this teen specifically —
  // so it counts toward the same "Rides" tile badge.
  const openPickupCount = openPickupsVisible.length + myPendingAssignments.length;

  const claimPickup = (evId: string) => {
    const ev = upcomingEvents.find(e => e.id === evId);
    const coins = ev?.rideCoins ?? rideEarnings;
    // Race-safe: any teen who has this pool open could tap "I'll take it"
    // on the same isOpenToTeens pickup within the same round-trip window —
    // claimHelperSlot does a conditional DB write (only succeeds if
    // helper_status is still unset) instead of an unconditional update, so
    // the loser's optimistic local claim gets rolled back to the real
    // winner instead of both teens' devices showing themselves as confirmed.
    // Coins are awarded only via onWon — a teen who loses the race must not
    // keep coins for a ride they were never actually confirmed on.
    // Same fix as SeniorView's handleClaimRide — was hardcoded 'helper',
    // so claiming a driverName-based (rideRequired) pickup wrote to the
    // wrong column pair and never actually claimed the slot being shown.
    const role = rideRoleFor(ev, active.name);
    useEventStore.getState().claimHelperSlot(evId, role, active.name, undefined, () => {
      if (coins > 0) awardCoins(active.id, coins, 'mainCoins');
      showToast(coins > 0 ? `Got it — +${coins} coins ✓` : 'Got it ✓');
    });
  };

  // A claimed run had no way to back out once confirmed — same rejected-state
  // flow the parent-facing sheet uses, so Parent Hub's own urgency banner
  // (<4hr window) picks it up automatically once it's close enough to matter.
  //
  // Bug fixed here (QA Round 8, finding "coins kept on abandoned ride"):
  // claimPickup pays coins the moment a claim WINS the race, but dropping
  // afterward never reversed that payout — a teen could claim, get paid,
  // then immediately drop and keep the coins for a ride they never drove.
  //
  // Previously this also directly cleared helper/helperStatus to undefined
  // instead of setting helperStatus:'rejected' through the normal
  // updateEvent path — a hand-rolled workaround for autoOpenOnDecline
  // leaving the status stuck at 'rejected' (dead-ending claimHelperSlot's
  // CAS, which only matches a NULL status column) that made a teen's
  // decline behave differently from every other decline site (GP, parent
  // reassignment via hubComponents.tsx) — those never got the same
  // clean-reopen treatment, never triggered autoOpenOnDecline's GP/Teen
  // pool-open, and weren't recognized as a decline by anything checking
  // helperStatus==='rejected' (QA sweep H3). Now that updateEvent's own
  // autoOpenOnDecline clears the stale name+status itself, this can just
  // go through the canonical decline path like everyone else.
  const dropPickup = (evId: string) => {
    const ev = upcomingEvents.find(e => e.id === evId);
    const a = ev ? eventAssignee(ev) : undefined;
    const paidCoins = ev?.rideCoins ?? rideEarnings;
    // clawbackCoins, not deductCoins — dropping a ride after the payout has
    // already been (partly) spent elsewhere is a legitimate clawback, not
    // a race; deductCoins' race guard would silently refuse the whole
    // deduction and let the teen keep the coins in exactly that case (QA
    // sweep, teen-role audit, Critical).
    // id-based — a?.id is undefined only for an external, non-member
    // assignee, which can't be this teen anyway.
    const clawedBack = (a?.id ? a.id === active.id : a?.name === active.name) && paidCoins > 0;
    const role = rideRoleFor(ev, active.name);
    // Routed through the ONE shared declineEventAssignment (store/
    // eventStore.ts) — was its own hand-copied RPC call, same as every
    // other decline site in the app. Coin clawback only fires once the
    // server confirms the drop actually went through — was clawing back
    // unconditionally BEFORE the RPC even fired, which could dock a
    // teen's balance for a ride assignment that never actually changed
    // server-side.
    useEventStore.getState().declineEventAssignment(evId, active.id, role).then(ok => {
      if (!ok) return;
      if (clawedBack) clawbackCoins(active.id, paidCoins, 'mainCoins');
      showToast(clawedBack ? `Dropped — ${paidCoins} coins clawed back` : 'Dropped ✓');
    });
  };

  // Confirming a direct assignment settles it — no coins change hands here
  // (a pending assignment was never paid; payout for a directly-assigned
  // ride, unlike a claimed one, isn't tracked anywhere yet — same gap
  // rideCoins already has on the claim path, left as-is rather than
  // invented here without a clear source of truth for the amount).
  const confirmAssignment = (evId: string) => {
    const ev = upcomingEvents.find(e => e.id === evId);
    const role = rideRoleFor(ev, active.name);
    // Routed through the ONE shared confirmEventAssignment (store/
    // eventStore.ts) — was its own hand-copied RPC call, same as every
    // other confirm site in the app.
    useEventStore.getState().confirmEventAssignment(evId, active.id, role);
  };

  // Either side (rider or driver) can confirm a pickup actually happened —
  // mirrors KidView's confirmPickup exactly, scoped to this teen as rider.
  const confirmPickup = (ev: typeof events[0]) => {
    if (ev.pickupConfirmedAt) return;
    updateEvent(ev.id, { pickupConfirmedAt: new Date().toISOString(), pickupConfirmedBy: active.id });
    sendMessage('all', active.id, `✅ ${active.name.split(' ')[0]} confirmed pickup for "${ev.title}" — all good!`);
  };

  // ── Tutoring / sibling help ───────────────────────────────────────────────────
  const myPendingOffers = requests.filter(r =>
    r.fromMemberId === active.id && r.status === 'pending' && (r.type === 'tutor' || r.type === 'cheer')
  );
  const sendTutorOffer = (kid: FamilyMember, subject: string, note: string) => {
    const detail = `${active.name.split(' ')[0]} can help ${kid.name.split(' ')[0]} with ${subject}${note ? ` — ${note}` : ''}`;
    // sendRequest already pushes its own notification — the chat message
    // is just a visible Family Chat record, same dedup fix as KidView's
    // sendCheckin/sendDriverLate (live-reported duplicate pushes for one tap).
    sendRequest({ type: 'tutor', fromMemberId: active.id, detail, urgency: 'normal' });
    sendMessage('all', active.id, `🎒 ${detail}`, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);
  };

  const reportVehicleIssue = (issue: string) => {
    const detail = `🚗 Vehicle issue reported by ${active.name.split(' ')[0]}: ${issue}`;
    sendRequest({ type: 'emergency', fromMemberId: active.id, detail, urgency: 'soon' });
    sendMessage('all', active.id, detail, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);
  };

  const requestCashOut = (amount: string, method: string) => {
    const coins = active.mainCoins ?? active.coins ?? 0;
    const detail = `💵 Cash-out request: $${amount} via ${method} (balance: ${coins} coins)`;
    sendRequest({ type: 'delegation', fromMemberId: active.id, detail, urgency: 'normal' });
    sendMessage('all', active.id, `${active.name.split(' ')[0]} requested cash-out: $${amount} via ${method}`, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);
    // Was Alert.alert — every other success path in this file (claim,
    // confirm, drop, tutor request) uses showToast; a full blocking modal
    // just for this one confirmation was inconsistent with itself.
    showToast('Cash-out sent — your parent will review it ✓');
  };

  // ── Tile sheets ───────────────────────────────────────────────────────────────
  const [openSheet, setOpenSheet] = useState<SheetKey>(null);
  const [askParentSheet, setAskParentSheet] = useState(false);
  const [askModal, setAskModal] = useState<null | 'permission' | 'question' | 'medication'>(null);
  // Scenario 1.5 already gives a Teen full self-creation rights via the
  // Quests tab's own +Quest button — this "Suggest a Chore" entry (shared
  // AskParentSheet, mainly built for Kids) still works for a Teen too
  // (asking a parent to set up something the Teen doesn't want full
  // ownership of), so it's wired the same way rather than hidden.
  const [questProposalModal, setQuestProposalModal] = useState(false);
  const [groceryModal, setGroceryModal] = useState(false);
  const [suppliesModal, setSuppliesModal] = useState(false);

  // ── Smart composer — same unrestricted SmartTaskComposer/full-form
  // handoff TasksScreen.tsx wires for Parent, no behavior change (Teen
  // already has full self-creation rights via canCreate elsewhere). Purely
  // additive alongside AskParentSheet's "ask a parent instead" tile above.
  // Visibility is the composerVisible prop (Hub-level FAB, see HubScreen.tsx).
  const [manualQuestPrefill, setManualQuestPrefill] = useState<{
    title?: string; coins?: number; assignedToId?: string; photoRequired?: boolean; dueDate?: string;
  } | undefined>(undefined);
  const [manualEventPrefill, setManualEventPrefill] = useState<{
    title?: string; category?: string; memberId?: string; startAt?: string; notes?: string;
  } | undefined>(undefined);
  const [showManualQuest, setShowManualQuest] = useState(false);
  const [showManualEvent, setShowManualEvent] = useState(false);

  return (
    <>
    <ScrollView showsVerticalScrollIndicator={false}>

      {/* Amber, not danger-red — this is a heads-up about the shared pickup
          pool ("someone should grab this"), not something already on this
          teen personally. KidRideBanner below (this teen's OWN confirmed
          ride) keeps its own styling as the "this concerns you directly"
          signal — the two previously used near-identical red/alarm styling
          despite meaning very different things, and could stack together
          at the top of the scroll with no visual hierarchy telling them
          apart. */}
      {urgentPickups.length > 0 && (
        <View style={pad}>
          <Pressable onPress={() => setOpenSheet('rides')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: isDark ? BRAND.amber + '15' : BRAND.amber + '18',
              borderWidth: 1.5, borderColor: BRAND.amber + '50',
              borderRadius: 16, padding: 12, marginBottom: 12 }}>
            <Bell size={18} color={BRAND.amber} />
            <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '800', color: isDark ? BRAND.amber : '#8A5A00' }}>
              {urgentPickups.length} pickup{urgentPickups.length > 1 ? 's' : ''} within the hour — needs a driver
            </Text>
          </Pressable>
        </View>
      )}

      <HubGreetingHeader
        firstName={active.name.split(' ')[0]}
        summary={
          todoQuests.length + reviewQuests.length + declinedQuests.length > 0
            ? `${todoQuests.length + reviewQuests.length + declinedQuests.length} chore${todoQuests.length + reviewQuests.length + declinedQuests.length !== 1 ? 's' : ''} to handle today${pendingCoins > 0 ? ` · +${pendingCoins} pending` : ''}`
            : pendingCoins > 0 ? `All caught up ✓ · +${pendingCoins} pending` : 'All caught up ✓'
        }
        balance={active.mainCoins ?? active.coins ?? 0}
        colors={colors} isDark={isDark}
      />

      {confirmedRide && rideCountdown !== null && rideCountdown > -30 && !dismissedRideIds.has(confirmedRide.id) && (
        <KidRideBanner
          ev={confirmedRide} rideCountdown={rideCountdown} colors={colors} isDark={isDark}
          active={active} members={members}
          onConfirmPickup={confirmPickup}
          onDismiss={(id) => setDismissedRideIds(prev => new Set([...prev, id]))}
          // Real Pick-up Radar signal, not just the clock — master-flow
          // audit finding, see KidRideBanner.tsx's driverDispatched doc.
          driverDispatched={!!activeTrips?.some(t =>
            t.driverMemberId === eventAssignee(confirmedRide).id
          )}
          conflictReason={conflictReasons.get(confirmedRide.id)}
        />
      )}

      {activeTrips?.map(trip => (
        <PickupRadarStatus key={trip.tripId} colors={colors} isDark={isDark} activeTrip={trip} />
      ))}

      <HubTimelineSection active={active} members={members} events={visibleEvents} updateEvent={updateEvent} colors={colors} isDark={isDark} />

      <FamilyGamesSection colors={colors} isDark={isDark} />

      {/* Needs You — chore-approval celebration + dismissible feed (approved
          chores, cheers, request replies). Rides already have their own
          banner above (KidRideBanner/PickupRadarStatus), so the ride-only
          props here are left empty rather than duplicating that feed. */}
      {dismissedLoaded && (
        <KidNeedsYouSection
          declinedRides={[]} pendingRides={[]}
          declinedQuests={[]} approvedQuests={approvedQuests}
          cheersForMe={cheersForMe} recentReplies={recentReplies}
          confirmedRide={undefined} rideCountdown={null}
          awaitingDriverRide={undefined}
          active={active} members={members} colors={colors} isDark={isDark}
          dismissedIds={dismissedIds} onDismiss={dismissItem}
          onConfirmPickup={() => {}} onSendDriverLate={() => {}}
          lateNudgeSent={{}}
        />
      )}

      <MyQuestsSection
        title="My Chores"
        todoQuests={todoQuests} inProgressQuests={inProgressQuests} reviewQuests={reviewQuests}
        poolQuests={poolQuests} cancelledToday={cancelledQuestsToday} declinedQuests={declinedQuests} allQuests={quests}
        active={active} members={members} colors={colors} isDark={isDark}
        onClaim={(id) => claimQuest(id, active.id, (reason) => {
          Alert.alert(
            reason === 'deleted' ? 'No longer available' : 'Someone beat you to it!',
            reason === 'deleted'
              ? 'This chore was just removed by a parent.'
              : 'Someone else already claimed this chore — check the pool for others.',
          );
        })}
        onStart={(id) => submitQuest(id, undefined, active.id)}
        onSubmit={handleSubmitTap}
        onAcceptGpQuest={(id) => startGrandparentQuest(id, active.id)}
        onDeclineGpQuest={(q) => {
          const chore = useChoreStore.getState().chores.find(c => c.id === q.id);
          if (chore) setDeclineQuest(chore);
        }}
      />

      {/* ── Tile grid — everything else opens in a bottom sheet ── */}
      <View style={{ paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <TeenTile
          label="Ask Parent" sublabel="Permission, question, meds"
          Icon={MessageCircle} accent={BRAND.purple}
          onPress={() => setAskParentSheet(true)} colors={colors} isDark={isDark}
        />
        <TeenTile
          label="Rides" sublabel={hasCar ? 'Sibling pickups' : 'Opt in with a car'}
          Icon={Car} accent={BRAND.amber}
          // A direct "you were asked to drive" assignment counts toward
          // the badge even with the car toggle off — that assignment was
          // already made regardless, same reasoning as
          // TeenCarDispatchSection no longer hiding it behind hasCar.
          badge={hasCar ? openPickupCount : myPendingAssignments.length}
          onPress={() => setOpenSheet('rides')} colors={colors} isDark={isDark}
        />
        <TeenTile
          label="Tutor a Sibling" sublabel="Offer homework help"
          Icon={BookOpen} accent={BRAND.purple} badge={myPendingOffers.length}
          onPress={() => setOpenSheet('tutor')} colors={colors} isDark={isDark}
        />
        <TeenTile
          label="Cash Out" sublabel="Request a payout"
          Icon={CreditCard} accent={BRAND.amber}
          onPress={() => setOpenSheet('cashout')} colors={colors} isDark={isDark}
        />
        <TeenTile
          label="My Requests" sublabel="History & status"
          Icon={ClipboardList} accent={BRAND.purple}
          onPress={() => setOpenSheet('history')} colors={colors} isDark={isDark}
        />
        {/* Conditional tile moved last — was positioned before "My
            Requests", so toggling "I Have a Car" reflowed every tile after
            it (row position shifted for the whole rest of the grid, not
            just this one slot). Placing the only conditionally-rendered
            tile at the end means its absence can only ever affect the
            final row. */}
        {hasCar && (
          <TeenTile
            label="Gas & Vehicle" sublabel="Log fill-ups, report issues"
            Icon={Fuel} accent={colors.success}
            onPress={() => setOpenSheet('gas')} colors={colors} isDark={isDark}
          />
        )}
      </View>

      {/* ── Sheets — static 75% height, no content-driven resize ── */}
      <TeenTileSheet visible={openSheet === 'rides'} onClose={() => setOpenSheet(null)}
        title="Rides" accentColor={BRAND.amber} colors={colors} isDark={isDark}>
        <TeenCarDispatchSection
          hasCar={hasCar} onToggleCar={toggleCar}
          openPickups={openPickupsVisible} myPickups={myPickups} myPendingAssignments={myPendingAssignments}
          onPass={(id) => {
            const ev = events.find(e => e.id === id) ?? openPickups.find(e => e.id === id);
            updateEvent(id, { teenPassedIds: [...new Set([...(ev?.teenPassedIds ?? []), active.id])] });
          }} onClaim={claimPickup} onDrop={dropPickup} onConfirmAssignment={confirmAssignment}
          rideEarnings={rideEarnings} members={members} colors={colors} isDark={isDark}
        />
      </TeenTileSheet>

      <TeenTileSheet visible={openSheet === 'gas'} onClose={() => setOpenSheet(null)}
        title="Gas & Vehicle Log" accentColor={colors.success} colors={colors} isDark={isDark}>
        <TeenGasLogSection activeId={active.id} today={today} onReportIssue={reportVehicleIssue} colors={colors} isDark={isDark} />
      </TeenTileSheet>

      <TeenTileSheet visible={openSheet === 'tutor'} onClose={() => setOpenSheet(null)}
        title="Tutor a Sibling" accentColor={BRAND.purple} colors={colors} isDark={isDark}>
        <TeenTutorSection
          siblings={siblings} pendingOffers={myPendingOffers}
          onSend={sendTutorOffer} onCancel={cancelRequest}
          colors={colors} isDark={isDark}
        />
      </TeenTileSheet>

      <TeenTileSheet visible={openSheet === 'cashout'} onClose={() => setOpenSheet(null)}
        title="Cash Out Earnings" accentColor={BRAND.amber} colors={colors} isDark={isDark}>
        <TeenCashOutSection balance={active.mainCoins ?? active.coins ?? 0} onRequest={requestCashOut} colors={colors} isDark={isDark} />
      </TeenTileSheet>

      <AskParentSheet
        visible={askParentSheet} onClose={() => setAskParentSheet(false)} colors={colors} isDark={isDark}
        onPick={(choice) => {
          setAskParentSheet(false);
          setTimeout(() => {
            if (choice === 'ride') setOpenSheet('rides');
            else if (choice === 'grocery') setGroceryModal(true);
            else if (choice === 'supplies') setSuppliesModal(true);
            // "Propose a Chore" (kid-only propose_kid_chore RPC — a Teen
            // already has full self-creation rights via the unrestricted
            // SmartTaskComposer/Quests tab, so there's nothing to "propose"
            // instead of just creating directly) folds into the same
            // "ask a parent to set something up" framing as Suggest a Chore.
            else if (choice === 'quest' || choice === 'chore') setQuestProposalModal(true);
            else setAskModal(choice);
          }, 300);
        }}
      />
      <QuestProposalModal visible={questProposalModal} onClose={() => setQuestProposalModal(false)} active={active} />

      <CantMakeItSheet
        target={declineQuest ? { kind: 'chore', item: declineQuest } : null}
        byMemberId={active.id} members={members}
        onClose={() => setDeclineQuest(null)}
      />
      <SubmitProofSheet
        quest={submitProofQuest} colors={colors} isDark={isDark}
        onClose={() => setSubmitProofQuest(null)}
        submitQuest={submitQuest}
      />
      <GroceryModal  visible={groceryModal}  onClose={() => setGroceryModal(false)}  active={active} />
      <SuppliesModal visible={suppliesModal} onClose={() => setSuppliesModal(false)} active={active} />
      {askModal && <AskModal visible={!!askModal} onClose={() => setAskModal(null)} type={askModal} active={active} />}
      <KidRequestHistoryModal visible={openSheet === 'history'} onClose={() => setOpenSheet(null)} active={active} />

      <View style={{ height: 32 }} />
    </ScrollView>

    <SmartTaskComposer
      visible={composerVisible}
      members={members}
      activeMemberId={active.id}
      familyId={familyId ?? ''}
      onClose={onCloseComposer}
      onCreated={onCloseComposer}
      onOpenFullForm={(kind, prefill) => {
        onCloseComposer();
        if (kind === 'quest') {
          setManualQuestPrefill(prefill as typeof manualQuestPrefill);
          setShowManualQuest(true);
        } else {
          setManualEventPrefill(prefill as typeof manualEventPrefill);
          setShowManualEvent(true);
        }
      }}
    />

    {showManualQuest && (
      <AddQuestModal
        visible={showManualQuest}
        onClose={() => { setShowManualQuest(false); setManualQuestPrefill(undefined); }}
        activeMemberId={active.id}
        prefill={manualQuestPrefill}
        initialStep={manualQuestPrefill ? 'review' : undefined}
      />
    )}

    {showManualEvent && (
      <AddEventModal
        visible={showManualEvent}
        onClose={() => { setShowManualEvent(false); setManualEventPrefill(undefined); }}
        activeMemberId={active.id}
        prefill={manualEventPrefill as any}
        // Same fix as TasksScreen.tsx/ParentView.tsx's own handoff — opening
        // blank at step 1 threw away everything Smart Tasker already
        // detected (live-reported as "submit opens a blank manual form").
        initialStep={manualEventPrefill ? 'review' : undefined}
      />
    )}
    </>
  );
}
