import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuestStore } from '@/store/choreAdapter';
import { useEventStore, eventAssignee } from '@/store/eventStore';
import { localDateStr, todayLocal } from '@/lib/dates';
import { AddQuestModal } from '@/features/quests/QuestsScreen';
import { AddEventModal } from '@/features/calendar/EventFormModal';
import SmartTaskComposer from '@/features/tasks/components/SmartTaskComposer';
import { MedicationsCard } from './senior/MedicationsCard';
import { useMedications } from '@/features/vault/tabs/health/useMedications';
import { today as medsToday } from '@/features/vault/tabs/health/types';
import type { FamilyMember } from '@/store/familyStore';
import { AlertBanner, PickupRadarStatus } from './hubComponents';
import { localToday, hoursUntilEvent } from './hubUtils';
import { dedupeRideSeries } from './lib/dedupeRideSeries';
import { TodayView, GreetingHeader } from './TodayView';
import type { ChoreTask } from '@/store/choreStore';

import { ParentQuickActions } from './parent/ParentQuickActions';
import { FamilyGamesSection } from '@/features/games/FamilyGamesSection';
import { HomeownerNotesSection } from './parent/HomeownerNotesSection';
import { SchoolTodaySection } from './parent/SchoolTodaySection';
import { TemporaryApproverCard } from './parent/TemporaryApproverCard';
import { EnRouteBanner } from './parent/EnRouteBanner';
import { ActionNeededSection } from './parent/ActionNeededSection';
import { GpCanHelpSection } from './parent/GpCanHelpSection';
import { HouseholdBacklogSection } from './parent/HouseholdBacklogSection';
import { ChoreReviewSection } from './parent/ChoreReviewSection';
import { PushbackSheet } from './parent/PushbackSheet';
import { DelegateSheet } from './parent/DelegateSheet';
import { TrialNagBanner } from './parent/TrialNagBanner';
import { useSubscriptionStore } from '@/store/subscriptionStore';

import { useParentStores } from './parent/hooks/useParentStores';
import { useParentEventClassification } from './parent/hooks/useParentEventClassification';
import { useParentModals } from './parent/hooks/useParentModals';

export function ParentView({ active, members, colors, isDark, onScanFlyer, onDispatchDirect, onPickupDone, onCancelTrip, activeTrip, otherActiveTrips, onUpdateEta }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onScanFlyer: () => void;
  // Dispatches immediately, no modal — memberId is nextRide's kid when one
  // is linked, else undefined for a generic "family" broadcast. Matches the
  // mock's plain in-card toggle exactly (no picker ever). eventId links the
  // resulting trip to the specific calendar event being driven, when one is
  // known — closes a real gap where reassigning a DIFFERENT event's driver
  // could otherwise silently complete this trip too (see reassign_event's
  // event-scoped trip completion, this session).
  onDispatchDirect: (memberId: string | undefined, etaMinutes: number, eventId?: string) => void;
  onPickupDone: (tripId: string) => void;
  onCancelTrip: (tripId: string) => void;
  activeTrip?: { tripId: string; kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; driverMemberId?: string; etaMinutes: number; startedAtMs?: number } | null;
  // Every OTHER concurrently-active trip besides `activeTrip` (e.g. a
  // different parent's own trip, running at the same time as this parent's)
  // — rendered read-only below `activeTrip`'s own card so a trip started by
  // someone else is never invisible just because this parent's Hub is
  // showing their own dispatch UI in the primary slot.
  otherActiveTrips?: { tripId: string; kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; driverMemberId?: string; etaMinutes: number; startedAtMs?: number }[];
  onUpdateEta?: (tripId: string, etaMinutes: number) => void;
}) {
  const { quests, approveQuest, declineQuest, updateQuest } = useQuestStore();
  const { events, updateEvent, addEvent, updateEventScoped }  = useEventStore();
  // Days 8-14 of the gating timeline (docs/paywall_setup_and_implementation.md):
  // trial ended, not subscribed yet — a dismissible nag, not a lock.
  // trialDaysLeft === -1 means "family data hasn't loaded yet" (computeTrial's
  // own not-yet-known state, distinct from trialDaysLeft: 0 = genuinely
  // expired) — excluding it here stops a brand-new family from flashing the
  // "trial ended" nag for the instant before their real family id loads.
  const { tier, isTrial, trialDaysLeft, loading: subLoading } = useSubscriptionStore();
  const showTrialNag = !subLoading && tier === 'free' && !isTrial && trialDaysLeft !== -1;

  const {
    groceryItems, addGroceryItem,
    kidRequests, approveRequest, declineRequest, approveItems, rejectItems, toggleGPWelcome,
    activeApproverGrants,
    grantTemporaryApprover, revokeTemporaryApprover,
    parentAssignments, addParentQuest,
    respondToParentQuest, completeParentQuest, cancelLockedAssignment, recallParentQuest, appreciationPing, getParentQuestPool,
    getPendingCashOuts, chores, addChore,
    approveGrandparentQuestAsParent, declineGrandparentQuestAsParent, grandparentApproveAndCheer,
    approveTeenReward, adjustTeenReward, declineTeenReward,
    acceptGPOffer, declineGPOffer,
    approveKidProposedChore, declineKidProposedChore,
    resolveRedoDispute,
    flagApprovalForDiscussion, standByApproval, requestApprovalReversal, coSignReversal,
    acknowledgeRecentApproval,
    getMyDirectPending, getMyLockedItems, getMyOutgoingPending, getActiveAssignmentChoreIds,
    pendingReviews,
  } = useParentStores(active);

  const {
    showAddTask, setShowAddTask,
    showAddEvent, setShowAddEvent,
    showTaskComposer, setShowTaskComposer,
    addPrefill, setAddPrefill,
    pushbackSheet, setPushbackSheet,
    delegateSheet, setDelegateSheet,
  } = useParentModals();

  const allNames  = members.map(m => m.name);
  const today     = localToday();

  const {
    todayEvents,
    pendingRequests, pendingRideRequiredEvents,
    conflictReasons,
    otherParentsWorkToday,
    conflictEvents,
    neverDispatchedOverdue,
    showBanner,
    pendingKidRequests,
    approvedRideRequests,
    actionCount,
    myPending, coParentPending,
  } = useParentEventClassification(active, members, events, activeTrip, otherActiveTrips, kidRequests);

  const familyId = (active as any).familyId ?? 'family-1';

  // Parent's own medication tracking — same real dosage/frequency/schedule
  // form and shared useMedications hook Grandparent's Hub and the Health
  // tab use (single source of truth across all three). Parent's Hub
  // previously had no medication card at all.
  const { meds: parentMeds, addMed: addParentMed, toggleMed: toggleParentMed, deleteMed: deleteParentMed } = useMedications(familyId, active.id);
  const parentMedsTaken = Object.fromEntries(
    parentMeds.map(m => [m.id, m.taken_date === medsToday()])
  ) as Record<string, boolean>;

  // Scenario 1.4 — approving a kid's quest_proposal request must create a
  // real, live pool quest (not just flip the request's own status the way
  // every other kid_request approve action does). Mirrors addChore's
  // ordinary pool-quest defaults (no assignee = open pool, claimable by any
  // kid/teen), and notifies the requesting kid via chat the same way
  // approveTeenReward/declineGrandparentQuest already centralize their
  // outcome notifications.
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
      // A proposal approved WITH the call-reminder toggle carries its own
      // parent-picked due date/time (schedule). One approved plainly (no
      // toggle) previously got no due date at all — it showed on backlog/
      // Quests cards with no due-date label (just the "Tonight" generic
      // fallback) even though it's meant to be done same-day, and every
      // other quest-creation form (AddQuestModal, etc.) always sets one.
      // Default to end of today so it at least shows and sorts as a normal
      // dated chore; the parent's own schedule picker still wins outright
      // whenever they set one explicitly.
      dueDate: schedule?.dueDate ?? todayLocal(),
      ...(schedule ? { dueTime: schedule.dueTime, alertCall: schedule.alertCall, alertCallLeadMinutes: schedule.alertCallLeadMinutes } : {}),
    });
    approveRequest(req.id, active.id, `Approved as a ${finalCoins}-coin chore!`);
    try {
      const { useChatStore } = require('@/store/chatStore');
      useChatStore.getState().sendMessage(req.fromMemberId, active.id,
        `✅ Your chore idea "${req.detail}" was approved for ${finalCoins} coins — go ahead!`);
    } catch (e) {
      console.warn('[ParentView] approveQuestProposal notification failed', e);
    }
  };

  const declineQuestProposalHandler = (req: any, reason?: string) => {
    declineRequest(req.id, active.id, reason);
    try {
      const { useChatStore } = require('@/store/chatStore');
      useChatStore.getState().sendMessage(req.fromMemberId, active.id,
        `Your chore idea "${req.detail}" wasn't approved this time${reason ? ` — "${reason}"` : ''}.`);
    } catch (e) {
      console.warn('[ParentView] declineQuestProposal notification failed', e);
    }
  };

  const approveItemsAndSync = async (reqId: string, itemIds: string[], isSuppliesReq: boolean) => {
    const req = kidRequests.find(r => r.id === reqId);
    if (!req) return;
    approveItems(reqId, itemIds, active.id);
    if (req.items) {
      const approved = req.items.filter(it => itemIds.includes(it.id));
      for (const item of approved) {
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

  // Parent Quest pool (PULL mode backlog) + direct assignments pending response
  // Merges chore-based parent_only_quest pool AND questStore isAdultTask quests
  const chorePool        = getParentQuestPool();
  const adultMemberIds   = new Set(members.filter(m => m.role === 'parent' || m.role === 'senior').map(m => m.id));
  const doneStatuses     = new Set(['done', 'approved', 'archived', 'cancelled', 'completed']);

  // Adult quests: parent_only_quest type OR directly assigned to a parent/senior
  // Rides/pickups are FamilyEvents, not Quests — a Quest can never actually
  // have category 'Ride' (not a valid QuestCategory value), so that dead
  // exclusion check is removed; ride tasks were never reachable here to
  // begin with, they live on the calendar, not the Household Backlog.
  const adultQuests = quests.filter(q => {
    if (doneStatuses.has(q.status)) return false;
    if (q.isAdultTask) return true;                                          // category_type === 'parent_only_quest' or shopping
    if (q.assignedToId != null && adultMemberIds.has(q.assignedToId)) return true;  // directly assigned to adult (parent/GP)
    return false;
  });
  // A chore/quest can carry a stale System-B assignedToId while a NEWER
  // System-A delegation (parent_quest_assignments row) is actually live and
  // pending on someone else — DelegateSheet's reassign flow creates a fresh
  // PENDING System-A row without ever touching the old assignedToId (see
  // its onPress handler, which calls addParentQuest, not updateChore/
  // updateQuest, for any non-quest-row chore). Without this exclusion, the
  // PREVIOUS assignee kept showing up in othersAdultQuests/myAdultQuests
  // with Nudge/Reclaim actions — even after they'd already reassigned it
  // away and the new assignee had a live, unanswered Accept/Decline card
  // waiting for them via System A. getActiveAssignmentChoreIds() (below)
  // is the same "has a live System-A row" check the pool below already
  // uses to avoid double-listing a chore; applying it here too makes
  // System A the single source of truth once a delegation is actually in
  // flight, instead of the two systems disagreeing about who a chore is
  // "really" assigned to.
  const activeAssignmentChoreIds = getActiveAssignmentChoreIds();
  const adultQuestsNoLiveAssignment = adultQuests.filter(q => !activeAssignmentChoreIds.has(q.id));

  // Split adult quests: mine (assigned to me), others' (assigned to someone else), unassigned (pool)
  const myAdultQuests       = adultQuestsNoLiveAssignment.filter(q => q.assignedToId === active.id);
  const othersAdultQuests   = adultQuestsNoLiveAssignment.filter(q => q.assignedToId && q.assignedToId !== active.id);
  // Live-reported dead-end bug: a chore whose assignedToId got cleared for
  // delegation (choreStore.ts's addParentQuest, clearStaleAssignedToId)
  // used to keep isPool at whatever it was before — false for a chore
  // that was directly assigned at creation — leaving assignedToId===null
  // but isPool===false once the fresh delegation's own
  // parent_quest_assignments row resolved to a terminal status (that fix
  // now forces isPool:true there too, but this filter shouldn't ALSO rely
  // solely on assignedToId being the single source of truth for "is this
  // really poolable" — claim_pool_quest's own server-side check requires
  // is_pool=true, so a card that can render but never successfully claim
  // is exactly the "Someone else already took that" dead end this
  // matches against directly instead of re-deriving it from assignedToId
  // alone).
  const unassignedAdultQ    = adultQuestsNoLiveAssignment.filter(q => !q.assignedToId && (q as any).isPool !== false);

  const choreIds         = new Set(chorePool.map(c => c.id));
  // Pool = unassigned adult quests + chore-based pool (no duplicates)
  const questPool        = [
    ...chorePool.filter(c => !activeAssignmentChoreIds.has(c.id)),
    ...unassignedAdultQ.filter(q => !choreIds.has(q.id) && !activeAssignmentChoreIds.has(q.id)).map(q => ({
      id: q.id, title: q.title, description: q.description, dueDate: q.dueDate,
      categoryType: 'parent_only_quest' as const, category: q.category,
      basePoints: q.coins, coinsReward: q.coins, xpReward: 0, status: 'todo' as const,
      assignedToId: undefined, isPrivateParent: true, requiresPhotoProof: false,
      redoCount: 0, recurrenceRule: { frequency: 'once' as const },
      createdAt: (q as any).createdAt ?? new Date().toISOString(), _isQuestRow: true,
      shoppingItems: (q as any).shoppingItems, shoppingStore: (q as any).shoppingStore, shoppingBudget: (q as any).shoppingBudget,
    })),
  ];

  // IDs already rendered in System B (direct assignedToId) — exclude from System A (parentAssignments)
  const systemBIds = new Set([...myAdultQuests, ...othersAdultQuests].map(q => q.id));

  // Shared with QuestsScreen.tsx via choreStore selectors rather than each
  // screen re-deriving this filtering independently — a change to the
  // snooze-expiry or bounce rules now only has to happen in one place.
  const myDirectPending   = getMyDirectPending(active.id);
  const myLockedItems     = getMyLockedItems(active.id);
  // getMyAccepted/AcceptedQuestCard removed — respondToParentQuest's ACCEPT
  // branch always syncs chore_tasks.assigned_to_id in the same action that
  // sets the assignment's status to ACCEPTED, so the "accepted but
  // assignedToId still unset" state getMyAccepted filtered for can never
  // actually occur; it was permanently dead code. MyAdultQuestCard
  // (System B, rendered via myAdultQuests below) is the real, reachable
  // card for an accepted delegation — confirmed via live QA to render
  // with the correct Done/Reassign/Nudge-back actions.
  const myOutgoingPending = getMyOutgoingPending(active.id);
  // Calendar events where this parent is the assigned helper/driver — show
  // in Household Backlog. Backlog is for things still needing action: once
  // confirmed, it's a settled commitment (visible in Schedule instead), not
  // something to pull off a backlog. Sourced from classifyEventUrgency
  // above (myPending) — see that file for the exact rule.
  // Live-reported: a recurring ride ("Drop Jaswi for her dance class")
  // showed EVERY future occurrence as its own pending card in the
  // Household Backlog's "You're the driver / helper" section — Sep 9, 16,
  // 23, 30, Oct 7, all stacked at once — instead of just the soonest one.
  // dedupeRideSeries (only the soonest occurrence per seriesId survives)
  // was already applied to pendingRequests/pendingRideRequiredEvents
  // above for ActionNeededSection's own cards and this file's actionCount
  // badge, but myPending/coParentPending (a SEPARATE classifyEventUrgency
  // bucket feeding THIS section) never got the same treatment — the two
  // buckets look similar but are independently derived, so fixing one
  // silently left the other exposed to the identical bug.
  //
  // Each list deduped in its OWN call, not a shared one — dedupeRideSeries'
  // seenSeries set spans every list passed together (fine for two lists
  // that never actually share a seriesId), but myPending/coParentPending
  // are partitioned by ASSIGNEE identity (mine vs the co-parent's), not by
  // occurrence-of-series: the same recurring series could have THIS
  // parent assigned to one future occurrence and the co-parent assigned
  // to a different one, and each side still needs its own soonest-
  // occurrence representative — a shared call would incorrectly let
  // whichever list is processed first suppress the other's legitimate
  // occurrence of the same series.
  const [myHelperEvents] = dedupeRideSeries(myPending);
  const [coParentHelperEvents] = dedupeRideSeries(coParentPending);

  const backlogCount = questPool.length + myAdultQuests.length + othersAdultQuests.length + myHelperEvents.length
    + coParentHelperEvents.length;

  // The next confirmed ride THIS parent is driving today, soonest first —
  // Pick-up Radar's "Up Next" card links to this instead of only ever
  // offering the manual "pick anyone" dispatch modal.
  const myUpcomingRides = todayEvents
    .filter(e => {
      const a = eventAssignee(e);
      // id-based — falls back to name only for an external, non-member
      // assignee with no id at all.
      const isMine = a.id ? a.id === active.id : a.name === active.name;
      return isMine && a.status === 'confirmed' && !!e.memberId
      && hoursUntilEvent(e.date, e.time) >= -0.5;
    })
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  const nextRide = myUpcomingRides[0];
  // pendingReviews (Chore Reviews) intentionally excluded — GreetingHeader
  // already counts those itself via useQuestStore, which reads the same
  // underlying chores array; including it here would double-count.
  const otherAttentionCount = actionCount + backlogCount;

  const handlePullTask = (chore: ChoreTask) => {
    addParentQuest(chore.id, active.id, active.id, 'PULL');
  };

  // Was UTC-today compared against reviewedAt's UTC-timestamp prefix — a
  // chore reviewed at 8pm in a timezone west of UTC has a UTC date already
  // one day ahead, dropping it off "reviewed today" for hours. See
  // choreStore.ts's getChildDashboard for the same class of fix.
  const todayStr = todayLocal();
  const reviewedToday = chores.filter(c => {
    if (c.status !== 'approved' && c.status !== 'auto_approved') return false;
    if (!c.reviewedAt) return false;
    const d = new Date(c.reviewedAt);
    return !isNaN(d.getTime()) && localDateStr(d) === todayStr;
  }).length;
  const pendingCashOuts = getPendingCashOuts();
  const kids = members.filter(m => m.role === 'kid');
  const avgStreak = kids.length > 0
    ? Math.round(kids.reduce((s, k) => s + ((k as any).streak ?? 0), 0) / kids.length)
    : 0;
  const leaderboardKids = [...kids].sort((a, b) =>
    ((b as any).streak ?? 0) - ((a as any).streak ?? 0)
  );

  const pad = { paddingHorizontal: 16 };

  // Order matches the reference mock's Hub sequence — Greeting → Quick
  // Actions → Today's Timeline → Action Needed → Household Backlog →
  // Pick-up Radar — with Family Cube's own sections (not present in the
  // mock at all) placed next to whichever mock section they're closest
  // to in spirit: AlertBanner right after Greeting (urgency-first, same
  // position it already had), HouseholdSnapshotCard right after Quick
  // Actions (a stats/summary block), GpCanHelpSection right after Action
  // Needed (both are "needs a decision" sections), ChoreReviewSection
  // right after Household Backlog (both are chore/task related).
  return (
    <>
      <GreetingHeader colors={colors} isDark={isDark} activeMember={active} otherAttentionCount={otherAttentionCount} />

      {showTrialNag && <TrialNagBanner colors={colors} isDark={isDark} />}

      {/* rejectedEvents/pendingNoResponseEvents/unassignedUrgentEvents were
          dropped from here — those 3 card types duplicated
          ActionNeededSection's own RideRequestCard/RideRequiredEventCard
          (same unconfirmed/unassigned ride, shown twice with two different
          card designs and two different action sets). AlertBanner now only
          covers what ActionNeededSection doesn't: scheduling conflicts and
          confirmed-but-never-dispatched trips. */}
      {showBanner && (
        <AlertBanner
          conflictEvents={conflictEvents}
          neverDispatchedEvents={neverDispatchedOverdue}
          conflictReasons={conflictReasons}
          members={members} colors={colors} isDark={isDark} updateEvent={updateEvent}
          activeName={active.name} activeMemberId={active.id}
          onDispatch={onDispatchDirect}
        />
      )}

      <ParentQuickActions colors={colors} isDark={isDark} groceryCount={groceryItems.length} onScanFlyer={onScanFlyer}
        onAddTask={() => setShowTaskComposer(true)} />

      <TodayView
        colors={colors}
        isDark={isDark}
        activeMember={active}
        members={members}
        onAddQuest={() => setShowAddTask(true)}
        onAddEvent={() => setShowAddEvent(true)}
        onAddGrocery={() => router.push('/(tabs)/grocery' as any)}
        conflictReasons={conflictReasons}
        otherParentsWorkToday={otherParentsWorkToday}
      />

      <ActionNeededSection
        actionCount={actionCount}
        pendingRequests={pendingRequests}
        pendingRideRequiredEvents={pendingRideRequiredEvents}
        awaitingApproval={[]}
        pendingKidRequests={pendingKidRequests}
        events={events}
        active={active} members={members} allNames={allNames} colors={colors} isDark={isDark}
        updateEvent={updateEvent} addEvent={addEvent} updateEventScoped={updateEventScoped}
        approveQuest={approveQuest} declineQuest={declineQuest}
        approveRequest={approveRequest} declineRequest={declineRequest}
        toggleGPWelcome={toggleGPWelcome}
        approveItemsAndSync={approveItemsAndSync} rejectItems={rejectItems}
        approveQuestProposal={approveQuestProposalHandler} declineQuestProposal={declineQuestProposalHandler}
      />

      <GpCanHelpSection requests={approvedRideRequests} members={members} colors={colors} isDark={isDark} toggleGPWelcome={toggleGPWelcome} />

      <HouseholdBacklogSection
        active={active} members={members} colors={colors} isDark={isDark}
        questPool={questPool} myAdultQuests={myAdultQuests} othersAdultQuests={othersAdultQuests}
        myDirectPending={myDirectPending} myLockedItems={myLockedItems}
        myOutgoingPending={myOutgoingPending}
        myHelperEvents={myHelperEvents} coParentHelperEvents={coParentHelperEvents}
        systemBIds={systemBIds} parentAssignments={parentAssignments}
        updateQuest={updateQuest} updateEvent={updateEvent} updateEventScoped={updateEventScoped}
        completeParentQuest={completeParentQuest} respondToParentQuest={respondToParentQuest}
        cancelLockedAssignment={cancelLockedAssignment} recallParentQuest={recallParentQuest}
        appreciationPing={appreciationPing} handlePullTask={handlePullTask}
        onAddTask={() => setShowAddTask(true)}
        onDelegate={(choreId, choreTitle) => setDelegateSheet({ choreId, choreTitle })}
        onRespond={(assignmentId, choreTitle, assignedBy, assignedTo) => setPushbackSheet({ assignmentId, choreTitle, assignedBy, assignedTo })}
      />

      <ChoreReviewSection
        active={active} members={members} colors={colors} isDark={isDark}
        chores={chores} pendingReviewsCount={pendingReviews.length}
        approveGrandparentQuestAsParent={approveGrandparentQuestAsParent}
        declineGrandparentQuestAsParent={declineGrandparentQuestAsParent}
        grandparentApproveAndCheer={grandparentApproveAndCheer}
        approveTeenReward={approveTeenReward}
        adjustTeenReward={adjustTeenReward}
        declineTeenReward={declineTeenReward}
        acceptGPOffer={acceptGPOffer}
        declineGPOffer={declineGPOffer}
        approveKidProposedChore={approveKidProposedChore}
        declineKidProposedChore={declineKidProposedChore}
        resolveRedoDispute={resolveRedoDispute}
        flagApprovalForDiscussion={flagApprovalForDiscussion}
        standByApproval={standByApproval}
        requestApprovalReversal={requestApprovalReversal}
        coSignReversal={coSignReversal}
        acknowledgeRecentApproval={acknowledgeRecentApproval}
      />

      {/* Only the driver gets editable controls (ETA slider, Pickup Done) —
          another parent sees the same read-only status view kids/teens/GP
          get, so two parents can't fight over the same trip. */}
      {activeTrip && activeTrip.driverMemberId !== active.id ? (
        <PickupRadarStatus colors={colors} isDark={isDark} activeTrip={activeTrip} />
      ) : (
        <EnRouteBanner
          colors={colors} isDark={isDark}
          members={members} activeMemberId={active.id}
          onDispatchRide={(etaMinutes, memberId) => onDispatchDirect(memberId ?? nextRide?.memberId, etaMinutes, nextRide?.id)}
          onPickupDone={() => activeTrip && onPickupDone(activeTrip.tripId)}
          onCancelTrip={() => activeTrip && onCancelTrip(activeTrip.tripId)}
          nextRide={nextRide ? {
            kidName: members.find(m => m.id === nextRide.memberId)?.name.split(' ')[0] ?? 'Family',
            kidEmoji: members.find(m => m.id === nextRide.memberId)?.emoji,
            title: nextRide.title,
            time: nextRide.time,
            location: nextRide.location,
            hoursUntil: hoursUntilEvent(nextRide.date, nextRide.time),
          } : null}
          activeTrip={activeTrip}
          onUpdateEta={(etaMinutes) => activeTrip && onUpdateEta?.(activeTrip.tripId, etaMinutes)}
        />
      )}

      {/* Every OTHER family member's concurrently-active trip — e.g. the
          other parent driving a different pickup right now. Always
          read-only here regardless of who's driving it, since the slot
          above already covers this parent's own trip (interactive) or the
          single most-relevant other trip (read-only); this covers however
          many MORE trips are active beyond that one. */}
      {otherActiveTrips?.map(trip => (
        <PickupRadarStatus key={trip.tripId} colors={colors} isDark={isDark} activeTrip={trip} />
      ))}

      {/* Family Radar hidden from the Hub — now its own top-level tab
          (FindFam, app/(tabs)/gps.tsx) for parents specifically, so it no
          longer needs a permanent slot on the Hub too. Component/data left
          fully intact, just not rendered here — one-line revert if ever
          wanted back alongside the tab. */}

      {/* Family Leaderboard (HouseholdSnapshotCard) hidden from the Hub per
          explicit request — component/data left fully intact, just not
          rendered, so this is a one-line revert if it's ever wanted back. */}

      <MedicationsCard
        meds={parentMeds} medsTaken={parentMedsTaken} toggleMed={toggleParentMed}
        onAddMed={addParentMed} onRemoveMed={deleteParentMed}
        colors={colors} isDark={isDark} active={active} allMembers={members}
      />

      {/* Scenarios 9.2/9.3 — temporary-approver / caregiver-mode grants. */}
      <View style={pad}>
        <TemporaryApproverCard
          active={active} members={members} colors={colors} isDark={isDark}
          activeGrants={activeApproverGrants}
          grantTemporaryApprover={grantTemporaryApprover}
          revokeTemporaryApprover={revokeTemporaryApprover}
        />
      </View>

      {/* Family Games + Homeowner Notes moved to the end of the page —
          [live-requested: "move family game and this one to the end of
          the page"] — everything above is daily-driver family-management
          content; these two are lower-frequency side features. */}
      <FamilyGamesSection colors={colors} isDark={isDark} />

      <HomeownerNotesSection colors={colors} />

      {/* Parent-facing overview of every kid/teen's school day, separate
          from the general today's timeline above — [live-requested: "add
          the different section at the end of the hub and overview with
          the school schedule if available for all kids with happening
          now badge"]. */}
      <SchoolTodaySection members={members} colors={colors} isDark={isDark} activeName={active.name} activeMemberId={active.id} />

      <PushbackSheet
        target={pushbackSheet} colors={colors} isDark={isDark}
        onClose={() => setPushbackSheet(null)}
        respondToParentQuest={respondToParentQuest}
      />

      {/* Unified "Add Task" quick-action entry point — same
          SmartTaskComposer the Tasks tab's own FAB opens. Its "adjust in
          full form" handoff falls through to the AddQuestModal/
          AddEventModal pair right below via the same addPrefill state the
          voice-intake handoff already uses, so there's one shared manual
          fallback, not a second parallel pair of modals. */}
      <SmartTaskComposer
        visible={showTaskComposer}
        members={members}
        activeMemberId={active.id}
        familyId={(active as any).familyId ?? ''}
        onClose={() => setShowTaskComposer(false)}
        onCreated={() => setShowTaskComposer(false)}
        onOpenFullForm={(kind, prefill) => {
          setShowTaskComposer(false);
          setAddPrefill(prefill);
          if (kind === 'quest') setShowAddTask(true);
          else setShowAddEvent(true);
        }}
      />

      <AddQuestModal
        visible={showAddTask}
        onClose={() => { setShowAddTask(false); setAddPrefill(undefined); }}
        activeMemberId={active.id}
        prefill={addPrefill ? {
          title: addPrefill.title,
          coins: addPrefill.coins,
          assignedToId: addPrefill.memberId,
          photoRequired: addPrefill.photoRequired,
          dueDate: addPrefill.startAt ? addPrefill.startAt.slice(0, 10) : undefined,
        } : undefined}
        initialStep={addPrefill ? 'review' : undefined}
      />

      {/* Same AddEventModal Calendar uses — opened right over the Hub
          instead of navigating away to the Calendar tab, either directly
          (HouseholdBacklog's own trigger) or via the chooser's "Type it"
          below. */}
      <AddEventModal
        visible={showAddEvent}
        onClose={() => { setShowAddEvent(false); setAddPrefill(undefined); }}
        activeMemberId={active.id}
        prefill={addPrefill ? {
          title: addPrefill.title,
          category: addPrefill.category as any,
          memberId: addPrefill.memberId,
          startAt: addPrefill.startAt,
          notes: addPrefill.notes,
        } : undefined}
        // Smart Tasker already detected title/category/who/when by the
        // time it hands off here — restarting at step 1 blank (only the
        // category pre-selected) threw that context away and looked like
        // the parsed data had been dropped entirely (live-reported).
        // TasksScreen.tsx's own AddEventModal call already does this; Hub's
        // separate copy of the same handoff never got the same fix.
        initialStep={addPrefill ? 'review' : undefined}
      />

      <DelegateSheet
        target={delegateSheet} questPool={questPool} members={members} active={active} colors={colors} isDark={isDark}
        onClose={() => setDelegateSheet(null)}
        updateQuest={updateQuest}
        addParentQuest={addParentQuest}
      />
    </>
  );
}
