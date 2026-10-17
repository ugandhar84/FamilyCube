import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Alert, Animated, Easing } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ClipboardList, Fuel, BookOpen, CreditCard,
} from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { showToast } from '@/components/AppToast';
import { BRAND } from '@/components/FamilyCubeLogo';
import { useEventStore, isEventSensitive, canViewSensitiveEventDetail, eventAssignee } from '@/store/eventStore';
import type { TripPhase } from '@/store/tripStore';
import { dedupeRideSeries } from './lib/dedupeRideSeries';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore, type ChoreTask } from '@/store/choreStore';
import { useRewardStore } from '@/store/rewardStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import { useChatStore } from '@/store/chatStore';
import { useDismissedHubItemsStore } from '@/store/dismissedHubItemsStore';
import { withinLast24h } from '@/lib/dates';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';
import { localToday, hoursUntilEvent, useCountdown, isWorkEvent } from './hubUtils';
import { detectAssigneeConflicts, detectWorkConflicts } from './lib/detectAssigneeConflicts';
import { MedicationsCard } from './senior/MedicationsCard';
import { useMedications } from '@/features/vault/tabs/health/useMedications';
import { KidHeroCard } from './kid/KidHeroCard';
import { KidTodaySection } from './kid/KidTodaySection';
import { KidChoresNeedsYouCard } from './kid/KidChoresNeedsYouCard';
import { KidNeedsYouSection } from './kid/KidNeedsYouSection';
import { KidActionGrid, KidCheckinRow } from './kid/KidMoreRow';
import { KidSectionHeader } from './kid/KidSectionHeader';
import { RideStatusCard } from './kid/RideStatusCard';
import { RidesStatusCard } from './parent/RidesStatusCard';
import { CantMakeItSheet } from '../tasks/components/CantMakeItSheet';
import { TonightMealCard } from './parent/TonightMealCard';
import { KidRideBanner } from './kid/KidRideBanner';
import { PickupRadarStatus } from './hubComponents';
import { TeenTile } from './teen/TeenTile';
import { TeenCashOutBanner } from './teen/TeenCashOutBanner';
import { useUpcomingOpenEvents } from './useUpcomingOpenEvents';

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

// TeenView mirrors KidView's exact structure/section order [live-requested:
// "now lets pickup the teens hub and make exact same as the kids and with
// extraelement it has" — confirmed via follow-up to adopt KidHeroCard's
// gamification 100%, not just the layout shell]. Everything through the
// Quick Actions block (hero → today → chores-needs-you → needs-you →
// action grid/ride-status/check-ins/meds/dinner) is now identical to
// KidView. Teen's own extras — car dispatch/gas log/tutor/cash-out — are
// kept as an additional "Teen Extras" tile row + sheets appended after
// KidView's own Quick Actions section, since those have no Kid equivalent.
export function TeenView({ focusKey, active, members, colors, isDark, activeTrips, familyId, composerVisible, onCloseComposer, onMyChores, onOpenMyChoresTab, onPiggyBank, onAskParentTile, onAskForRide, onRideStatusOpen, onOpenTutor, onOpenCashOut, onOpenGasVehicle }: {
  focusKey?: number;
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  activeTrips?: { tripId: string; kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; driverMemberId?: string; etaMinutes: number; startedAtMs?: number; phase?: TripPhase }[];
  familyId?: string;
  // Not rendered directly here (same as KidView) — consumed by HubScreen's
  // own showAskParentHub composite, which already folds composerVisible in.
  composerVisible: boolean;
  onCloseComposer: () => void;
  onMyChores: () => void;
  onOpenMyChoresTab: (tab: 'todo' | 'review' | 'done' | 'bounty') => void;
  onPiggyBank: () => void;
  onAskParentTile: () => void;
  onAskForRide: () => void;
  onRideStatusOpen: () => void;
  // Tutor/Cash-Out now render as HubScreen-level FullPageOverlay screens
  // (via KidOverlays) instead of this component's own TeenTileSheet
  // ["touturing and cashout should be full page overlay with figma
  // /gemini rythem"] — these just flip that overlay's visibility state.
  onOpenTutor: () => void;
  onOpenCashOut: () => void;
  // Gas & Vehicle now opens as a full-page landing screen (fill-up/issue
  // history + forms) instead of the old TeenTileSheet bottom sheet
  // ["Gas and vehical lab laso should have the dedicated landing page
  // with all status /logs"] — same FullPageOverlay-via-KidOverlays
  // pattern as Tutor/Cash-Out.
  onOpenGasVehicle: () => void;
}) {
  const { quests, submitQuest, claimQuest } = useQuestStore();
  const { startGrandparentQuest } = useChoreStore();
  const { events, updateEvent } = useEventStore();
  const { rewards, redemptions } = useRewardStore();
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
  const familyIdForRides = familyId ?? (active as any).familyId as string | undefined;
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
  const todayStr = localToday();
  const { sendRequest, requests, loaded: kidRequestsLoaded, loadFromStorage: loadKidRequests } = useKidRequestStore();
  const sendMessage = useChatStore(s => s.sendMessage);
  const today = todayStr;
  // Same shared hook ParentView/SeniorView/KidView already use.
  const { meds, addMed, toggleMed, deleteMed } = useMedications(familyId ?? '', active.id);
  const medsTaken = Object.fromEntries(meds.map(m => [m.id, m.taken_date === today])) as Record<string, boolean>;

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
  // reinstall and syncs across a shared/second device).
  const { dismissedIds, loaded: dismissedLoaded, load: loadDismissedHubItems, dismissItem } = useDismissedHubItemsStore();
  useEffect(() => { loadDismissedHubItems(active.id); }, [active.id]);

  // ── My Chores (same normalized model KidView uses) ──────────────────────────
  const myQuests = quests.filter(q => (q.assignedToId === active.id || q.assignedToIds?.includes(active.id) || q.pendingHandoffTo === active.id) && !q.awaitingParentApproval);
  // inviteGrandparents-flagged chores stay GP-pool-only even while
  // isPool/todo (e.g. after a GP backs out) — excluded here too. Teens DO
  // see isOpenToTeens pool chores, unlike KidView's own poolQuests filter.
  const poolQuests = quests.filter(q => q.isPool && q.status === 'todo' && !q.isAdultTask && !q.awaitingParentApproval && !q.inviteGrandparents);
  const bountyQuests = poolQuests.filter(q => q.questType === 'bounty');
  const todoQuests = myQuests.filter(q => (q.status === 'todo' || q.status === 'declined') && !q.isPool);
  const inProgressQuests = myQuests.filter(q => ['claimed', 'in_progress'].includes(q.status));
  const reviewQuests = myQuests.filter(q => q.status === 'pending_approval');
  const declinedQuests = myQuests.filter(q => q.status === 'declined');
  const approvedQuests = myQuests.filter(q => ['approved', 'done'].includes(q.status));
  const cancelledQuestsToday = myQuests.filter(q => q.status === 'cancelled' && (q.cancelledAt ?? '').startsWith(today));
  const doneToday = myQuests.filter(q => ['approved', 'done'].includes(q.status)).length;
  const overdueQuestsStart = new Date(); overdueQuestsStart.setHours(0, 0, 0, 0);
  const overdueQuests = myQuests.filter(q => {
    const dueMs = q.dueDate ? new Date(q.dueDate).getTime() : null;
    return !!dueMs && dueMs < overdueQuestsStart.getTime() && !['approved', 'done'].includes(q.status) && q.status !== 'declined';
  });
  const [declineQuest, setDeclineQuest] = useState<ChoreTask | null>(null);

  // Rewards quick-action tile's own stacked counters — same shape as KidView.
  const myRedemptions = redemptions.filter(r => r.memberId === active.id);
  const pendingRedemptions = myRedemptions.filter(r => r.status === 'pending');
  const approvedRedemptionsToday = myRedemptions.filter(r => r.status === 'approved' && r.respondedAt && withinLast24h(r.respondedAt));

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

  // ── Identity/progress — same gamification KidView's hero uses, now
  // adopted 1:1 for Teen per explicit confirmation ("Adapt 100%").
  const mainCoins = (active as any).mainCoins ?? (active as any).coins ?? 0;
  const gpCoins = (active as any).gpCoins ?? 0;
  const streak = (active as any).streak ?? 0;
  const xp = (active as any).xp ?? 0;
  const level = (() => {
    let n = 1;
    while (xp >= 100 * n * (n + 1) / 2) n++;
    return n;
  })();
  const questGoal = Math.max(myQuests.filter(q => (q.status as string) !== 'pending_parent_approval').length, 3);
  const questPct = Math.min(doneToday / questGoal, 1);

  // Photo-required submits are handled entirely inline inside
  // KidQuestDetailScreen/KidQuestCard's own onOpenDetail routing now, same
  // as KidView.tsx — no Modal sheet. This only ever reaches a non-photo
  // submit.
  const handleSubmitTap = (q: Quest) => submitQuest(q.id, undefined, active.id);

  // ── Car — Gas & Vehicle log gate only now; Sibling Pickups dispatch
  // (TeenCarDispatchSection, claim/drop/confirm) was removed entirely
  // ["sibling rids we can remove right??"] — toggled from Profile now,
  // not a Hub quick-action.
  const hasCar = active.hasCar ?? false;

  const [myPendingAssignmentsRaw] = [
    upcomingEvents.filter(e => {
      const a = eventAssignee(e);
      const isMine = a.id ? a.id === active.id : a.name === active.name;
      return isMine && a.status === 'pending' && !e.approvalPending && e.date >= today;
    }),
  ];
  const [myPendingAssignments] = dedupeRideSeries(myPendingAssignmentsRaw);

  // Confirmed ride where THIS teen is being picked up (the ride's subject/
  // rider), not driving it — same pattern KidView uses for confirmedRide.
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
  const nextEvent = visibleEvents.filter(e => (e.memberId === active.id || e.memberIds?.includes(active.id) || !e.memberId) && e.category !== 'Work' && e.date === today)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
    .find(e => hoursUntilEvent(e.date, e.time) > 0 && eventAssignee(e).status !== 'rejected');
  const nextCountdown = useCountdown(nextEvent?.date, nextEvent?.time);

  // Either side (rider or driver) can confirm a pickup actually happened —
  // mirrors KidView's confirmPickup exactly, scoped to this teen as rider.
  const confirmPickup = (ev: typeof events[0]) => {
    if (ev.pickupConfirmedAt) return;
    updateEvent(ev.id, { pickupConfirmedAt: new Date().toISOString(), pickupConfirmedBy: active.id });
    sendMessage('all', active.id, `✅ ${active.name.split(' ')[0]} confirmed pickup for "${ev.title}" — all good!`);
  };

  const sendDriverLate = (ev: typeof events[0]) => {
    const role = rideRoleFor(ev, active.name);
    sendRequest({ type: 'emergency', fromMemberId: active.id, urgency: 'urgent',
      detail: `⚠️ ${active.name.split(' ')[0]}'s ride for "${ev.title}" hasn't arrived yet! Can someone check?`,
      location: ev.pickupLocation ?? ev.location,
      scheduledTime: ev.time,
    });
    sendMessage('all', active.id, `⚠️ ${active.name.split(' ')[0]}'s ride for "${ev.title}" hasn't arrived yet! Can someone check?`, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);
    showToast('⚠️ Alert sent!');
  };

  // ── Tutoring / sibling help ───────────────────────────────────────────────────
  // Offer-sending/cash-out itself now lives in HubScreen.tsx (duplicated,
  // same store calls) so KidOverlays can own the Tutor/Cash-Out
  // FullPageOverlay screens outside this view's ScrollView-nested
  // fragment — only the pending-offer badge count is still needed here.
  const myPendingOffers = requests.filter(r =>
    r.fromMemberId === active.id && r.status === 'pending' && (r.type === 'tutor' || r.type === 'cheer')
  );

  // ── Cash Out — banner card data (pending count + last status) ─────────────
  const myCashOuts = requests
    .filter(r => r.fromMemberId === active.id && r.type === 'delegation')
    .sort((a, b) => (b.requestedAt ?? '').localeCompare(a.requestedAt ?? ''));
  const myPendingCashOuts = myCashOuts.filter(r => r.status === 'pending');
  const lastCashOut = myCashOuts[0];
  const lastCashOutStatusLabel = lastCashOut
    ? lastCashOut.status === 'pending' ? 'Pending'
      : lastCashOut.status === 'approved' || lastCashOut.status === 'completed' ? 'Settled'
      : lastCashOut.status === 'declined' || lastCashOut.status === 'cancelled' || lastCashOut.status === 'expired' ? 'Rejected'
      : undefined
    : undefined;

  // Same staggered-entrance pattern as KidView/ParentView — one Animated.Value
  // pair per top-level section below (Hero / Today / ChoresNeedsYou / NeedsYou
  // / Quick Actions), driven by focusKey (0 = subpage pop, show immediately).
  const CARD_COUNT = 7;
  // Start barely-faded, not fully invisible — see KidView.tsx for full
  // rationale: if the mount-triggered Animated.start() below ever gets
  // dropped/raced, worst case is a slightly faded card, never a fully
  // blank screen. The real fade+slide-up bounce still plays normally.
  const opacities = useRef(Array.from({ length: CARD_COUNT }, () => new Animated.Value(0.4))).current;
  const translateYs = useRef(Array.from({ length: CARD_COUNT }, () => new Animated.Value(8))).current;
  const cardAnims = opacities.map((opacity, i) => ({ opacity, translateY: translateYs[i] }));

  const hasAnimatedIn = useRef(false);
  useEffect(() => {
    if (focusKey === 0 && hasAnimatedIn.current) return;
    hasAnimatedIn.current = true;
    opacities.forEach(v => v.setValue(0.4));
    translateYs.forEach(v => v.setValue(8));
    const anims = opacities.map((op, i) =>
      Animated.parallel([
        Animated.timing(op, { toValue: 1, duration: 280, delay: 60 + i * 55, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(translateYs[i], { toValue: 0, duration: 300, delay: 60 + i * 55, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ])
    );
    Animated.parallel(anims).start();
    const failSafe = setTimeout(() => {
      opacities.forEach(v => v.setValue(1));
      translateYs.forEach(v => v.setValue(0));
    }, 900);
    return () => clearTimeout(failSafe);
  }, [focusKey]);

  return (
    <>
      {/* 1. Hero — identity/progress at a glance, plus the single most
          time-sensitive fact (confirmed ride or next event countdown) —
          same KidHeroCard component KidView uses, 1:1. */}
      <Animated.View style={{ opacity: cardAnims[0].opacity, transform: [{ translateY: cardAnims[0].translateY }] }}>
        <KidHeroCard
          active={active} colors={colors} isDark={isDark}
          mainCoins={mainCoins} gpCoins={gpCoins} streak={streak} level={level}
          doneToday={doneToday} questGoal={questGoal} questPct={questPct}
          confirmedRide={confirmedRide} rideCountdown={rideCountdown} members={members}
          nextEvent={nextEvent} nextCountdown={nextCountdown}
        />
      </Animated.View>

      {confirmedRide && rideCountdown !== null && rideCountdown > -30 && !dismissedRideIds.has(confirmedRide.id) && (
        <KidRideBanner
          ev={confirmedRide} rideCountdown={rideCountdown} colors={colors} isDark={isDark}
          active={active} members={members}
          onConfirmPickup={confirmPickup}
          onDismiss={(id) => setDismissedRideIds(prev => new Set([...prev, id]))}
          driverDispatched={!!activeTrips?.some(t =>
            t.driverMemberId === eventAssignee(confirmedRide).id
          )}
          conflictReason={conflictReasons.get(confirmedRide.id)}
        />
      )}

      {activeTrips?.map(trip => (
        <PickupRadarStatus key={trip.tripId} colors={colors} isDark={isDark} activeTrip={trip} />
      ))}

      {/* 2. Today — timeline strip, same KidTodaySection KidView uses. */}
      <Animated.View style={{ opacity: cardAnims[1].opacity, transform: [{ translateY: cardAnims[1].translateY }] }}>
        <KidTodaySection
          active={active} members={members} events={visibleEvents} updateEvent={updateEvent}
          colors={colors} isDark={isDark}
        />
      </Animated.View>

      {/* 3. Chores Needs You — single most-urgent chore card, same compact
          rhythm KidView uses instead of an always-expanded quest list. */}
      <Animated.View style={{ opacity: cardAnims[2].opacity, transform: [{ translateY: cardAnims[2].translateY }] }}>
        <KidChoresNeedsYouCard
          colors={colors} isDark={isDark}
          todoQuests={todoQuests} reviewQuests={reviewQuests} bountyQuests={bountyQuests}
          onOpenTab={onOpenMyChoresTab}
        />
      </Animated.View>

      {/* 4. Needs You — merged alerts/ride-status/replies list, same
          component KidView uses. */}
      {dismissedLoaded && (
        <Animated.View style={{ opacity: cardAnims[3].opacity, transform: [{ translateY: cardAnims[3].translateY }] }}>
          <KidNeedsYouSection
            declinedRides={[]} pendingRides={[]}
            declinedQuests={declinedQuests} approvedQuests={approvedQuests}
            cheersForMe={cheersForMe} recentReplies={recentReplies}
            confirmedRide={undefined} rideCountdown={null}
            awaitingDriverRide={undefined}
            active={active} members={members} colors={colors} isDark={isDark}
            dismissedIds={dismissedIds} onDismiss={dismissItem}
            onConfirmPickup={() => {}} onSendDriverLate={() => {}}
            lateNudgeSent={{}}
          />
        </Animated.View>
      )}

      {/* 5. Quick Actions — same merged grid KidView uses, then medication,
          then the dinner preview card. */}
      <Animated.View style={{ opacity: cardAnims[4].opacity, transform: [{ translateY: cardAnims[4].translateY }] }}>
        <KidActionGrid
          onMyChores={onMyChores}
          onAskParent={onAskParentTile}
          onPiggyBank={onPiggyBank}
          choreStats={[
            { label: 'To do',    value: todoQuests.length,    color: colors.amber },
            { label: 'Review',   value: reviewQuests.length,  color: colors.danger },
            { label: 'Approved', value: doneToday,            color: colors.teal },
            { label: 'Overdue',  value: overdueQuests.length, color: colors.danger },
          ]}
          rewardStats={pendingRedemptions.length > 0 || approvedRedemptionsToday.length > 0 ? [
            { label: 'Pending',        value: pendingRedemptions.length,       color: colors.amber },
            { label: 'Approved today', value: approvedRedemptionsToday.length, color: colors.teal },
          ].filter(s => s.value > 0) : undefined}
          colors={colors} isDark={isDark}
        />
      </Animated.View>

      <Animated.View style={{ opacity: cardAnims[5].opacity, transform: [{ translateY: cardAnims[5].translateY }] }}>
        {/* A car-having teen behaves like a parent for driving purposes —
            same RidesStatusCard tracker UI Parent's own Hub uses (progress
            bar, phase stages, opens RidesControlRoomScreen) — but scoped to
            ONLY the rides THIS teen themselves asked for, never the whole
            family's queue [live direction: "teens are parents / kids if
            they have car they behve the parent like but they can only get
            the requests they asked for and when no car then pure kids"].
            A teen with no car keeps the existing simpler rider-only tile. */}
        {hasCar ? (() => {
          const myDispatchedTrip = confirmedRide
            ? activeTrips?.find(t => t.driverMemberId === eventAssignee(confirmedRide).id)
            : undefined;
          const label = myDispatchedTrip
            ? `${myDispatchedTrip.driverName} driving you`
            : confirmedRide?.title;
          return (
            <RidesStatusCard
              colors={colors} isDark={isDark}
              pendingCount={Math.max(0, myPendingAssignments.length - (myDispatchedTrip ? 0 : confirmedRide ? 1 : 0))}
              withoutDriverCount={myPendingAssignments.length}
              ongoingCount={myDispatchedTrip ? 1 : 0}
              activeTripLabel={label}
              activePhase={myDispatchedTrip?.phase}
              onPress={onRideStatusOpen}
            />
          );
        })() : (
          <RideStatusCard
            colors={colors} isDark={isDark}
            pendingCount={myPendingAssignments.length}
            confirmedLabel={confirmedRide ? `Confirmed · ${confirmedRide.title}` : undefined}
            confirmedRideDate={confirmedRide?.date}
            confirmedRideTime={confirmedRide?.time}
            driverName={confirmedRide ? eventAssignee(confirmedRide).name : undefined}
            onPress={confirmedRide || myPendingAssignments.length > 0 ? onRideStatusOpen : onAskForRide}
          />
        )}
        <KidCheckinRow onCheckin={(type) => {
          const messages: Record<string, { detail: string; chatMsg: string; emoji: string }> = {
            home:  { detail: "I'm home! 🏠", chatMsg: `${active.name.split(' ')[0]} is home! 🏠`, emoji: "🏠 I'm home!" },
            ready: { detail: "I'm ready for pickup! 🎒", chatMsg: `${active.name.split(' ')[0]} is ready for pickup! 🎒`, emoji: "🎒 I'm ready!" },
            late:  { detail: `Running a bit late 🏃${nextEvent ? ` for ${nextEvent.title}` : ''}`,
                     chatMsg: `${active.name.split(' ')[0]} is running late 🏃${nextEvent ? ` for ${nextEvent.title}` : ''}`, emoji: '🏃 Running late!' },
          };
          const m = messages[type];
          sendRequest({ type: 'checkin', fromMemberId: active.id, detail: m.detail, urgency: type === 'late' ? 'soon' : 'normal' });
          sendMessage('all', active.id, m.chatMsg, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);
          Alert.alert(m.emoji, 'Family has been notified!');
        }} colors={colors} isDark={isDark} />

        {meds.length > 0 && (
          <View style={{ marginTop: 14, marginBottom: 14 }}>
            <MedicationsCard meds={meds} medsTaken={medsTaken} toggleMed={toggleMed} onAddMed={addMed} onRemoveMed={deleteMed} colors={colors} isDark={isDark} active={active} allMembers={members} />
          </View>
        )}
      </Animated.View>

      <Animated.View style={{ opacity: cardAnims[6].opacity, transform: [{ translateY: cardAnims[6].translateY }] }}>
        {/* TonightMealCard hardcodes marginHorizontal: 20 (Parent Hub's own
            card inset) and marginBottom: 20 (Parent's trailing-scroll
            padding, since it's Parent Hub's LAST section) — Kid/Teen Hub
            uses 16 everywhere else and TonightMealCard isn't the last
            section here, so this wrapper cancels both: -4 horizontal to
            match the 16px rhythm, -6 bottom to bring the 20px baked-in
            trailing margin down to the standard 14px gap used everywhere
            else in this chain ["still lill off compared to other"]. */}
        <View style={{ marginHorizontal: -4, marginBottom: -6 }}>
          <TonightMealCard colors={colors} isDark={isDark} familyId={familyId} members={members} />
        </View>
      </Animated.View>

      {/* ── Teen Extras — car dispatch/tutor/cash-out/gas log, Teen-only
          tiles with no Kid equivalent. Uses the same KidSectionHeader
          eyebrow (accent bar + uppercase caption) as every other Kid/Teen
          Hub section instead of a plain Text label ["Teen Extras should be
          same as other section Font dtyles and eybrow styles"]. ── */}
      <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
        <KidSectionHeader label="TEEN EXTRAS" accent={colors.amber} colors={colors} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <TeenTile
            label="Tutor a Sibling" sublabel="Offer homework help"
            Icon={BookOpen} accent={BRAND.purple} badge={myPendingOffers.length}
            onPress={onOpenTutor} colors={colors} isDark={isDark}
          />
          {hasCar && (
            <TeenTile
              label="Gas & Vehicle" sublabel="Log fill-ups, report issues"
              Icon={Fuel} accent={colors.success}
              onPress={onOpenGasVehicle} colors={colors} isDark={isDark}
            />
          )}
        </View>
      </View>

      {/* Cash Out — full-width banner card (pending count + last status),
          tapping it opens the full-page Cash Out form/history
          ["Cashout can be a full widdth banner card with theit pending
          cashouts and last cashout status"]. */}
      <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
        <TeenCashOutBanner
          pendingCount={myPendingCashOuts.length}
          lastStatusLabel={lastCashOutStatusLabel}
          onPress={onOpenCashOut} colors={colors} isDark={isDark}
        />
      </View>

      <CantMakeItSheet
        target={declineQuest ? { kind: 'chore', item: declineQuest } : null}
        byMemberId={active.id} members={members}
        onClose={() => setDeclineQuest(null)}
      />
      {/* My Chores / Piggy Bank / Ask Parent / Rides Control Room now render
          via KidOverlays + HubScreen's own top-level overlays, same as
          KidView — see onMyChores/onPiggyBank/onAskParentTile/
          onAskForRide/onRideStatusOpen props. */}
    </>
  );
}
