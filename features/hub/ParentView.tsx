import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuestStore } from '@/store/choreAdapter';
import { useEventStore } from '@/store/eventStore';
import { useGroceryStore } from '@/store/groceryStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { AddQuestModal } from '@/features/quests/QuestsScreen';
import type { FamilyMember } from '@/store/familyStore';
import { AlertBanner } from './hubComponents';
import { localToday, hoursUntilEvent, isWorkEvent, minutesBetween } from './hubUtils';
import { TodayView } from './TodayView';
import { useChoreStore } from '@/store/choreStore';
import type { ChoreTask } from '@/store/choreStore';

import { ParentQuickActions } from './parent/ParentQuickActions';
import { HouseholdSnapshotCard } from './parent/HouseholdSnapshotCard';
import { EnRouteBanner } from './parent/EnRouteBanner';
import { ActionNeededSection } from './parent/ActionNeededSection';
import { GpCanHelpSection } from './parent/GpCanHelpSection';
import { HouseholdBacklogSection } from './parent/HouseholdBacklogSection';
import { ChoreReviewSection } from './parent/ChoreReviewSection';
import { PushbackSheet } from './parent/PushbackSheet';
import { DelegateSheet } from './parent/DelegateSheet';

export function ParentView({ active, members, colors, isDark, onScanFlyer, onEnRoute }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onScanFlyer: () => void;
  onEnRoute: () => void;
}) {
  const { quests, approveQuest, declineQuest, updateQuest } = useQuestStore();
  const { events, updateEvent, addEvent }  = useEventStore();
  const { items: groceryItems, load: loadGrocery, addItem: addGroceryItem } = useGroceryStore();
  const { requests: kidRequests, loaded: kidRequestsLoaded, loadFromStorage: loadKidRequests,
          approveRequest, declineRequest, approveItems, rejectItems, toggleGPWelcome } = useKidRequestStore();

  const {
    parentAssignments, createAndAddParentQuest, addParentQuest,
    respondToParentQuest, completeParentQuest, appreciationPing, getParentQuestPool,
    getPendingCashOuts, chores, addChore, getParentReviewDeck,
    approveGrandparentQuestAsParent, declineGrandparentQuestAsParent,
    loadFromStorage: loadChores, syncFromDB: syncChores,
  } = useChoreStore();
  const pendingReviews = getParentReviewDeck();

  const [showAddTask, setShowAddTask] = useState(false);
  const [pushbackSheet, setPushbackSheet] = useState<{ assignmentId: string; choreTitle: string } | null>(null);
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
  const awaitingApproval = quests.filter(q => q.status === 'pending_approval');

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
    // Hide grocery/supplies delegation cards that have no items — nothing actionable to show
    if (r.type === 'delegation' && (r.items?.length ?? 0) === 0) return false;
    return true;
  });
  // Approved ride/help requests still pending a helper — parent can flag these for GP
  const approvedRideRequests = kidRequests.filter(r =>
    r.status === 'approved' &&
    ['ride', 'tutor', 'cheer'].includes(r.type) &&
    !r.assignedHelper
  );
  const actionCount = pendingRequests.length + awaitingApproval.length + pendingKidRequests.length;

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
  // EXCLUDE ride/pickup/dropoff tasks (category === 'Ride') — GP ride tasks go to calendar, not Household Backlog
  const adultQuests = quests.filter(q => {
    if (doneStatuses.has(q.status)) return false;
    if (q.category === 'Ride') return false;
    if (q.isAdultTask) return true;                                          // category_type === 'parent_only_quest' or shopping
    if (q.assignedToId != null && adultMemberIds.has(q.assignedToId)) return true;  // directly assigned to adult (parent/GP)
    return false;
  });

  // Split adult quests: mine (assigned to me), others' (assigned to someone else), unassigned (pool)
  const myAdultQuests       = adultQuests.filter(q => q.assignedToId === active.id);
  const othersAdultQuests   = adultQuests.filter(q => q.assignedToId && q.assignedToId !== active.id);
  const unassignedAdultQ    = adultQuests.filter(q => !q.assignedToId);

  const choreIds         = new Set(chorePool.map(c => c.id));
  // Pool = unassigned adult quests + chore-based pool (no duplicates)
  const questPool        = [
    ...chorePool,
    ...unassignedAdultQ.filter(q => !choreIds.has(q.id)).map(q => ({
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

  // A SNOOZED assignment is rendered nowhere, so once its 48h window lapses it
  // has to fall back into the pending list or the task is lost for good.
  const nowIso           = new Date().toISOString();
  const myDirectPending  = parentAssignments.filter(a =>
    a.assignedTo === active.id && !a.isLocked && !systemBIds.has(a.choreId) &&
    (a.status === 'PENDING' ||
     (a.status === 'SNOOZED' && (!a.snoozeUntil || a.snoozeUntil <= nowIso)))
  );
  const myLockedItems    = parentAssignments.filter(a =>
    a.assignedTo === active.id && a.isLocked && !systemBIds.has(a.choreId)
  );
  const myAccepted       = parentAssignments.filter(a =>
    a.assignedTo === active.id && (a.status === 'ACCEPTED' || a.status === 'IN_PROGRESS') && !systemBIds.has(a.choreId)
  );
  // Calendar events where this parent is the assigned helper/driver — show in HB.
  // Backlog is for things still needing action: once confirmed, it's a settled
  // commitment (visible in Schedule instead), not something to pull off a backlog.
  const myHelperEvents = events.filter(e => {
    if (!e.helper || e.helper !== active.name) return false;
    if (e.helperStatus === 'rejected' || e.helperStatus === 'confirmed') return false;
    return (e.date ?? '') >= today;
  });

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

  return (
    <>
      <TodayView
        colors={colors}
        isDark={isDark}
        activeMember={active}
        members={members}
        onAddQuest={() => router.push('/(tabs)/quests')}
        onAddEvent={() => router.push('/(tabs)/calendar')}
        onAddGrocery={() => router.push('/(tabs)/grocery' as any)}
      />

      {showBanner && (
        <AlertBanner
          conflictEvents={conflictEvents} rejectedEvents={urgentRejected}
          pendingNoResponseEvents={pendingNoResponse} unassignedUrgentEvents={unassignedUrgent}
          conflictReasons={conflictReasons}
          members={members} colors={colors} isDark={isDark} updateEvent={updateEvent}
        />
      )}

      <ParentQuickActions colors={colors} isDark={isDark} groceryCount={groceryItems.length} onScanFlyer={onScanFlyer} />

      <View style={pad}>
        <HouseholdSnapshotCard
          colors={colors} isDark={isDark}
          reviewedToday={reviewedToday} avgStreak={avgStreak}
          pendingCashOutsCount={pendingCashOuts.length}
          leaderboardKids={leaderboardKids} allNames={allNames}
        />
      </View>

      <View style={pad}>
        <EnRouteBanner colors={colors} isDark={isDark} onEnRoute={onEnRoute} />
      </View>

      <ActionNeededSection
        actionCount={actionCount}
        pendingRequests={pendingRequests}
        awaitingApproval={awaitingApproval}
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
        myHelperEvents={myHelperEvents} systemBIds={systemBIds} parentAssignments={parentAssignments}
        updateQuest={updateQuest} updateEvent={updateEvent}
        completeParentQuest={completeParentQuest} respondToParentQuest={respondToParentQuest}
        appreciationPing={appreciationPing} handlePullTask={handlePullTask}
        onAddTask={() => setShowAddTask(true)}
        onDelegate={(choreId, choreTitle) => setDelegateSheet({ choreId, choreTitle })}
        onRespond={(assignmentId, choreTitle) => setPushbackSheet({ assignmentId, choreTitle })}
      />

      <PushbackSheet
        target={pushbackSheet} colors={colors} isDark={isDark}
        onClose={() => setPushbackSheet(null)}
        respondToParentQuest={respondToParentQuest}
      />

      <AddQuestModal
        visible={showAddTask}
        onClose={() => setShowAddTask(false)}
        activeMemberId={active.id}
      />

      <ChoreReviewSection
        active={active} members={members} colors={colors} isDark={isDark}
        chores={chores} pendingReviewsCount={pendingReviews.length}
        approveGrandparentQuestAsParent={approveGrandparentQuestAsParent}
        declineGrandparentQuestAsParent={declineGrandparentQuestAsParent}
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
