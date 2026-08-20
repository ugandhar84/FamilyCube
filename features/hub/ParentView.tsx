import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuestStore } from '@/store/choreAdapter';
import { useEventStore } from '@/store/eventStore';
import { useGroceryStore } from '@/store/groceryStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { AddQuestModal } from '@/features/quests/QuestsScreen';
import { AddEventModal } from '@/features/calendar/EventFormModal';
import AddIntakeChooser from '@/components/AddIntakeChooser';
import type { FamilyMember } from '@/store/familyStore';
import { AlertBanner, PickupRadarStatus } from './hubComponents';
import { localToday, hoursUntilEvent, isWorkEvent, minutesBetween } from './hubUtils';
import { TodayView, GreetingHeader } from './TodayView';
import { useChoreStore } from '@/store/choreStore';
import type { ChoreTask } from '@/store/choreStore';

import { ParentQuickActions } from './parent/ParentQuickActions';
import { HouseholdSnapshotCard } from './parent/HouseholdSnapshotCard';
import { FamilyRadarSection } from './parent/FamilyRadarSection';
import { EnRouteBanner } from './parent/EnRouteBanner';
import { ActionNeededSection } from './parent/ActionNeededSection';
import { GpCanHelpSection } from './parent/GpCanHelpSection';
import { HouseholdBacklogSection } from './parent/HouseholdBacklogSection';
import { ChoreReviewSection } from './parent/ChoreReviewSection';
import { PushbackSheet } from './parent/PushbackSheet';
import { DelegateSheet } from './parent/DelegateSheet';

export function ParentView({ active, members, colors, isDark, onScanFlyer, onDispatchDirect, onPickupDone, onCancelTrip, activeTrip, onUpdateEta }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onScanFlyer: () => void;
  // Dispatches immediately, no modal — memberId is nextRide's kid when one
  // is linked, else undefined for a generic "family" broadcast. Matches the
  // mock's plain in-card toggle exactly (no picker ever).
  onDispatchDirect: (memberId: string | undefined, etaMinutes: number) => void;
  onPickupDone: () => void;
  onCancelTrip: () => void;
  activeTrip?: { kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; driverMemberId?: string; etaMinutes: number; startedAtMs?: number } | null;
  onUpdateEta?: (etaMinutes: number) => void;
}) {
  const { quests, approveQuest, declineQuest, updateQuest } = useQuestStore();
  const { events, updateEvent, addEvent }  = useEventStore();
  const { items: groceryItems, load: loadGrocery, addItem: addGroceryItem } = useGroceryStore();
  const { requests: kidRequests, loaded: kidRequestsLoaded, loadFromStorage: loadKidRequests,
          approveRequest, declineRequest, approveItems, rejectItems, toggleGPWelcome } = useKidRequestStore();

  const {
    parentAssignments, createAndAddParentQuest, addParentQuest,
    respondToParentQuest, completeParentQuest, cancelLockedAssignment, recallParentQuest, appreciationPing, getParentQuestPool,
    getPendingCashOuts, chores, addChore, getParentReviewDeck,
    approveGrandparentQuestAsParent, declineGrandparentQuestAsParent, grandparentApproveAndCheer,
    getMyDirectPending, getMyLockedItems, getMyAccepted, getMyOutgoingPending, getActiveAssignmentChoreIds,
    loadFromStorage: loadChores, syncFromDB: syncChores,
  } = useChoreStore();
  const pendingReviews = getParentReviewDeck();

  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  // Quick-action entry points go through the Speak it/Type it chooser first
  // (matching the existing pet-appointment voice flow) — HouseholdBacklog's
  // own "add task" trigger below still opens the manual quest form directly,
  // since that's a narrower, already-scoped-to-backlog action.
  const [addChooser, setAddChooser] = useState<'event' | 'quest' | null>(null);
  // "Adjust in full form" handoff from VoiceIntakeReviewSheet — seeds
  // whichever manual modal opens next with the AI-extracted fields.
  const [addPrefill, setAddPrefill] = useState<{
    title: string; category?: string; memberId?: string; startAt?: string;
    notes?: string; coins?: number; photoRequired?: boolean;
  } | undefined>(undefined);
  const [pushbackSheet, setPushbackSheet] = useState<{ assignmentId: string; choreTitle: string; assignedBy: string; assignedTo: string } | null>(null);
  const [delegateSheet, setDelegateSheet] = useState<{ choreId: string; choreTitle: string } | null>(null);

  useEffect(() => { loadGrocery((active as any).familyId ?? 'family-1'); }, [(active as any).familyId]);
  useEffect(() => { if (!kidRequestsLoaded) loadKidRequests(); }, [kidRequestsLoaded]);
  // This must run even when the review section starts collapsed. Otherwise a
  // parent who opens the Hub after a grandparent creates a quest never joins
  // the chore realtime channel and cannot see the safety-review request.
  useEffect(() => {
    loadChores().then(() => { void syncChores(); });
  }, [loadChores, syncChores]);

  const allNames  = members.map(m => m.name);
  const today     = localToday();

  // All events today (sorted) — Work events hidden from timeline but used for conflict detection
  const allTodayEvents = events
    .filter(e => e.date === today)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  const workEvents    = allTodayEvents.filter(e => isWorkEvent(e));
  const todayEvents   = allTodayEvents.filter(e => !isWorkEvent(e));

  const pendingRequests  = events.filter(e =>
    e.approvalPending && !isWorkEvent(e) && hoursUntilEvent(e.date, e.time) >= 0
  );
  // pending_approval and pending_grandparent_approval both collapse to the
  // same client-side status (choreAdapter's choreStatusToQuestStatus) — a
  // grandparent_quest awaiting its sponsor's review must NOT show up in the
  // parent's own queue, that review belongs to the grandparent who created it.
  // Quest/chore approvals live ONLY in "Chore Reviews" (ParentReviewDeck) —
  // previously also duplicated here in "Action Needed" with a different
  // card design for the exact same item. actionCount below intentionally
  // excludes these; ChoreReviewSection's own badge covers them.

  const rejectedHelperEvents = todayEvents.filter(e => e.helperStatus === 'rejected');

  // ── Conflict detection ────────────────────────────────────────────────────
  const conflictReasons = new Map<string, string>(); // eventId → reason label
  const upcomingEvents = todayEvents.filter(e => hoursUntilEvent(e.date, e.time) >= 0);

  // A: kid double-booked (same memberId, same date, <30 min, non-Work)
  const timedMemberEvents = upcomingEvents.filter(e => !!e.time && !!e.memberId);
  for (let i = 0; i < timedMemberEvents.length; i++) {
    for (let j = i + 1; j < timedMemberEvents.length; j++) {
      const a = timedMemberEvents[i], b = timedMemberEvents[j];
      if (a.memberId !== b.memberId) continue;
      if (minutesBetween(a.time!, b.time!) < 30) {
        const kidName = members.find(m => m.id === a.memberId)?.name.split(' ')[0] ?? 'Kid';
        const label = `${kidName} double-booked`;
        if (!conflictReasons.has(a.id)) conflictReasons.set(a.id, label);
        if (!conflictReasons.has(b.id)) conflictReasons.set(b.id, label);
      }
    }
  }

  // B: helper/driver double-booked (same helper name, <30 min, not rejected, non-Work)
  const timedHelperEvents = upcomingEvents.filter(e => !!e.time && !!e.helper && e.helperStatus !== 'rejected');
  for (let i = 0; i < timedHelperEvents.length; i++) {
    for (let j = i + 1; j < timedHelperEvents.length; j++) {
      const a = timedHelperEvents[i], b = timedHelperEvents[j];
      if (a.helper !== b.helper) continue;
      if (minutesBetween(a.time!, b.time!) < 30) {
        const label = `${a.helper!.split(' ')[0]} assigned to 2 events`;
        if (!conflictReasons.has(a.id)) conflictReasons.set(a.id, label);
        if (!conflictReasons.has(b.id)) conflictReasons.set(b.id, label);
      }
    }
  }

  // C: family event vs. Work event overlap — only for upcoming work events too
  const upcomingWorkEvents = workEvents.filter(e => hoursUntilEvent(e.date, e.time) >= 0);
  for (const familyEv of timedMemberEvents) {
    for (const workEv of upcomingWorkEvents) {
      if (familyEv.memberId !== workEv.memberId) continue;
      if (!workEv.time) continue;
      if (minutesBetween(familyEv.time!, workEv.time) < 30) {
        const memberName = members.find(m => m.id === familyEv.memberId)?.name.split(' ')[0] ?? 'their';
        if (!conflictReasons.has(familyEv.id)) {
          conflictReasons.set(familyEv.id, `Conflicts with ${memberName}'s work`);
        }
      }
    }
  }

  // D: family event vs. THE OTHER PARENT's work block — e.g. a ride
  // assigned to Alex during a window Alex is actually at work. Distinct
  // from check C, which only catches a kid's own event colliding with a
  // work event for that same person — this catches a helper assignment
  // colliding with the helper's own work schedule.
  const timedHelperAssignments = upcomingEvents.filter(e => !!e.time && !!e.helper && e.helperStatus !== 'rejected');
  for (const familyEv of timedHelperAssignments) {
    const helperMember = members.find(m => m.name === familyEv.helper);
    if (!helperMember) continue;
    for (const workEv of upcomingWorkEvents) {
      if (workEv.memberId !== helperMember.id) continue;
      if (!workEv.time) continue;
      if (minutesBetween(familyEv.time!, workEv.time) < 30) {
        if (!conflictReasons.has(familyEv.id)) {
          conflictReasons.set(familyEv.id, `Conflicts with ${helperMember.name.split(' ')[0]}'s work`);
        }
      }
    }
  }

  // Other parents' Work events today, for the read-only coordination strip
  // on TodayView — never the viewer's own (they don't need to be told about
  // their own work block).
  const otherParentsWorkToday = workEvents
    .filter(e => e.memberId && e.memberId !== active.id)
    .map(e => ({
      id: e.id, title: e.title,
      time: e.time, ownerName: members.find(m => m.id === e.memberId)?.name.split(' ')[0] ?? 'Parent',
    }));

  const conflictEventIds = new Set(conflictReasons.keys());
  const conflictEvents   = todayEvents.filter(e => e.conflict || conflictEventIds.has(e.id));

  // Escalation: helper pending + no response + < 1 hr away
  const pendingNoResponse = todayEvents.filter(e =>
    !!e.helper && e.helperStatus === 'pending' &&
    hoursUntilEvent(e.date, e.time) < 1 && hoursUntilEvent(e.date, e.time) >= 0
  );

  // Escalation: transport event unassigned + < 2 hr away
  const unassignedUrgent = todayEvents.filter(e => {
    if (!e.location || e.approvalPending || e.helper || e.declinedBy) return false;
    if (e.helperStatus === 'rejected') return false;
    const h = hoursUntilEvent(e.date, e.time);
    return h >= 0 && h < 2;
  });

  const urgentRejected = rejectedHelperEvents.filter(ev => {
    const h = hoursUntilEvent(ev.date, ev.time);
    return h >= 0 && h < 4;
  });
  const showBanner     = conflictEvents.length > 0 || urgentRejected.length > 0 ||
                         pendingNoResponse.length > 0 || unassignedUrgent.length > 0;
  const pendingKidRequests = kidRequests.filter(r => {
    if (r.status !== 'pending') return false;
    // Auto-expire checkin requests older than 2 hours
    if (r.type === 'checkin') {
      const ageHours = (Date.now() - new Date(r.requestedAt).getTime()) / 3_600_000;
      if (ageHours > 2) return false;
    }
    // Hide grocery/supplies delegation cards that have no items — nothing
    // actionable to show. A cash-out request is ALSO type 'delegation' but
    // is plain text with no items by design (see TeenView's requestCashOut)
    // — this filter used to drop those silently before they ever reached
    // the parent's Action Needed feed at all.
    if (r.type === 'delegation' && (r.items?.length ?? 0) === 0 && !r.detail.startsWith('💵')) return false;
    return true;
  });
  // Approved ride/help requests still pending a helper — parent can flag these for GP
  const approvedRideRequests = kidRequests.filter(r =>
    r.status === 'approved' &&
    ['ride', 'tutor', 'cheer'].includes(r.type) &&
    !r.assignedHelper
  );
  const actionCount = pendingRequests.length + pendingKidRequests.length;

  const familyId = (active as any).familyId ?? 'family-1';

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

  // Split adult quests: mine (assigned to me), others' (assigned to someone else), unassigned (pool)
  const myAdultQuests       = adultQuests.filter(q => q.assignedToId === active.id);
  const othersAdultQuests   = adultQuests.filter(q => q.assignedToId && q.assignedToId !== active.id);
  const unassignedAdultQ    = adultQuests.filter(q => !q.assignedToId);

  const choreIds         = new Set(chorePool.map(c => c.id));
  // A chore with ANY live System-A assignment row — PENDING, SNOOZED,
  // ACCEPTED, or locked/PARKED — must never also show up in the open pool
  // with "Take it/Delegate" actions. It used to only exclude locked chores,
  // which let anyone "Take It" out from under a pending DIRECT assignment:
  // the original assignee could then tap Accept later and silently
  // reassign the chore back to themselves, clobbering whoever just grabbed
  // it, since the two systems never checked each other.
  const activeAssignmentChoreIds = getActiveAssignmentChoreIds();
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
  const myAccepted        = getMyAccepted(active.id);
  const myOutgoingPending = getMyOutgoingPending(active.id);
  // Calendar events where this parent is the assigned helper/driver — show in HB.
  // Backlog is for things still needing action: once confirmed, it's a settled
  // commitment (visible in Schedule instead), not something to pull off a backlog.
  const myHelperEvents = events.filter(e => {
    if (!e.helper || e.helper !== active.name) return false;
    if (e.helperStatus === 'rejected' || e.helperStatus === 'confirmed') return false;
    return (e.date ?? '') >= today;
  });

  const backlogCount = questPool.length + myAdultQuests.length + othersAdultQuests.length + myHelperEvents.length;

  // The next confirmed ride THIS parent is driving today, soonest first —
  // Pick-up Radar's "Up Next" card links to this instead of only ever
  // offering the manual "pick anyone" dispatch modal.
  const myUpcomingRides = todayEvents
    .filter(e => e.helper === active.name && e.helperStatus === 'confirmed' && !!e.memberId
      && hoursUntilEvent(e.date, e.time) >= -0.5)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  const nextRide = myUpcomingRides[0];
  // pendingReviews (Chore Reviews) intentionally excluded — GreetingHeader
  // already counts those itself via useQuestStore, which reads the same
  // underlying chores array; including it here would double-count.
  const otherAttentionCount = actionCount + backlogCount;

  const handlePullTask = (chore: ChoreTask) => {
    addParentQuest(chore.id, active.id, active.id, 'PULL');
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const reviewedToday = chores.filter(c =>
    (c.status === 'approved' || c.status === 'auto_approved') &&
    (c.reviewedAt ?? '').startsWith(todayStr)
  ).length;
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

      {showBanner && (
        <AlertBanner
          conflictEvents={conflictEvents} rejectedEvents={urgentRejected}
          pendingNoResponseEvents={pendingNoResponse} unassignedUrgentEvents={unassignedUrgent}
          conflictReasons={conflictReasons}
          members={members} colors={colors} isDark={isDark} updateEvent={updateEvent}
          activeName={active.name}
        />
      )}

      <ParentQuickActions colors={colors} isDark={isDark} groceryCount={groceryItems.length} onScanFlyer={onScanFlyer}
        onAddQuest={() => setAddChooser('quest')} onAddEvent={() => setAddChooser('event')} />

      <TodayView
        colors={colors}
        isDark={isDark}
        activeMember={active}
        members={members}
        onAddQuest={() => setAddChooser('quest')}
        onAddEvent={() => setAddChooser('event')}
        onAddGrocery={() => router.push('/(tabs)/grocery' as any)}
        conflictReasons={conflictReasons}
        otherParentsWorkToday={otherParentsWorkToday}
      />

      <ActionNeededSection
        actionCount={actionCount}
        pendingRequests={pendingRequests}
        awaitingApproval={[]}
        pendingKidRequests={pendingKidRequests}
        events={events}
        active={active} members={members} allNames={allNames} colors={colors} isDark={isDark}
        updateEvent={updateEvent} addEvent={addEvent}
        approveQuest={approveQuest} declineQuest={declineQuest}
        approveRequest={approveRequest} declineRequest={declineRequest}
        toggleGPWelcome={toggleGPWelcome}
        approveItemsAndSync={approveItemsAndSync} rejectItems={rejectItems}
      />

      <GpCanHelpSection requests={approvedRideRequests} members={members} colors={colors} isDark={isDark} toggleGPWelcome={toggleGPWelcome} />

      <HouseholdBacklogSection
        active={active} members={members} colors={colors} isDark={isDark}
        questPool={questPool} myAdultQuests={myAdultQuests} othersAdultQuests={othersAdultQuests}
        myDirectPending={myDirectPending} myLockedItems={myLockedItems} myAccepted={myAccepted}
        myOutgoingPending={myOutgoingPending}
        myHelperEvents={myHelperEvents} systemBIds={systemBIds} parentAssignments={parentAssignments}
        updateQuest={updateQuest} updateEvent={updateEvent}
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
          onDispatchRide={(etaMinutes, memberId) => onDispatchDirect(memberId ?? nextRide?.memberId, etaMinutes)}
          onPickupDone={onPickupDone}
          onCancelTrip={onCancelTrip}
          nextRide={nextRide ? {
            kidName: members.find(m => m.id === nextRide.memberId)?.name.split(' ')[0] ?? 'Family',
            kidEmoji: members.find(m => m.id === nextRide.memberId)?.emoji,
            title: nextRide.title,
            time: nextRide.time,
            location: nextRide.location,
            hoursUntil: hoursUntilEvent(nextRide.date, nextRide.time),
          } : null}
          activeTrip={activeTrip} onUpdateEta={onUpdateEta}
        />
      )}

      <View style={pad}>
        <FamilyRadarSection members={members} colors={colors} isDark={isDark} />
      </View>

      <View style={pad}>
        <HouseholdSnapshotCard
          colors={colors} isDark={isDark}
          reviewedToday={reviewedToday} avgStreak={avgStreak}
          pendingCashOutsCount={pendingCashOuts.length}
          leaderboardKids={leaderboardKids} allNames={allNames}
        />
      </View>

      <PushbackSheet
        target={pushbackSheet} colors={colors} isDark={isDark}
        onClose={() => setPushbackSheet(null)}
        respondToParentQuest={respondToParentQuest}
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
      />

      {/* "Add Event"/"New Quest" quick actions open this chooser first
          (Speak it / Type it) instead of jumping straight to the manual
          form — matching the existing pet-appointment voice flow. */}
      <AddIntakeChooser
        visible={addChooser !== null}
        kind={addChooser ?? 'event'}
        members={members}
        activeMemberId={active.id}
        onClose={() => setAddChooser(null)}
        onTypeManually={(prefill) => {
          const kind = addChooser;
          setAddChooser(null);
          setAddPrefill(prefill);
          if (kind === 'quest') setShowAddTask(true);
          else setShowAddEvent(true);
        }}
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
